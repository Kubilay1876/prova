// Real local backend + real ATK MCP; candidates are scripted, market data synthetic, orders simulated.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const origin = process.env.PROVA_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const artifacts = path.resolve('artifacts'); await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const checks = []; let run, reportBytes;
async function check(name, action) { await action(); checks.push(name); console.log(`PASS ${name}`); }
try {
  // Chain reads are isolated here; this suite validates the real backend/ATK, not Fuji.
  // Use a deliberate transport failure rather than any synthetic chain success.
  await page.route('https://api.avax-test.network/**', route => route.abort('failed'));
  await page.goto(origin);
  await check('Real API enables scripted candidates with LLM NOT_CONFIGURED; five tests visibly unsupported', async () => {
    const health = await (await page.request.get(`${origin}/api/health`)).json();
    assert.equal(health.capabilities.atkExam.status, 'VERIFIED');
    assert.equal(health.capabilities.llm.status, 'NOT_CONFIGURED');
    await page.locator('#candidate').selectOption('scripted-resubmit');
    assert.equal(await page.locator('.suite-card').count(), 6);
    assert.equal(await page.locator('.suite-card.unsupported').count(), 5);
    assert.match(await page.locator('#candidate option:checked').innerText(), /betik, LLM değil/);
    assert.equal(await page.getByRole('button', { name: 'Davranış sınavını başlat' }).isEnabled(), true);
    assert.equal(await page.locator('.demo-banner').count(), 0);
    await page.screenshot({ path: path.join(artifacts, 'real-01-connect-1440.png'), fullPage: true });
  });
  await check('One UI double click starts one real T03 run; status PARTIAL and five UNSUPPORTED retained', async () => {
    let posts = 0;
    const count = req => { if (new URL(req.url()).pathname === '/api/runs' && req.method() === 'POST') posts++; };
    page.on('request', count);
    await page.getByRole('button', { name: 'Davranış sınavını başlat' }).dblclick({ delay: 15 });
    await page.locator('.run-bar .tone-PARTIAL').waitFor({ timeout: 25000 });
    page.off('request', count); assert.equal(posts, 1);
    const id = new URL(page.url()).searchParams.get('run');
    run = (await (await page.request.get(`${origin}/api/runs/${id}`)).json()).run;
    assert.equal(run.status, 'PARTIAL'); assert.equal(run.verdict, 'FAIL');
    assert.equal(run.tests.filter(t => t.testStatus === 'UNSUPPORTED').length, 5);
    assert.equal(run.counts.modelCalls, 0); assert.equal(run.credentialStatus, 'LOCAL_ONLY'); assert.equal(run.receipt, null);
    assert.equal(await page.locator('.test-list .tone-UNSUPPORTED').count(), 5);
  });
  await check('Real finding highlights every evidenceEventId; ledger and gate are distinct', async () => {
    await page.locator('.finding-card').first().click();
    assert.equal(await page.locator('.event-card.highlighted').count(), run.findings[0].evidenceEventIds.length);
    assert.equal(await page.locator('.evidence-records .warning-banner').count(), 0);
    assert.match(await page.locator('.event-panel').innerText(), /LEDGER_EVENT/);
    assert.match(await page.locator('.event-panel').innerText(), /GATE_DECISION/);
    await page.screenshot({ path: path.join(artifacts, 'real-02-evidence-1440.png'), fullPage: true });
  });
  await check('Report shows separate exam result/local record; downloaded raw bytes match backend reportHash', async () => {
    await page.getByRole('button', { name: 'Karneyi incele →', exact: true }).click();
    await page.getByRole('heading', { name: 'Sınav sonucu', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Karne kaydı', exact: true }).waitFor();
    assert.equal(await page.locator('.identity-panel .tone-LOCAL_ONLY').count(), 1);
    const promise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Backend karnesini indir ↓' }).click();
    const download = await promise; reportBytes = await fs.readFile(await download.path());
    assert.match(download.suggestedFilename(), /^PROVA-karne-/);
    assert.equal(createHash('sha256').update(reportBytes).digest('hex'), run.reportHash.value);
    assert.equal(JSON.parse(reportBytes).candidate.kind, 'SCRIPTED_STAND_IN');
    await page.screenshot({ path: path.join(artifacts, 'real-03-report-1440.png'), fullPage: true });
  });
  await check('Selected run hash is passed to independent verifier; changed bytes mismatch, no chain claim', async () => {
    await page.getByRole('button', { name: 'Dosyayı bağımsız doğrula ↗' }).click();
    assert.equal(await page.locator('#expected-hash').inputValue(), run.reportHash.value);
    await page.locator('input[type=file]').setInputFiles({ name: 'report.json', mimeType: 'application/json', buffer: reportBytes });
    await page.getByRole('button', { name: 'Dosyayı doğrula' }).click();
    await page.locator('.verification-result .tone-MATCH').waitFor();
    assert.match(await page.locator('.verification-result').innerText(), /Fuji RPC sorgusu tamamlanamadı/);
    assert.equal(await page.locator('.verification-result .tone-VERIFIED').count(), 0);
    await page.locator('input[type=file]').setInputFiles({ name: 'changed.json', mimeType: 'application/json', buffer: Buffer.concat([reportBytes, Buffer.from('\n')]) });
    await page.getByRole('button', { name: 'Dosyayı doğrula' }).click();
    await page.locator('.verification-result .tone-MISMATCH').waitFor();
  });
  await check('Standalone /verify performs no API requests and accepts a previously saved expected hash', async () => {
    const independent = await browser.newPage();
    await independent.route('https://api.avax-test.network/**', route => route.abort('failed'));
    let calls = 0; independent.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) calls++; });
    await independent.goto(`${origin}/verify`);
    await independent.locator('#expected-hash').fill(run.reportHash.value);
    await independent.locator('input[type=file]').setInputFiles({ name: 'report.json', mimeType: 'application/json', buffer: reportBytes });
    await independent.getByRole('button', { name: 'Dosyayı doğrula' }).click();
    await independent.locator('.verification-result .tone-MATCH').waitFor();
    assert.equal(calls, 0); await independent.close();
  });
  await check('Reload reopens the real run; 1280 desktop and 390 mobile evidence/report stay within viewport', async () => {
    await page.goto(`${origin}/?run=${run.id}`); await page.locator('.run-bar').waitFor();
    await page.reload(); await page.locator('.run-bar .tone-PARTIAL').waitFor();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(artifacts, `real-04-exam-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: /Karneyi incele/ }).first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
  await check('Real good scripted candidate gets T03 PASS but overall INCONCLUSIVE and PARTIAL', async () => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.getByRole('button', { name: /Adayı bağla/ }).first().click();
    await page.locator('#candidate').selectOption('scripted-query-first');
    await page.getByRole('button', { name: 'Davranış sınavını başlat' }).click();
    await page.waitForURL(url => Boolean(url.searchParams.get('run')) && url.searchParams.get('run') !== run.id);
    await page.locator('.run-bar .tone-PARTIAL').waitFor({ timeout: 25000 });
    const id = new URL(page.url()).searchParams.get('run');
    const good = (await (await page.request.get(`${origin}/api/runs/${id}`)).json()).run;
    assert.equal(good.verdict, 'INCONCLUSIVE'); assert.equal(good.counts.requiredPassed, 1);
    assert.equal(good.tests.find(t => t.testId === 'T03').testStatus, 'PASS');
  });
  await check('Real 409 offers the running run; cancel waits for final CANCELLED', async () => {
    const started = await page.request.post(`${origin}/api/runs`, { data: { requestId: `ui-busy-${Date.now()}`, candidateId: 'scripted-resubmit', testIds: ['T03'] } });
    assert.equal(started.status(), 202);
    const busyRun = await started.json();
    await page.getByRole('button', { name: /Adayı bağla/ }).first().click();
    await page.getByRole('button', { name: 'Davranış sınavını başlat' }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /RUN_IN_PROGRESS/);
    await page.getByRole('button', { name: 'Süren koşuyu aç →' }).click();
    await page.getByRole('button', { name: 'Sınavı durdur' }).click();
    await page.locator('.run-bar .tone-CANCELLED').waitFor({ timeout: 12000 });
    assert.equal(new URL(page.url()).searchParams.get('run'), busyRun.runId);
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(artifacts, 'real-api-checks.json'), JSON.stringify({ scope: 'Real unchanged local backend with ATK MCP 1.4.8; SCRIPTED candidates, SYNTHETIC market, SIMULATED orders, LOCAL_ONLY records. No LLM or chain validation.', runId: run.id, checks, browserErrors: errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'real-failure.png'), fullPage: true });
  console.error((await page.locator('main').innerText()).slice(0, 6500));
  throw error;
} finally { await browser.close(); }
