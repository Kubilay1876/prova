// Live public Fuji reads only. Checks A's already recorded event; no wallet, write or model call.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createPublicClient, http, decodeEventLog } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { chainManifest as manifest } from '../src/chain-manifest.ts';
import { verifyRegistration, verifyFile } from '../src/verify.ts';
try {
const client = createPublicClient({ chain: avalancheFuji, transport: http(manifest.rpcUrl, { timeout: 12000, retryCount: 0 }) });
assert.equal(await client.getChainId(), 43113);
assert.notEqual(await client.getCode({ address: manifest.contractAddress }), '0x');
const logs = await client.getLogs({ address: manifest.contractAddress, fromBlock: 59596316n, toBlock: 59596316n });
const log = logs.find(log => { try { return decodeEventLog({ abi: manifest.abi, topics: log.topics, data: log.data }).eventName === manifest.eventName; } catch { return false; } });
assert.ok(log, 'A documented anchored report event must exist');
const { args } = decodeEventLog({ abi: manifest.abi, topics: log.topics, data: log.data });
const result = await verifyRegistration({ digest: args.reportHash, candidateVersionHash: args.candidateVersionHash, suiteHash: args.suiteHash });
assert.equal(result.state, 'VERIFIED');
assert.equal(result.txHash, log.transactionHash);
const mismatch = await verifyRegistration({ digest: args.reportHash, candidateVersionHash: `0x${'9'.repeat(64)}`, suiteHash: args.suiteHash });
assert.equal(mismatch.state, 'MISMATCH');
const localBody = { reportVersion: '1', candidate: { versionHash: 'a'.repeat(64) }, suiteHash: 'b'.repeat(64), fixtureHash: 'c'.repeat(64), policyHash: 'd'.repeat(64), tests: [], evidence: { events: [] }, notice: 'UNREGISTERED TEST REPORT — not a real exam' };
const unregistered = await verifyFile(new File([JSON.stringify(localBody)], 'unregistered-test.json'));
assert.equal(unregistered.state, 'NOT_FOUND');
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/fuji-live-checks.json', JSON.stringify({ scope: 'Real public Fuji RPC: existing event digest/identity and receipt verification; original anchored report bytes not available on this computer. Full file positive path is tested separately with explicit RPC stubs.', contract: manifest.contractAddress, eventBlock: log.blockNumber.toString(), result, mismatchState: mismatch.state, unregisteredFileState: unregistered.state }, null, 2));
console.log(`PASS live Fuji event and receipt ${result.txHash}`);
console.log('PASS wrong candidate version rejected; unregistered file NOT_FOUND; no signing or model calls');

} catch (error) {
  const status = error.status ?? error.cause?.status ?? null;
  await fs.mkdir('artifacts', { recursive: true });
  await fs.writeFile('artifacts/fuji-live-checks.json', JSON.stringify({ scope: 'Public Fuji RPC read attempt only; no signing or model calls', status: 'UNVERIFIED', httpStatus: status, message: error.shortMessage ?? error.message }, null, 2));
  console.error(`Live Fuji check incomplete: ${status ?? ''} ${error.shortMessage ?? error.message}`);
  process.exitCode = 1;
}
