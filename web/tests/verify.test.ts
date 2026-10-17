import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareDigest, hashFile, verifyFile, verifyRegistration, retryRateLimit } from '../src/verify.ts';
import { chainManifest } from '../src/chain-manifest.ts';
import { custom } from 'viem';
import { rpcStub } from './chain-rpc-stub.mjs';

test('exact downloaded bytes are hashed including whitespace; reference accepts 0x and uppercase', async () => {
  const bytes = '{ "reportVersion": "1" }\n';
  const file = new File([bytes], 'report.json', { type: 'application/json' });
  const { digest } = await hashFile(file);
  const expected = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, `0x${expected}`);
  assert.equal(compareDigest(digest, expected.toUpperCase()).state, 'MATCH');
  assert.equal(compareDigest(digest, `0x${expected}`).state, 'MATCH');
  const changed = await hashFile(new File([bytes + ' '], 'changed.json'));
  assert.equal(compareDigest(changed.digest, expected).state, 'MISMATCH');
  assert.equal(compareDigest(digest, '').state, 'UNCOMPARED');
  assert.equal(compareDigest(digest, 'not-a-hash').state, 'INVALID_REFERENCE');
});
test('A frozen report hashes exact bytes, ignores file network targets and checks the fixed Fuji registry', async () => {
  const body = { reportVersion: '1', candidate: { versionHash: 'a'.repeat(64) }, suiteHash: 'b'.repeat(64), fixtureHash: 'c'.repeat(64), policyHash: 'd'.repeat(64), tests: [], evidence: { events: [] } };
  const bytes = JSON.stringify({ ...body, rpcUrl: 'https://untrusted.invalid', contractAddress: `0x${'9'.repeat(40)}` });
  const digest = `0x${createHash('sha256').update(bytes).digest('hex')}`;
  const stub = rpcStub(chainManifest, { digest, candidateVersionHash: `0x${body.candidate.versionHash}`, suiteHash: `0x${body.suiteHash}` });
  const original = globalThis.fetch;
  const targets: string[] = [];
  globalThis.fetch = async (input, init) => {
    targets.push(String(input));
    const req = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: await stub.request(req) }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await verifyFile(new File([bytes], 'local.json'));
    assert.equal(result.state, 'VERIFIED'); assert.equal(result.digest, digest);
    assert.equal(result.txHash, stub.tx);
    assert.ok(targets.length > 0 && targets.every(target => target === chainManifest.rpcUrl));
    const changed = await verifyFile(new File([bytes + '\n'], 'changed.json'));
    assert.equal(changed.state, 'NOT_FOUND');
  } finally { globalThis.fetch = original; }
});

test('Fuji registration requires matching event identity and a successful consistent receipt', async () => {
  const source = { digest: `0x${'1'.repeat(64)}`, candidateVersionHash: `0x${'2'.repeat(64)}`, suiteHash: `0x${'3'.repeat(64)}` };
  for (const flag of ['wrongRecorder', 'wrongVersion', 'wrongSuite', 'failedReceipt', 'missingReceiptLog', 'wrongContract', 'wrongBlockHash', 'removed', 'missingLog']) {
    const stub = rpcStub(chainManifest, source); stub.state[flag] = true;
    const result = await verifyRegistration(source, custom({ request: stub.request }, { retryCount: 0 }));
    assert.equal(result.state, 'MISMATCH', flag);
    assert.equal(result.txHash, undefined);
  }
  const pending = rpcStub(chainManifest, source); pending.state.pending = true;
  assert.equal((await verifyRegistration(source, custom({ request: pending.request }))).state, 'PENDING');
  const wrongNetwork = rpcStub(chainManifest, source); wrongNetwork.state.chainId = 1;
  assert.equal((await verifyRegistration(source, custom({ request: wrongNetwork.request }))).state, 'MISMATCH');
  const offline = rpcStub(chainManifest, source); offline.state.rpcError = true;
  assert.equal((await verifyRegistration(source, custom({ request: offline.request }, { retryCount: 0 }))).state, 'ERROR');
  const absent = rpcStub(chainManifest, source); absent.state.recorded = false;
  assert.equal((await verifyRegistration(source, custom({ request: absent.request }))).state, 'NOT_FOUND');
  assert.equal(absent.state.calls.some(call => call.method === 'eth_getLogs'), false);
});

test('malformed report identity and UI DEMO are rejected before any RPC call', async () => {
  assert.equal((await verifyFile(new File(['{"notice":"UI DEMO — sentetik arayüz verisi"}'], 'demo.json'))).state, 'MISSING_SOURCE');
  assert.equal((await verifyFile(new File(['{}'], 'empty.json'))).state, 'MISSING_SOURCE');
});

test('429 retries only the failed read once after 1500ms and never restarts successful RPC reads', async () => {
  const source = { digest: `0x${'1'.repeat(64)}`, candidateVersionHash: `0x${'2'.repeat(64)}`, suiteHash: `0x${'3'.repeat(64)}` };
  const stub = rpcStub(chainManifest, source);
  let logs = 0;
  const delays: number[] = [];
  const base = custom({ request: async args => {
    if (args.method === 'eth_getLogs' && ++logs === 1) throw Object.assign(new Error('rate limited'), { status: 429 });
    return stub.request(args);
  } }, { retryCount: 0 });
  // Inject a wait recorder while exercising the production verification path.
  const result = await verifyRegistration(source, retryRateLimit(base, async ms => { delays.push(ms); }));
  assert.equal(result.state, 'VERIFIED');
  assert.equal(logs, 2);
  assert.deepEqual(delays, [1500]);
  assert.equal(stub.state.calls.filter(call => call.method === 'eth_chainId').length, 1);
});

test('rate-limit transport has one shared retry budget; persistent 429, parallel 429 and 503 stop', async () => {
  for (const status of [429, 503]) {
    let calls = 0; const delays: number[] = [];
    const base = custom({ request: async () => { calls++; throw Object.assign(new Error('unavailable'), { status }); } }, { retryCount: 0 });
    const transport = retryRateLimit(base, async ms => { delays.push(ms); })({});
    await assert.rejects(transport.request({ method: 'eth_chainId' }));
    assert.equal(calls, status === 429 ? 2 : 1);
    assert.deepEqual(delays, status === 429 ? [1500] : []);
  }
  let calls = 0; const delays: number[] = [];
  const base = custom({ request: async () => { calls++; throw Object.assign(new Error('limited'), { cause: { status: 429 } }); } }, { retryCount: 0 });
  const transport = retryRateLimit(base, async ms => { delays.push(ms); })({});
  const results = await Promise.allSettled([transport.request({ method: 'eth_chainId' }), transport.request({ method: 'eth_blockNumber' })]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(calls, 3); assert.deepEqual(delays, [1500]);
});
