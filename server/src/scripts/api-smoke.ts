// Acceptance checks against the REAL HTTP API (loopback). Boots the app on a scratch data dir.
// Candidates used here are scripted stand-ins, so this proves the pipeline, not LLM behaviour.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApp } from "../app.js";

const API = 8787;
const dataDir = mkdtempSync(join(tmpdir(), "prova-smoke-"));
const app = await startApp({ apiPort: API, exchangePort: 18999, dataDir, stepDelayMs: 150 });
const base = `http://127.0.0.1:${API}`;

let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  if (!cond) failed++;
};
const call = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  let json: any = null;
  try { json = JSON.parse(buf.toString("utf8")); } catch { /* raw */ }
  return { status: r.status, json, buf };
};
const waitDone = async (runId: string) => {
  for (let i = 0; i < 80; i++) {
    const { json } = await call("GET", `/api/runs/${runId}`);
    if (["COMPLETED", "PARTIAL", "CANCELLED", "ERROR"].includes(json.run.status)) return json.run;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("run did not finish");
};
let n = 0;
const rid = () => `smoke-${Date.now().toString(36)}-${n++}`;

try {
  const h = await call("GET", "/api/health");
  check("health: atkExam VERIFIED by a real call", h.json.capabilities.atkExam.status === "VERIFIED", h.json.capabilities.atkExam.message);
  check("health: llm NOT_CONFIGURED (no model call was made)", h.json.capabilities.llm.status === "NOT_CONFIGURED");

  const t = await call("GET", "/api/tests");
  check("tests: only T03 supported, others UNSUPPORTED", t.json.tests.filter((x: any) => x.supported).map((x: any) => x.id).join() === "T03");

  const c = await call("GET", "/api/candidates");
  check("candidates: 3 scripted stand-ins, labelled", c.json.candidates.length === 3 && c.json.candidates.every((x: any) => x.label.includes("LLM değil")));

  // --- bad candidate: resubmits -> FAIL, gate blocks, only 1 POST reaches the exchange
  const reqBad = rid();
  const start = await call("POST", "/api/runs", { requestId: reqBad, candidateId: "scripted-resubmit", testIds: ["T03"] });
  check("POST /runs -> 202, status QUEUED or RUNNING (run starts immediately)", start.status === 202 && ["QUEUED", "RUNNING"].includes(start.json.status), start.json.status);
  const again = await call("POST", "/api/runs", { requestId: reqBad, candidateId: "scripted-resubmit", testIds: ["T03"] });
  check("same requestId+content -> same run (idempotent)", again.json.runId === start.json.runId);
  const conflict = await call("POST", "/api/runs", { requestId: reqBad, candidateId: "scripted-silent", testIds: ["T03"] });
  check("same requestId, different content -> 409 REQUEST_ID_CONFLICT", conflict.status === 409 && conflict.json.error.code === "REQUEST_ID_CONFLICT");
  const busy = await call("POST", "/api/runs", { requestId: rid(), candidateId: "scripted-silent", testIds: ["T03"] });
  check("second run while active -> 409 RUN_IN_PROGRESS", busy.status === 409 && busy.json.error.code === "RUN_IN_PROGRESS");
  const early = await call("GET", `/api/runs/${start.json.runId}/report`);
  check("report before the end -> 409 REPORT_NOT_READY", early.status === 409 && early.json.error.code === "REPORT_NOT_READY");

  const bad = await waitDone(start.json.runId);
  check("bad candidate: T03 FAIL", bad.tests[0].testStatus === "FAIL", bad.tests[0].reason);
  check("bad candidate: run PARTIAL (1 of 6 tests), verdict FAIL", bad.status === "PARTIAL" && bad.verdict === "FAIL");
  check("bad candidate: finding CRITICAL, evidence ids exist in events", await (async () => {
    const ev = (await call("GET", `/api/runs/${bad.id}/events?after=0`)).json.events;
    const ids = new Set(ev.map((e: any) => e.id));
    return bad.findings.length === 1 && bad.findings[0].severity === "CRITICAL" && bad.findings[0].evidenceEventIds.every((i: string) => ids.has(i));
  })());
  check("bad candidate: 1 blocked effect, 1 attempted violation", bad.counts.blockedEffects === 1 && bad.counts.attemptedViolations === 1);
  check("counts: requiredTotal stays 6, resolved 1", bad.counts.requiredTotal === 6 && bad.counts.requiredResolved === 1);

  const ev = (await call("GET", `/api/runs/${bad.id}/events?after=0`)).json;
  const seqs = ev.events.map((e: any) => e.seq);
  check("events: seq strictly increasing from 1, lastSeq correct", seqs.every((s: number, i: number) => s === i + 1) && ev.lastSeq === seqs.at(-1));
  const posts = ev.events.filter((e: any) => e.kind === "LEDGER_EVENT" && e.payload.http?.method === "POST" && e.payload.http?.path === "/api/v5/trade/order");
  check("exchange saw exactly 1 POST /trade/order (second order never reached it)", posts.length === 1);
  const empty = (await call("GET", `/api/runs/${bad.id}/events?after=${ev.lastSeq}`)).json;
  check("events after lastSeq -> empty list, lastSeq unchanged", empty.events.length === 0 && empty.lastSeq === ev.lastSeq);
  check("events?after=abc -> 400", (await call("GET", `/api/runs/${bad.id}/events?after=abc`)).status === 400);

  const rep = await call("GET", `/api/runs/${bad.id}/report`);
  const hash = createHash("sha256").update(rep.buf).digest("hex");
  check("report: served bytes hash equals run.reportHash", hash === bad.reportHash?.value, hash.slice(0, 16) + "…");
  check("report: contains no own hash / receipt, states limitations", !rep.buf.toString().includes(hash) && rep.json.limitations.length >= 3 && !("receipt" in rep.json));

  // --- good candidate
  const good = await waitDone((await call("POST", "/api/runs", { requestId: rid(), candidateId: "scripted-query-first", testIds: ["T03"] })).json.runId);
  check("good candidate: T03 PASS, verdict INCONCLUSIVE (5 tests not run)", good.tests[0].testStatus === "PASS" && good.verdict === "INCONCLUSIVE", `verdict=${good.verdict}`);

  // --- silent candidate
  const silent = await waitDone((await call("POST", "/api/runs", { requestId: rid(), candidateId: "scripted-silent", testIds: ["T03"] })).json.runId);
  check("silent candidate: T03 INCONCLUSIVE (not PASS)", silent.tests[0].testStatus === "INCONCLUSIVE");

  // --- all six selected: unsupported tests must show UNSUPPORTED, never a fake 6/6
  const all = await waitDone((await call("POST", "/api/runs", { requestId: rid(), candidateId: "scripted-query-first", testIds: ["T01", "T02", "T03", "T04", "T05", "T06"] })).json.runId);
  check("six selected: 5 UNSUPPORTED, T03 PASS, status PARTIAL, verdict INCONCLUSIVE, requiredPassed 1",
    all.tests.filter((x: any) => x.testStatus === "UNSUPPORTED").length === 5 && all.status === "PARTIAL" && all.verdict === "INCONCLUSIVE" && all.counts.requiredPassed === 1);

  // --- cancel
  const c1 = (await call("POST", "/api/runs", { requestId: rid(), candidateId: "scripted-resubmit", testIds: ["T03"] })).json.runId;
  await new Promise((r) => setTimeout(r, 200));
  const cx = await call("POST", `/api/runs/${c1}/cancel`, {});
  const cx2 = await call("POST", `/api/runs/${c1}/cancel`, {});
  check("cancel: idempotent, cancelRequested visible", cx.json.cancelRequested === true && cx2.status === 200);
  const cancelled = await waitDone(c1);
  check("cancel: ends CANCELLED, test not scored as pass", cancelled.status === "CANCELLED" && cancelled.tests[0].testStatus === "CANCELLED");

  // --- input validation
  check("unknown candidate -> 404", (await call("POST", "/api/runs", { requestId: rid(), candidateId: "nope", testIds: ["T03"] })).status === 404);
  check("unknown test id -> 400", (await call("POST", "/api/runs", { requestId: rid(), candidateId: "scripted-silent", testIds: ["T99"] })).status === 400);
  check("bad JSON -> 400", (await fetch(base + "/api/runs", { method: "POST", body: "{nope" })).status === 400);
  check("unknown run -> 404", (await call("GET", "/api/runs/run_missing")).status === 404);
  check("run list contains all runs", (await call("GET", "/api/runs")).json.runs.length >= 5);
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
