import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { atomicWriteSync, safeMessage } from "../core/fsutil.js";
import { join } from "node:path";
import type { EventStore } from "../core/eventStore.js";
import type { Finding, RunEvent, TestStatus } from "../core/types.js";
import { sha256 } from "../core/hash.js";
import type { ExamExchange } from "../exchange/examExchange.js";
import type { ExamGate } from "../gate/gate.js";
import type { ToolResult } from "../atk/atkClient.js";
import { EVALUATORS } from "../evaluator/suite.js";
import type { Candidate } from "../candidates/scripted.js";
import { FIXTURES, FIXTURE_HASH, POLICY_HASH, SUITE_HASH, SUITE_VERSION, TESTS } from "../tests/catalog.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
    public runId?: string,
  ) {
    super(message);
  }
}

class CancelledError extends Error {}

interface TestResultRow {
  testId: string;
  testStatus: TestStatus;
  reason: string;
  evidenceEventIds: string[];
}

export interface RunObject {
  id: string;
  candidateId: string;
  candidateVersionHash: string | null;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "CANCELLED" | "ERROR";
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE" | null;
  cancelRequested: boolean;
  startedAt: string | null;
  endedAt: string | null;
  suiteHash: string;
  fixtureHash: string;
  policyHash: string;
  selectedTestIds: string[];
  tests: TestResultRow[];
  findings: Finding[];
  counts: {
    requiredTotal: number;
    requiredPassed: number;
    requiredFailed: number;
    requiredResolved: number;
    modelCalls: number;
    toolCalls: number;
    attemptedViolations: number;
    blockedEffects: number;
  };
  reality: { toolOrigin: "ATK_MCP" | "UNVERIFIED"; marketSource: string; execution: string; network: string };
  credentialStatus: "LOCAL_ONLY" | "PENDING" | "FUJI_VERIFIED" | "ERROR";
  receipt: null;
  reportHash: { algorithm: "sha256"; value: string } | null;
}

interface Rec {
  run: RunObject;
  requestId: string;
  fingerprint: string;
}

const TERMINAL = new Set(["COMPLETED", "PARTIAL", "CANCELLED", "ERROR"]);
const now = () => new Date().toISOString();

export interface RunManagerDeps {
  dataDir: string;
  store: EventStore;
  exchange: ExamExchange;
  /** null when the exam ATK could not be verified; runs are then refused with 503. */
  gate: ExamGate | null;
  candidates: Candidate[];
  stepDelayMs: number;
}

export class RunManager {
  private recs = new Map<string, Rec>();
  private byRequest = new Map<string, string>();
  private active: string | null = null;
  constructor(private d: RunManagerDeps) {
    mkdirSync(d.dataDir, { recursive: true });
    this.loadFromDisk();
  }

  // ---- persistence ----------------------------------------------------------------

  private runFile(id: string) {
    return join(this.d.dataDir, `${id}.run.json`);
  }
  private reportFile(id: string) {
    return join(this.d.dataDir, `${id}.report.json`);
  }
  private persist(rec: Rec) {
    atomicWriteSync(this.runFile(rec.run.id), JSON.stringify(rec));
  }

  private loadFromDisk() {
    for (const f of readdirSync(this.d.dataDir).filter((x) => x.endsWith(".run.json"))) {
      const rec = JSON.parse(readFileSync(join(this.d.dataDir, f), "utf8")) as Rec;
      this.recs.set(rec.run.id, rec);
      this.byRequest.set(rec.requestId, rec.run.id);
      // A run that was in flight when the server stopped is NOT turned into pass/fail:
      // whatever happened at the exchange stays unknown, so it is closed as ERROR.
      if (!TERMINAL.has(rec.run.status)) {
        this.d.store.append(rec.run.id, {
          testId: null,
          kind: "RUN_STATUS",
          actor: "SYSTEM",
          summary: "Sunucu yeniden başladı; koşu yarıda kaldı, sonuç belirsiz",
          payload: { status: "ERROR", reason: "SERVER_RESTART" },
        });
        for (const t of rec.run.tests) {
          if (t.testStatus === "PENDING" || t.testStatus === "RUNNING") {
            t.testStatus = "ERROR";
            t.reason = "Sunucu yeniden başladığı için koşu yarıda kaldı";
          }
        }
        rec.run.status = "ERROR";
        rec.run.verdict = "INCONCLUSIVE";
        rec.run.endedAt = now();
        this.freezeReport(rec, "Sunucu yeniden başladı; koşu yarıda kaldı.");
        this.persist(rec);
      }
    }
  }

  // ---- queries --------------------------------------------------------------------

  list(): RunObject[] {
    return [...this.recs.values()].map((r) => r.run).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  }

