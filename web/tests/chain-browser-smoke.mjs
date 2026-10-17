// Browser + explicit synthetic RPC responses. No real chain/LLM evidence or signing.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { rpcStub } from './chain-rpc-stub.mjs';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const manifest = JSON.parse(await fs.readFile('../docs/backend/fuji-manifest.json', 'utf8'));
const report = { reportVersion: '1', candidate: { versionHash: 'a'.repeat(64) }, suiteHash: 'b'.repeat(64), fixtureHash: 'c'.repeat(64), policyHash: 'd'.repeat(64), tests: [], evidence: { events: [] }, rpcUrl: 'https://untrusted.invalid', contractAddress: `0x${'9'.repeat(40)}` };
const bytes = Buffer.from(JSON.stringify(report));
const digest = `0x${createHash('sha256').update(bytes).digest('hex')}`;
const stub = rpcStub(manifest, { digest, candidateVersionHash: `0x${report.candidate.versionHash}`, suiteHash: `0x${report.suiteHash}` });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const checks = [], errors = [], apiCalls = [], external = [];
const rpcMethods = [];
let transient429 = false;
page.on('pageerror', e => errors.push(e.message));
page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) apiCalls.push(req.url()); if (!req.url().startsWith('http://127.0.0.1:5173')) external.push(req.url()); });
await page.route('https://api.avax-test.network/**', async route => {
  const req = route.request().postDataJSON();
  rpcMethods.push({ method: req.method, time: Date.now() });
  if (stub.state.rpcError) return route.fulfill({ status: 429, body: 'Synthetic rate limit' });
  if (transient429 && req.method === 'eth_getLogs') { transient429 = false; return route.fulfill({ status: 429, body: 'Synthetic temporary rate limit' }); }
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: req.id, result: await stub.request(req) }) });
});
async function verify(buffer = bytes) {
  await page.locator('input[type=file]').setInputFiles({ name: 'TEST-ONLY-report.json', mimeType: 'application/json', buffer });
  await page.getByRole('button', { name: 'Dosyayı doğrula' }).click();
  await page.locator('.verification-result').waitFor();
}
async function check(name, action) { await action(); checks.push(name); console.log(`PASS ${name}`); }
try {
  await page.goto(`${process.env.PROVA_TEST_ORIGIN ?? 'http://127.0.0.1:5173'}/verify`);
  // Clearly label test screenshots even though the application is running in its real verification view.
  await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'UI DEMO — sentetik arayüz verisi · RPC test yanıtları'; p.className = 'demo-banner'; document.querySelector('main').prepend(p); });
  await check('Standalone file verification matches exact bytes and fixed Fuji event/receipt without backend', async () => {
    await page.locator('#expected-hash').fill(digest); await verify();
    assert.equal(await page.locator('.verification-result .tone-MATCH').count(), 1);
    assert.equal(await page.locator('.verification-result .tone-VERIFIED').count(), 1);
    assert.match(await page.locator('.verification-result a').getAttribute('href'), /testnet.snowtrace.io/);
    assert.deepEqual(apiCalls, []);
    assert.ok(external.every(url => url === manifest.rpcUrl));
    assert.equal(stub.state.calls.filter(c => c.method === 'eth_getLogs').length, 1);
    const logQuery = stub.state.calls.find(c => c.method === 'eth_getLogs').params[0];
    assert.equal(logQuery.fromBlock, logQuery.toBlock);
    await page.screenshot({ path: 'artifacts/chain-verify-1440.png', fullPage: true });
  });
  await check('One transient 429 retries only the failed log request after a delay and recovers', async () => {
    const before = rpcMethods.length;
    transient429 = true;
    await verify();
    assert.equal(await page.locator('.verification-result .tone-VERIFIED').count(), 1);
    const current = rpcMethods.slice(before);
    assert.equal(current.filter(call => call.method === 'eth_chainId').length, 1);
    const logs = current.filter(call => call.method === 'eth_getLogs');
    assert.equal(logs.length, 2);
    assert.ok(logs[1].time - logs[0].time >= 1400);
  });
  await check('One added newline changes local hash and returns no matching registered record', async () => {
    await verify(Buffer.concat([bytes, Buffer.from('\n')]));
    assert.equal(await page.locator('.verification-result .tone-MISMATCH').count(), 1);
    assert.equal(await page.locator('.verification-result .tone-NOT_FOUND').count(), 1);
    assert.equal(await page.locator('.verification-result a').count(), 0);
  });
  await check('Wrong candidate identity, pending block and RPC 429 cannot become verified', async () => {
    stub.state.wrongVersion = true; await verify();
    assert.equal(await page.locator('.verification-result .tone-MISMATCH').count(), 1);
    stub.state.wrongVersion = false; stub.state.pending = true; await verify();
    assert.equal(await page.locator('.verification-result .tone-PENDING').count(), 1);
    stub.state.pending = false; stub.state.rpcError = true; await verify();
    assert.equal(await page.locator('.verification-result .tone-ERROR').count(), 1);
    assert.match(await page.locator('.verification-result').innerText(), /429: hız sınırı/);
    assert.equal(await page.locator('.verification-result .tone-VERIFIED').count(), 0);
  });
  await check('390px verification keeps contract, recorder, digest and error within viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'artifacts/chain-verify-390.png', fullPage: true });
  });
  assert.deepEqual(errors, []);
  await fs.writeFile('artifacts/chain-browser-checks.json', JSON.stringify({ scope: 'Explicit synthetic RPC responses only; no real chain/LLM verification', checks, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
