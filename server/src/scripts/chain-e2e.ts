// End-to-end Fuji check with a SCRIPTED candidate (no model spend): run T03 through the real API,
// wait for the automatic anchoring, then verify independently from the chain.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createPublicClient, http, type Abi, type Hex } from "viem";
import { avalancheFuji } from "viem/chains";
import { startApp } from "../app.js";
import { MANIFEST_PATH } from "../chain/fuji.js";

const app = await startApp({ apiPort: 8790, exchangePort: 18998, dataDir: "data", stepDelayMs: 0 });
const base = "http://127.0.0.1:8790";
const get = async (p: string) => (await fetch(base + p)).json();
try {
  const health = await get("/api/health");
  console.log(`chain capability: ${health.capabilities.chain.status} — ${health.capabilities.chain.message}`);

  const start = await fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: `chain-e2e-${Date.now().toString(36)}`, candidateId: "scripted-query-first", testIds: ["T03"] }),
  });
  const { runId } = await start.json();
  let run: any;
  // Poll like the web UI does: stop at the first terminal status, then expect the receipt to be there.
  const seen: string[] = [];
  for (let i = 0; i < 240; i++) {
    run = (await get(`/api/runs/${runId}`)).run;
    const s = `${run.status}/${run.credentialStatus}`;
    if (seen.at(-1) !== s) seen.push(s);
    if (["COMPLETED", "PARTIAL", "CANCELLED", "ERROR"].includes(run.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`status/credential transitions seen by a poller: ${seen.join(" -> ")}`);
  console.log(`run ${runId}: status=${run.status} verdict=${run.verdict} credentialStatus=${run.credentialStatus}`);
  console.log("receipt:", JSON.stringify(run.receipt, null, 2));

  // Independent verification: hash the served bytes and read the contract directly.
  const bytes = Buffer.from(await (await fetch(`${base}/api/runs/${runId}/report`)).arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { contractAddress: Hex; abi: Abi; rpcUrl: string };
  const client = createPublicClient({ chain: avalancheFuji, transport: http(m.rpcUrl) });
  const recordedAt = (await client.readContract({ address: m.contractAddress, abi: m.abi, functionName: "recordedAt", args: [`0x${digest}`] })) as bigint;
  console.log(`report sha256 (served bytes) = ${digest}`);
  console.log(`matches run.reportHash: ${digest === run.reportHash?.value}`);
  console.log(`contract.recordedAt(hash) = block ${recordedAt} (0 = not recorded)`);
  const tampered = createHash("sha256").update(Buffer.concat([bytes, Buffer.from("\n")])).digest("hex");
  const tamperedAt = (await client.readContract({ address: m.contractAddress, abi: m.abi, functionName: "recordedAt", args: [`0x${tampered}`] })) as bigint;
  console.log(`one extra newline -> recordedAt = ${tamperedAt} (must be 0)`);
  if (run.receipt?.txHash) console.log(`explorer: https://testnet.snowtrace.io/tx/${run.receipt.txHash}`);
} finally {
  await app.close();
}
