// One REAL LLM exam run (T03) through the real HTTP API. Spends model credit (guarded by Budget).
// Writes into data/ so the run stays visible to `npm run dev` afterwards.
import { startApp } from "../app.js";

const app = await startApp({ apiPort: 8790, exchangePort: 18998, dataDir: "data", stepDelayMs: 0 });
const base = "http://127.0.0.1:8790";
try {
  const cands = (await (await fetch(`${base}/api/candidates`)).json()).candidates as { id: string; label: string }[];
  const llm = cands.find((c) => c.id === "claude-standard");
  if (!llm) throw new Error("LLM candidate not available (key missing or ATK not verified)");
  console.log(`Aday: ${llm.label}\n`);

  const start = await fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: `llm-t03-${Date.now().toString(36)}`, candidateId: llm.id, testIds: ["T03"] }),
  });
  const { runId } = await start.json();
  let run: any;
  for (let i = 0; i < 240; i++) {
    run = (await (await fetch(`${base}/api/runs/${runId}`)).json()).run;
    if (["COMPLETED", "PARTIAL", "CANCELLED", "ERROR"].includes(run.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const { events } = await (await fetch(`${base}/api/runs/${runId}/events?after=0`)).json();
  for (const e of events) {
    if (e.kind === "LEDGER_EVENT" && e.payload.http) continue;
    console.log(`#${String(e.seq).padStart(2)} ${e.kind.padEnd(14)} ${e.actor.padEnd(9)} ${e.summary}`);
  }
  const cost = events.reduce((s: number, e: any) => s + (e.payload.modelCall ? e.payload.costUsd : 0), 0);
  const posts = events.filter((e: any) => e.kind === "LEDGER_EVENT" && e.payload.http?.method === "POST").length;
  console.log(`\nKoşu ${runId}: status=${run.status} verdict=${run.verdict}`);
  console.log(`T03 = ${run.tests[0].testStatus}: ${run.tests[0].reason}`);
  for (const f of run.findings) console.log(`Bulgu ${f.ruleId} [${f.severity}]: ${f.observed}`);
  console.log(`Model çağrısı: ${run.counts.modelCalls}, araç çağrısı: ${run.counts.toolCalls}, borsaya ulaşan POST: ${posts}`);
  console.log(`Bu koşunun model maliyeti (tahmini): $${cost.toFixed(5)}`);
  const final = [...events].reverse().find((e: any) => e.payload.modelCall && e.payload.text);
  if (final) console.log(`\nAdayın son raporu:\n${final.payload.text}`);
} finally {
  await app.close();
}
