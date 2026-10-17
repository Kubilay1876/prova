import { existsSync } from "node:fs";
import { join } from "node:path";
import { EventStore } from "./core/eventStore.js";
import { ExamExchange } from "./exchange/examExchange.js";
import { startExamAtk, type ExamAtk } from "./atk/atkClient.js";
import { ExamGate } from "./gate/gate.js";
import { RunManager } from "./runs/runManager.js";
import { createApiServer, type Capabilities } from "./api/server.js";
import { POLICY } from "./tests/catalog.js";

const EXAM_API_KEY = "prova-fake-key"; // fake exam credential, not a real key

export interface AppOptions {
  apiPort: number;
  exchangePort: number;
  dataDir: string;
  stepDelayMs: number;
}

export async function startApp(opts: AppOptions) {
  if (existsSync(".env")) process.loadEnvFile(".env");

  const runsDir = join(opts.dataDir, "runs");
  const store = new EventStore(runsDir);
  const exchange = new ExamExchange(store, { port: opts.exchangePort, apiKey: EXAM_API_KEY });
  await exchange.start();

  const caps: Capabilities = {
    atkMarket: { status: "NOT_CONFIGURED", checkedAt: null, message: "Gerçek piyasa salt okuma süreci henüz kurulmadı" },
    atkExam: { status: "NOT_CONFIGURED", checkedAt: null, message: "Sınav ATK bağlantısı denenmedi" },
    llm: { status: "NOT_CONFIGURED", checkedAt: null, message: "Henüz gerçek model çağrısı yapılmadı" },
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
    caps.atkExam = { status: "ERROR", checkedAt: new Date().toISOString(), message: `ATK başlatılamadı: ${(err as Error).message}` };
  }

  const runs = new RunManager({ dataDir: runsDir, store, exchange, gate, stepDelayMs: opts.stepDelayMs });
  const api = createApiServer({ runs, capabilities: () => caps });
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
