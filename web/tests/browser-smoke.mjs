// UI/contract-stub checks only. These do not validate the real LLM, ATK, backend or Fuji.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const origin = process.env.PROVA_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const checks = [];
async function check(name, action) { await action(); checks.push(name); console.log(`PASS ${name}`); }
try {
  // Chain transport is intentionally unavailable in this UI-only suite.
  await page.route('https://api.avax-test.network/**', route => route.abort('failed'));
  // Explicitly simulate an offline API so this suite can run beside the real backend.
  await page.route('**/api/**', route => route.abort('failed'));
  await check('Backend unavailable is an explicit error; no automatic fixture fallback', async () => {
    await page.goto(origin);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.demo-banner').count(), 0);
    assert.match(await page.locator('.connection').innerText(), /API bağlantısı yok/);
    assert.equal(await page.getByRole('button', { name: 'Davranış sınavını başlat' }).isDisabled(), true);
  });
  await page.getByRole('button', { name: 'Etiketli UI demosunu aç' }).click();
  await page.unroute('**/api/**');
  await page.locator('#candidate option[value="demo-baseline"]').waitFor({ state: 'attached' });
  await check('All six tests remain visible including unsupported T04', async () => {
    assert.equal(await page.locator('.suite-card').count(), 6);
    assert.equal(await page.locator('.suite-card.unsupported').count(), 5);
    await page.screenshot({ path: path.join(artifacts, '01-connect-desktop.png'), fullPage: true });
  });
  let demoRunId;
  await check('Double click creates one fixture run; terminal verdict preserves partial coverage', async () => {
    await page.getByRole('button', { name: 'Davranış sınavını başlat' }).dblclick({ delay: 20 });
    await page.locator('.run-bar').waitFor();
    demoRunId = new URL(page.url()).searchParams.get('run');
    await page.getByRole('button', { name: 'Karneyi incele →', exact: true }).waitFor({ timeout: 20000 });
    assert.equal(await page.locator('.history-panel tbody tr').count(), 3);
    assert.match(await page.locator('.run-bar').innerText(), /Kısmi/);
  });
  await check('Finding opens the three referenced events and independent ledger/gate payloads', async () => {
    await page.locator('.finding-card').first().click();
    assert.equal(await page.locator('.event-card.highlighted').count(), 3);
    assert.equal(await page.locator('.evidence-records details').count(), 3);
    assert.match(await page.locator('.evidence-records').innerText(), /EXCHANGE/);
    assert.match(await page.locator('.evidence-records').innerText(), /GATE/);
    await page.screenshot({ path: path.join(artifacts, '02-evidence-desktop.png'), fullPage: true });
  });
  let reportBytes;
  await check('Downloaded demo report labels both filename and content', async () => {
    await page.getByRole('button', { name: 'Karneyi incele →', exact: true }).click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'UI demo JSON indir ↓' }).click();
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /^UI-DEMO-sentetik-/);
    reportBytes = await fs.readFile(await download.path());
    assert.match(JSON.parse(reportBytes.toString()).notice, /UI DEMO/);
    await page.locator('#compare').selectOption('ui-demo-patched');
    await page.getByText('Paket, fixture ve politika hash’leri aynı.', { exact: false }).waitFor();
  });
  await check('Reload reopens the same run and restores all seven events', async () => {
    await page.reload(); await page.locator('.run-bar').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('run'), demoRunId);
    await page.locator('.event-card').nth(6).waitFor();
    assert.equal(await page.locator('.event-card').count(), 7);
  });
  await check('Read-only verifier hashes exact bytes and rejects synthetic proof', async () => {
    await page.getByRole('button', { name: /Karneyi doğrula/ }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'ui-demo.json', mimeType: 'application/json', buffer: reportBytes });
    await page.getByRole('button', { name: 'Dosyayı doğrula' }).click();
    await page.locator('.verification-result').waitFor();
    assert.match(await page.locator('.verification-result').innerText(), /sentetik UI demo/);
    assert.equal(await page.locator('.verification-result code').innerText(), `0x${createHash('sha256').update(reportBytes).digest('hex')}`);
    const data = JSON.parse(reportBytes.toString()); delete data.notice;
    await page.locator('input[type="file"]').setInputFiles({ name: 'local-only.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.getByRole('button', { name: 'Dosyayı doğrula' }).click();
    await page.getByText('Fuji RPC sorgusu tamamlanamadı.', { exact: false }).first().waitFor();
    assert.equal(await page.locator('.verification-result .tone-ERROR').count(), 1);
  });
  await check('Cancel waits for final confirmation instead of claiming immediate cancellation', async () => {
    await page.getByRole('button', { name: /Adayı bağla/ }).first().click();
    await page.getByRole('button', { name: 'Davranış sınavını başlat' }).click();
    await page.getByRole('button', { name: 'Sınavı durdur' }).click();
    await page.getByText('Durdurma istendi.', { exact: false }).waitFor();
    await page.locator('.run-bar .tone-CANCELLED').waitFor({ timeout: 10000 });
  });
  await check('390px connect, report and evidence screens fit the viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Adayı bağla/ }).first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, '03-connect-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: /Sınavı izle/ }).first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: /Karneyi incele/ }).first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  // An explicit test-only HTTP stub checks the frontend adapter. No backend source is created.
  const base = JSON.parse(reportBytes.toString());
  const stubRun = { ...base.run, id: 'contract-stub-run', status: 'RUNNING', verdict: null, cancelRequested: false, endedAt: null };
  const stubEvents = base.events.map(e => ({ ...e, runId: stubRun.id }));
  let postIds = [], polls = 0, complete = false, omitDefinition = false, incompatible = false, dependencyUnavailable = false;
  const otherRun = { ...stubRun, id: 'contract-stub-other', fixtureHash: `0x${'9'.repeat(64)}`, status: 'COMPLETED', verdict: 'PASS' };
  await page.route('**/api/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const pathname = url.pathname;
    const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ apiVersion: incompatible ? '2' : '1', ...data }) });
    if (pathname === '/api/health') return json({ serverTime: new Date().toISOString(), capabilities: Object.fromEntries(['llm', 'atkMarket', 'atkExam', 'chain'].map(k => [k, { status: k === 'chain' || k === 'llm' ? 'NOT_CONFIGURED' : 'VERIFIED', checkedAt: null, message: 'TEST STUB ONLY' }])) });
    if (pathname === '/api/candidates') return json({ candidates: [{ id: 'stub', label: 'TEST STUB ONLY', versionHash: stubRun.candidateVersionHash, provenance: 'TEAM_DEMO', supportedTestIds: ['T01', 'T02', 'T03', 'T05', 'T06'] }] });
    if (pathname === '/api/tests') return json({ suiteVersion: 'TEST-STUB', tests: base.run.tests.filter(t => !omitDefinition || t.testId !== 'T04').map(t => ({ id: t.testId, title: t.testId, description: 'Test stub', required: true, supported: true, unsupportedReason: null })) });
    if (pathname === '/api/runs' && req.method() === 'GET') return json({ runs: postIds.length ? [stubRun, otherRun] : [] });
    if (pathname === '/api/runs' && req.method() === 'POST') { if (dependencyUnavailable) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ apiVersion: '1', error: { code: 'DEPENDENCY_NOT_READY', message: 'Test only', retryable: true } }) }); postIds.push(req.postDataJSON().requestId); if (postIds.length === 1) return route.abort('failed'); return json({ runId: stubRun.id, status: 'RUNNING' }); }
    if (pathname.endsWith('/events')) { polls++; const incoming = polls === 1 ? stubEvents.slice(0, 2) : polls === 2 ? [] : [stubEvents[1], stubEvents[2]]; if (polls >= 3) { complete = true; stubRun.status = 'PARTIAL'; stubRun.verdict = 'FAIL'; } return json({ events: incoming, lastSeq: incoming.at(-1)?.seq ?? Number(url.searchParams.get('after')) }); }
    if (pathname.endsWith(`/${stubRun.id}`)) return json({ run: { ...stubRun } });
    if (pathname.endsWith(`/${otherRun.id}`)) return json({ run: { ...otherRun } });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEST_ONLY', message: 'No fixture for route' } }) });
  });
  await check('API adapter retries lost POST response with the same requestId', async () => {
    await page.goto(origin);
    await page.getByRole('button', { name: 'Davranış sınavını başlat' }).waitFor();
    await page.getByRole('button', { name: 'Davranış sınavını başlat' }).click();
    await page.getByRole('button', { name: 'Aynı isteği tekrar dene' }).waitFor();
    await page.getByRole('button', { name: 'Aynı isteği tekrar dene' }).click();
    await page.locator('.run-bar').waitFor();
    assert.equal(postIds.length, 2); assert.equal(postIds[0], postIds[1]);
  });
  await check('API replay and empty poll preserve events; terminal status stops polling', async () => {
    await page.locator('.event-card').nth(2).waitFor({ timeout: 12000 });
    await page.locator('.run-bar .tone-PARTIAL').waitFor({ timeout: 8000 });
    assert.equal(complete, true); assert.equal(await page.locator('.event-card').count(), 3);
    const count = polls; await page.waitForTimeout(1600); assert.equal(polls, count);
  });
  await check('Missing evidence remains an explicit gap', async () => {
    await page.locator('.finding-card').first().click();
    await page.locator('.evidence-records .warning-banner').waitFor();
    assert.match(await page.locator('.evidence-records .warning-banner').innerText(), /Kanıt boşluğu/);
  });
  await check('Different fixture hash prevents equivalent comparison', async () => {
    await page.getByRole('button', { name: 'Karneyi incele →', exact: true }).click();
    await page.locator('#compare').selectOption(otherRun.id);
    await page.getByText('Eşdeğer değil:', { exact: false }).waitFor();
  });
  await check('Missing test definition stays visible and prevents a misleading full run', async () => {
    omitDefinition = true; await page.goto(origin);
    await page.getByText('API test tanımları eksik:', { exact: false }).waitFor();
    assert.equal(await page.locator('.suite-card').count(), 6);
    assert.equal(await page.getByRole('button', { name: 'Davranış sınavını başlat' }).isDisabled(), true);
  });
  await check('503 dependency rejection explains readiness and does not create a fake run', async () => {
    omitDefinition = false; dependencyUnavailable = true; await page.goto(origin);
    await page.getByRole('button', { name: 'Davranış sınavını başlat' }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /ATK sınav bağlantısı hazır değil/);
    assert.equal(new URL(page.url()).searchParams.has('run'), false);
    assert.equal(await page.getByRole('button', { name: 'Davranış sınavını başlat' }).isEnabled(), true);
  });
  await check('Incompatible API version is rejected without a connected indicator', async () => {
    incompatible = true; await page.goto(origin);
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /API sürümü uyumsuz/);
    assert.match(await page.locator('.connection').innerText(), /API bağlantısı yok/);
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(artifacts, 'browser-checks.json'), JSON.stringify({ scope: 'Frontend fixture and HTTP contract stub only; no real backend/LLM/ATK/Fuji validation', checks, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
