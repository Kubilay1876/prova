import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { EventStore } from "./core/eventStore.js";
import { ExamExchange } from "./exchange/examExchange.js";
import { startExamAtk, type ExamAtk } from "./atk/atkClient.js";
import { ExamGate } from "./gate/gate.js";
import { RunManager } from "./runs/runManager.js";
import { createApiServer, type Capabilities } from "./api/server.js";
import { POLICY } from "./tests/catalog.js";
import { SCRIPTED_CANDIDATES, type Candidate } from "./candidates/scripted.js";
import { llmCandidate } from "./candidates/llm.js";
import { Budget } from "./llm/budget.js";
import { safeMessage } from "./core/fsutil.js";
import { FujiRecorder } from "./chain/fuji.js";
import { Examiner } from "./examiner/examiner.js";

const EXAM_API_KEY = "prova-fake-key"; // fake exam credential, not a real key

export interface AppOptions {
  apiPort: number;
  exchangePort: number;
  dataDir: string;
  stepDelayMs: number;
  /** false = never write to Fuji (acceptance checks must not spend test AVAX). Default true. */
  enableChain?: boolean;
}

export async function startApp(opts: AppOptions) {
  if (existsSync(".env")) process.loadEnvFile(".env");

  const runsDir = join(opts.dataDir, "runs");
  const store = new EventStore(runsDir);
  const exchange = new ExamExchange(store, { port: opts.exchangePort, apiKey: EXAM_API_KEY });
  await exchange.start();

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const caps: Capabilities = {
    atkMarket: { status: "NOT_CONFIGURED", checkedAt: null, message: "Gerçek piyasa salt okuma süreci henüz kurulmadı" },
    atkExam: { status: "NOT_CONFIGURED", checkedAt: null, message: "Sınav ATK bağlantısı denenmedi" },
    // A configured key is not proof: VERIFIED only after a real model call succeeds.
    llm: { status: "NOT_CONFIGURED", checkedAt: null, message: hasKey ? `Anahtar var (${model}); henüz gerçek model çağrısı yapılmadı` : "Model anahtarı yok" },
    chain: { status: "NOT_CONFIGURED", checkedAt: null, message: "Fuji kaydı henüz yok" },
  };

  // Real proof, not a flag: one tool call through the real MCP process must reach the exam exchange.
  let atk: ExamAtk | null = null;
  let gate: ExamGate | null = null;
  try {
    atk = await startExamAtk({ baseUrl: exchange.baseUrl, apiKey: EXAM_API_KEY, timeoutMs: 3000 });
    const before = exchange.totalHttpRequests;
    const r = await atk.callTool("market_get_ticker", { instId: "BTC-USDT" });
    const verified = !r.isError && exchange.totalHttpRequests > before;
    caps.atkExam = verified
      ? { status: "VERIFIED", checkedAt: new Date().toISOString(), message: `ATK MCP ${atk.serverVersion} sınav borsasına ulaştı` }
      : { status: "ERROR", checkedAt: new Date().toISOString(), message: "ATK araç çağrısı sınav borsasına ulaşmadı" };
    if (verified) gate = new ExamGate(store, atk, POLICY.gate);
  } catch (err) {
    caps.atkExam = { status: "ERROR", checkedAt: new Date().toISOString(), message: `ATK başlatılamadı: ${safeMessage(err)}` };
  }

  const candidates: Candidate[] = [...SCRIPTED_CANDIDATES];
  const budget = new Budget(join(opts.dataDir, "spend.json"));
  const client = hasKey ? new Anthropic() : null;
  // Separate session and context from the candidate; same spend guard.
  const examiner = client ? new Examiner(client, budget, model) : null;
  if (client && atk) {
    candidates.unshift(
      llmCandidate({
        id: "claude-standard",
        label: `Claude adayı (${model}, gerçek LLM)`,
        model,
        client,
        budget,
        atkTools: atk.tools,
        maxModelCallsPerTest: 6,
        onModelOk: (m) => {
          caps.llm = { status: "VERIFIED", checkedAt: new Date().toISOString(), message: `${m} gerçek çağrısı başarılı` };
        },
      }),
    );
  }

  // Fuji is used only when a deployment manifest exists AND a real chain read confirms it.
  let chain: FujiRecorder | null = null;
  const candidateChain = opts.enableChain === false ? null : FujiRecorder.load();
  if (opts.enableChain === false) caps.chain = { status: "NOT_CONFIGURED", checkedAt: null, message: "Zincir kaydı bu çalıştırmada kapalı" };
  if (candidateChain) {
    try {
      if (await candidateChain.check()) {
        chain = candidateChain;
        caps.chain = { status: "VERIFIED", checkedAt: new Date().toISOString(), message: `Fuji sözleşmesi ${candidateChain.manifest.contractAddress} okundu (test ağı)` };
      } else {
        caps.chain = { status: "ERROR", checkedAt: new Date().toISOString(), message: "Fuji sözleşmesi bu kayıtçıyı tanımıyor" };
      }
    } catch (err) {
      caps.chain = { status: "ERROR", checkedAt: new Date().toISOString(), message: `Fuji okunamadı: ${safeMessage(err)}` };
    }
  }

  const runs = new RunManager({ dataDir: runsDir, store, exchange, gate, candidates, stepDelayMs: opts.stepDelayMs, chain, examiner });
  const api = createApiServer({ runs, candidates, capabilities: () => caps });
  await new Promise<void>((resolve, reject) => {
    api.once("error", reject);
    api.listen(opts.apiPort, "127.0.0.1", () => resolve());
  });

  return {
    runs,
    caps,
    async close() {
      api.closeAllConnections();
      await new Promise<void>((r) => api.close(() => r()));
      await atk?.close();
      await exchange.stop();
    },
  };
}
