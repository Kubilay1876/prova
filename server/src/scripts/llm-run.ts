// REAL LLM exam run through the real HTTP API. Spends model credit (guarded by Budget).
// Usage: npm run llm:run -- [T01 T02 ...]   (default: all six). Writes into data/.
import { startApp } from "../app.js";

const testIds = process.argv.slice(2).filter((a) => /^T0[1-6]$/.test(a));
const selected = testIds.length ? testIds : ["T01", "T02", "T03", "T04", "T05", "T06"];

const app = await startApp({ apiPort: 8790, exchangePort: 18998, dataDir: "data", stepDelayMs: 0 });
const base = "http://127.0.0.1:8790";
try {
  const cands = (await (await fetch(`${base}/api/candidates`)).json()).candidates as { id: string; label: string }[];
  const llm = cands.find((c) => c.id === "claude-standard");
  if (!llm) throw new Error("LLM candidate not available (key missing or ATK not verified)");
  console.log(`Aday: ${llm.label}  Testler: ${selected.join(", ")}\n`);

  const start = await fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: `llm-${Date.now().toString(36)}`, candidateId: llm.id, testIds: selected }),
  });
  const { runId } = await start.json();
  let run: any;
  for (let i = 0; i < 1200; i++) {
    run = (await (await fetch(`${base}/api/runs/${runId}`)).json()).run;
    if (["COMPLETED", "PARTIAL", "CANCELLED", "ERROR"].includes(run.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const { events } = await (await fetch(`${base}/api/runs/${runId}/events?after=0`)).json();
  let current: string | null = null;
  for (const e of events) {
    if (e.kind === "LEDGER_EVENT" && e.payload.http) continue;
    if (e.testId !== current && e.testId) console.log(`\n--- ${e.testId}`);
    current = e.testId ?? current;
    console.log(`#${String(e.seq).padStart(3)} ${e.kind.padEnd(14)} ${e.actor.padEnd(9)} ${e.summary}`);
  }
  const cost = events.reduce((s: number, e: any) => s + (e.payload.modelCall ? e.payload.costUsd : 0), 0);
  console.log(`\n=== Koşu ${runId}: status=${run.status} verdict=${run.verdict}`);
  for (const t of run.tests) console.log(`${t.testId} ${t.testStatus.padEnd(13)} ${t.reason}`);
  for (const f of run.findings) console.log(`Bulgu ${f.ruleId} [${f.severity}]: ${f.observed}`);
  console.log(`Model çağrısı: ${run.counts.modelCalls}, araç çağrısı: ${run.counts.toolCalls}, engellenen etki: ${run.counts.blockedEffects}`);
  console.log(`Bu koşunun model maliyeti (tahmini): $${cost.toFixed(5)}`);
  console.log(`Rapor hash: ${run.reportHash?.value ?? "yok"}`);
} finally {
  await app.close();
}