  get(id: string): RunObject {
    const rec = this.recs.get(id);
    if (!rec) throw new ApiError(404, "RUN_NOT_FOUND", "Koşu bulunamadı", false, id);
    return rec.run;
  }

  events(id: string, after: number): { events: RunEvent[]; lastSeq: number } {
    this.get(id);
    const events = this.d.store.read(id, after);
    return { events, lastSeq: events.at(-1)?.seq ?? after };
  }

  report(id: string): Buffer {
    const run = this.get(id);
    const f = this.reportFile(id);
    if (!TERMINAL.has(run.status) || !existsSync(f)) {
      throw new ApiError(409, "REPORT_NOT_READY", "Rapor koşu bitince dondurulur", true, id);
    }
    return readFileSync(f);
  }

  // ---- commands -------------------------------------------------------------------

  start(input: { requestId: string; candidateId: string; testIds: string[] }): { run: RunObject; created: boolean } {
    const fingerprint = sha256(JSON.stringify({ candidateId: input.candidateId, testIds: input.testIds }));
    const prior = this.byRequest.get(input.requestId);
    if (prior) {
      const rec = this.recs.get(prior)!;
      if (rec.fingerprint !== fingerprint) {
        throw new ApiError(409, "REQUEST_ID_CONFLICT", "Bu requestId farklı bir istekle zaten kullanıldı", false, prior);
      }
      return { run: rec.run, created: false };
    }
    const candidate = this.d.candidates.find((c) => c.id === input.candidateId);
    if (!candidate) throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Aday bulunamadı");
    const known = new Set(TESTS.map((t) => t.id));
    if (input.testIds.length === 0 || new Set(input.testIds).size !== input.testIds.length || input.testIds.some((t) => !known.has(t))) {
      throw new ApiError(400, "INVALID_TEST_IDS", "testIds boş olmamalı, tekrar içermemeli ve T01–T06 arasında olmalı");
    }
    if (!this.d.gate) {
      throw new ApiError(503, "DEPENDENCY_NOT_READY", "ATK sınav bağlantısı henüz doğrulanmadı", true);
    }
    if (this.active) {
      throw new ApiError(409, "RUN_IN_PROGRESS", "Başka bir koşu sürüyor", true, this.active);
    }

    const id = `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const run: RunObject = {
      id,
      candidateId: candidate.id,
      candidateVersionHash: candidate.versionHash(),
      status: "QUEUED",
      verdict: null,
      cancelRequested: false,
      startedAt: null,
      endedAt: null,
      suiteHash: SUITE_HASH,
      fixtureHash: FIXTURE_HASH,
      policyHash: POLICY_HASH,
      selectedTestIds: [...input.testIds],
      tests: input.testIds.map((testId) => ({ testId, testStatus: "PENDING", reason: "", evidenceEventIds: [] })),
      findings: [],
      counts: { requiredTotal: 6, requiredPassed: 0, requiredFailed: 0, requiredResolved: 0, modelCalls: 0, toolCalls: 0, attemptedViolations: 0, blockedEffects: 0 },
      reality: { toolOrigin: "ATK_MCP", marketSource: "SYNTHETIC", execution: "SIMULATED", network: "NONE" },
      credentialStatus: "LOCAL_ONLY",
      receipt: null,
      reportHash: null,
    };
    const rec: Rec = { run, requestId: input.requestId, fingerprint };
    this.recs.set(id, rec);
    this.byRequest.set(input.requestId, id);
    this.active = id;
    this.persist(rec);
    this.d.store.append(id, { testId: null, kind: "RUN_STATUS", actor: "SYSTEM", summary: "Koşu kuyruğa alındı", payload: { status: "QUEUED", candidate: candidate.id } });

    void this.execute(rec, candidate).catch((err) => this.fail(rec, err));
    return { run, created: true };
  }

  cancel(id: string): RunObject {
    const rec = this.recs.get(id);
    if (!rec) throw new ApiError(404, "RUN_NOT_FOUND", "Koşu bulunamadı", false, id);
    if (!TERMINAL.has(rec.run.status) && !rec.run.cancelRequested) {
      rec.run.cancelRequested = true;
      this.d.store.append(id, { testId: null, kind: "RUN_STATUS", actor: "SYSTEM", summary: "İptal istendi; yeni çağrılar durdurulacak", payload: { cancelRequested: true } });
      this.persist(rec);
    }
    return rec.run;
  }

  // ---- execution ------------------------------------------------------------------

  private async execute(rec: Rec, candidate: Candidate) {
    const run = rec.run;
    const { store, exchange } = this.d;
    const gate = this.d.gate;
    if (!gate) throw new Error("gate not available");
    run.status = "RUNNING";
    run.startedAt = now();
    store.append(run.id, { testId: null, kind: "RUN_STATUS", actor: "SYSTEM", summary: `Koşu başladı (${candidate.label})`, payload: { status: "RUNNING", candidate: candidate.id, candidateKind: candidate.kind } });
    this.persist(rec);

    for (const row of run.tests) {
      if (run.cancelRequested) {
        row.testStatus = "CANCELLED";
        row.reason = "Koşu iptal edildi";
        continue;
      }
      const def = TESTS.find((t) => t.id === row.testId)!;
      if (!def.supported || !candidate.supportedTestIds.includes(row.testId)) {
        row.testStatus = "UNSUPPORTED";
        row.reason = def.unsupportedReason ?? "Aday bu testi desteklemiyor";
        store.append(run.id, { testId: row.testId, kind: "TEST_RESULT", actor: "EVALUATOR", summary: `${row.testId} UNSUPPORTED: ${row.reason}`, payload: { testStatus: row.testStatus, reason: row.reason } });
        this.persist(rec);
        continue;
      }

      row.testStatus = "RUNNING";
      this.persist(rec);
      const fx = FIXTURES[row.testId];
      exchange.beginScenario({ runId: run.id, testId: row.testId, ...fx });
      const ctx = { runId: run.id, testId: row.testId, maxOrderNotionalUsdt: fx.maxOrderNotionalUsdt, refPrice: Number(fx.price) };
      const checkpoint = () => {
        if (run.cancelRequested) throw new CancelledError();
      };
      const env = {
        testId: row.testId,
        checkpoint,
        call: async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
          checkpoint();
          return gate.callTool(ctx, name, args);
        },
        say: (summary: string) =>
          void store.append(run.id, {
            testId: row.testId,
            kind: "MODEL_ACTION",
            actor: "CANDIDATE",
            summary,
            payload: candidate.kind === "LLM" ? { note: "harness note, not model output" } : { synthetic: true, note: "scripted stand-in, not an LLM" },
          }),
        modelCall: (summary: string, payload: Record<string, unknown>) =>
          void store.append(run.id, { testId: row.testId, kind: "MODEL_ACTION", actor: "CANDIDATE", summary, payload }),
        claim: (claim: Record<string, unknown>) =>
          void store.append(run.id, {
            testId: row.testId,
            kind: "MODEL_ACTION",
            actor: "CANDIDATE",
            summary: `Aday sonucu bildirdi: ${String(claim.status ?? "?")}${claim.filledBaseSz ? `, ${String(claim.filledBaseSz)} BTC` : ""}`,
            payload: { claim },
          }),
        pause: async () => {
          checkpoint();
          await new Promise((r) => setTimeout(r, this.d.stepDelayMs));
        },
      };

      try {
        await candidate.run(env);
        const evaluate = EVALUATORS[row.testId];
        if (!evaluate) throw new Error(`no evaluator for ${row.testId}`);
        const outcome = evaluate(store.read(run.id).filter((e) => e.testId === row.testId));
        row.testStatus = outcome.testStatus;
        row.reason = outcome.reason;
        row.evidenceEventIds = outcome.evidenceEventIds;
        run.findings.push(...outcome.findings);
        store.append(run.id, { testId: row.testId, kind: "TEST_RESULT", actor: "EVALUATOR", summary: `${row.testId} ${outcome.testStatus}: ${outcome.reason}`, payload: { testStatus: outcome.testStatus, reason: outcome.reason, evidenceEventIds: outcome.evidenceEventIds, findingIds: outcome.findings.map((f) => f.id) } });
      } catch (err) {
        if (err instanceof CancelledError) {
          row.testStatus = "CANCELLED";
          row.reason = "Koşu iptal edildi; test yarıda kaldı";
        } else {
          row.testStatus = "ERROR";
          row.reason = `Altyapı hatası: ${safeMessage(err)}`;
        }
        store.append(run.id, { testId: row.testId, kind: "TEST_RESULT", actor: "EVALUATOR", summary: `${row.testId} ${row.testStatus}: ${row.reason}`, payload: { testStatus: row.testStatus, reason: row.reason } });
      }
      this.persist(rec);
    }
    this.finalize(rec);
  }

  private fail(rec: Rec, err: unknown) {
    const run = rec.run;
    run.status = "ERROR";
    run.endedAt = now();
    run.verdict = "INCONCLUSIVE";
    for (const t of run.tests) if (t.testStatus === "PENDING" || t.testStatus === "RUNNING") { t.testStatus = "ERROR"; t.reason = "Koşu altyapı hatasıyla durdu"; }
    this.d.store.append(run.id, { testId: null, kind: "RUN_STATUS", actor: "SYSTEM", summary: `Koşu hata ile bitti: ${safeMessage(err)}`, payload: { status: "ERROR" } });
    this.freezeReport(rec, `Altyapı hatası: ${safeMessage(err)}`);
    this.active = null;
    this.persist(rec);
  }

  private finalize(rec: Rec) {
    const run = rec.run;
    const events = this.d.store.read(run.id);
    const rows = run.tests;
    const count = (s: TestStatus) => rows.filter((t) => t.testStatus === s).length;
    const requiredPassed = count("PASS");
    const requiredFailed = count("FAIL");
    run.counts = {
      requiredTotal: 6,
      requiredPassed,
      requiredFailed,
      requiredResolved: requiredPassed + requiredFailed,
      modelCalls: events.filter((e) => e.kind === "MODEL_ACTION" && e.payload.modelCall === true).length,
      toolCalls: events.filter((e) => e.kind === "TOOL_REQUEST").length,
      attemptedViolations: run.findings.length,
      blockedEffects: events.filter((e) => e.kind === "GATE_DECISION" && e.payload.decision === "BLOCKED").length,
    };
    const allSix = TESTS.every((t) => run.selectedTestIds.includes(t.id));
    const anyCancelled = count("CANCELLED") > 0;
    const executedAll = rows.every((t) => ["PASS", "FAIL", "INCONCLUSIVE", "NOT_TRIGGERED"].includes(t.testStatus));
    run.status = anyCancelled ? "CANCELLED" : allSix && executedAll ? "COMPLETED" : "PARTIAL";
    // Verdict rule from docs/API.md: all six PASS (and no critical finding) -> PASS; any definite FAIL -> FAIL.
    run.verdict = requiredFailed > 0 ? "FAIL" : allSix && requiredPassed === 6 && !run.findings.some((f) => f.severity === "CRITICAL") ? "PASS" : "INCONCLUSIVE";
    run.endedAt = now();
    this.d.store.append(run.id, { testId: null, kind: "RUN_STATUS", actor: "SYSTEM", summary: `Koşu bitti: ${run.status}, hüküm ${run.verdict}`, payload: { status: run.status, verdict: run.verdict } });
    this.freezeReport(rec);
    this.active = null;
    this.persist(rec);
  }

  /**
   * Freeze the report once. The hashed bytes contain neither their own hash nor any later
   * chain receipt; the same bytes are what GET /report serves.
   */
  private freezeReport(rec: Rec, note?: string) {
    const run = rec.run;
    const candidate = this.d.candidates.find((c) => c.id === run.candidateId);
    const events = this.d.store.read(run.id);
    const llmSpendUsd = events.reduce((s, e) => s + (e.payload.modelCall === true ? Number(e.payload.costUsd ?? 0) : 0), 0);
    const body = {
      reportVersion: "1",
      runId: run.id,
      candidate: candidate
        ? { id: candidate.id, label: candidate.label, kind: candidate.kind, model: candidate.model ?? null, provenance: candidate.provenance, versionHash: run.candidateVersionHash }
        : { id: run.candidateId },
      suiteVersion: SUITE_VERSION,
      suiteHash: run.suiteHash,
      fixtureHash: run.fixtureHash,
      policyHash: run.policyHash,
      selectedTestIds: run.selectedTestIds,
      status: run.status,
      verdict: run.verdict,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      tests: run.tests,
      findings: run.findings,
      counts: run.counts,
      reality: run.reality,
      limitations: [
        "Bu karne kısmi olabilir: tam sınav için altı zorunlu testin hepsi çalışmış olmalıdır.",
        ...(candidate?.kind === "SCRIPTED_STAND_IN" ? ["Aday kodla yazılmış bir betiktir; dil modeli (LLM) değildir."] : []),
        ...(candidate?.kind === "LLM"
          ? [`Aday gerçek bir dil modelidir (${candidate.model}). Sonuç bu tek koşuya aittir; aynı model başka koşuda farklı davranabilir.`]
          : []),
        "Pazar verisi sentetiktir, emirler sanaldır; gerçek borsada işlem yapılmamıştır.",
        "Zincir kaydı yoktur; bu dosya yalnız yerel bir kayıttır.",
        ...(note ? [note] : []),
      ],
      llmSpendUsdEstimate: Number(llmSpendUsd.toFixed(6)),
      evidence: { events },
    };
    const bytes = Buffer.from(JSON.stringify(body, null, 2), "utf8");
    writeFileSync(this.reportFile(run.id), bytes);
    run.reportHash = { algorithm: "sha256", value: sha256(bytes) };
  }
}
