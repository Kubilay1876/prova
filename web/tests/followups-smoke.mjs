// Explicit HTTP contract stubs only: no Claude, ATK or chain calls. Never imported by the app.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const origin = process.env.PROVA_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const artifacts = path.resolve('artifacts');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const checks = [];
const ids = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'];
const hash = 'a'.repeat(64);
let run = {
  id: 'UI-CONTRACT-STUB', candidateId: 'claude-standard', candidateVersionHash: hash,
  status: 'COMPLETED', verdict: 'FAIL', cancelRequested: false,
  startedAt: '2026-10-17T12:00:00Z', endedAt: '2026-10-17T12:01:00Z',
  suiteHash: hash, fixtureHash: hash, policyHash: hash, selectedTestIds: ids,
  tests: ids.map(testId => ({ testId, testStatus: 'PASS', reason: 'UI STUB: zorunlu test geçti', evidenceEventIds: [] })),
  followUps: [
    { testId: 'F01', baseTestId: 'T01', title: 'Bütçeyi parçalama baskısı', examinerReason: 'UI STUB: T01 parçalama baskısını sınamadı.', testStatus: 'FAIL', reason: 'UI STUB: ikinci emir talebi', evidenceEventIds: ['e2'] },
    { testId: 'F05', baseTestId: 'T05', title: 'Baskı altında bekleme', examinerReason: 'UI STUB: T05 baskı içermiyordu.', testStatus: 'PASS', reason: 'UI STUB: koşul yokken bekledi.', evidenceEventIds: ['e3'] },
  ],
  findings: [{ id: 'finding-f01', testId: 'F01', ruleId: 'TEST_ONLY', severity: 'CRITICAL', title: 'UI STUB kritik takip bulgusu', observed: 'İkinci talep', expected: 'Sınırı koru', evidenceEventIds: ['e2'] }],
  counts: { requiredTotal: 6, requiredPassed: 6, requiredFailed: 0, requiredResolved: 6, modelCalls: 28, toolCalls: 10, attemptedViolations: 1, blockedEffects: 1 },
  reality: { toolOrigin: 'UNVERIFIED', marketSource: 'SYNTHETIC', execution: 'SIMULATED', network: 'NONE' },
  credentialStatus: 'LOCAL_ONLY', receipt: null, reportHash: null,
};
let events = [
  { id: 'e1', seq: 1, testId: null, kind: 'EXAMINER_DECISION', actor: 'EXAMINER', summary: 'UI STUB: sınavcı F01 ve F05 seçti', payload: { modelCall: true } },
  { id: 'e2', seq: 2, testId: 'F01', kind: 'GATE_DECISION', actor: 'GATE', summary: 'UI STUB: F01 talebi engellendi', payload: { decision: 'BLOCKED' } },
  { id: 'e3', seq: 3, testId: 'F05', kind: 'TEST_RESULT', actor: 'EVALUATOR', summary: 'UI STUB: F05 geçti', payload: {} },
].map(e => ({ ...e, runId: run.id, timestamp: run.startedAt }));
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apiVersion: '1', ...data }) });
  if (url.pathname === '/api/health') return json({ serverTime: run.startedAt, capabilities: Object.fromEntries(['llm', 'atkMarket', 'atkExam', 'chain'].map(k => [k, { status: k === 'atkExam' ? 'VERIFIED' : 'NOT_CONFIGURED', checkedAt: null, message: 'UI CONTRACT STUB ONLY' }])) });
  if (url.pathname === '/api/candidates') return json({ candidates: [{ id: 'claude-standard', label: 'Claude adayı (gerçek LLM) — UI CONTRACT STUB', versionHash: hash, provenance: 'TEAM_DEMO', supportedTestIds: [...ids, 'F01', 'F02', 'F04', 'F05'] }] });
  if (url.pathname === '/api/tests') return json({ suiteVersion: 'UI-CONTRACT-STUB', tests: ids.map(id => ({ id, title: id, description: 'UI STUB', supported: true, required: true, unsupportedReason: null })) });
  if (url.pathname === '/api/runs') return json({ runs: [run] });
  if (url.pathname.endsWith('/events')) { const after = Number(url.searchParams.get('after')); const incoming = events.filter(e => e.seq > after); return json({ events: incoming, lastSeq: incoming.at(-1)?.seq ?? after }); }
  if (url.pathname === `/api/runs/${run.id}`) return json({ run });
  return route.fulfill({ status: 404, body: 'Unstubbed endpoint' });
});
async function check(name, action) { await action(); checks.push(name); console.log(`PASS ${name}`); }
async function open() { await page.goto(`${origin}/?run=${run.id}`); await page.locator('.run-bar').waitFor(); }
try {
  await check('Claude is selectable before first verified call; mandatory scope stays 6/6, not 10/6', async () => {
    await page.goto(origin); await page.locator('#candidate option').waitFor({ state: 'attached' });
    await page.getByText('6 / 6 zorunlu test', { exact: true }).waitFor();
    assert.equal(await page.locator('.suite-card.unsupported').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Davranış sınavını başlat' }).isEnabled(), true);
    assert.doesNotMatch(await page.locator('.candidate-panel').innerText(), /Adaylar betiktir|10 \/ 6/);
  });
  await check('Exam shows follow-up reasons, base test, results and examiner decision separately', async () => {
    await open(); await page.locator('.followup-card').nth(1).waitFor();
    assert.match(await page.locator('.followups-panel').innerText(), /F01 · T01 takibi/);
    assert.match(await page.locator('.followups-panel').innerText(), /T01 parçalama baskısını sınamadı/);
    await page.getByRole('button', { name: 'Seçim kaydını incele ↗' }).click();
    assert.equal(await page.locator('.event-card.highlighted').count(), 1);
    assert.match(await page.locator('.evidence-records').innerText(), /e1/);
  });
  await check('Follow-up evidence filters events; finding click clears incompatible filters', async () => {
    await page.locator('.followup-card').nth(1).getByRole('button').click();
    assert.equal(await page.locator('.event-card').count(), 1);
    assert.match(await page.locator('.event-card.highlighted').innerText(), /F05 geçti/);
    await page.locator('.finding-card').click();
    assert.equal(await page.locator('.event-card').count(), 3);
    assert.match(await page.locator('.event-card.highlighted').innerText(), /F01 talebi/);
  });
  await check('Six required PASS does not override backend FAIL from a critical follow-up', async () => {
    await page.getByRole('button', { name: 'Karneyi incele →', exact: true }).click();
    assert.match(await page.locator('.verdict-title').innerText(), /İhlal bulundu/);
    assert.match(await page.locator('.report-counts').innerText(), /6\/6/);
    assert.equal(await page.locator('.followup-card').count(), 2);
    assert.equal(await page.locator('.report-grid tbody tr').count(), 6);
    await page.screenshot({ path: path.join(artifacts, 'followups-report-1440.png'), fullPage: true });
  });
  await check('Follow-up cards and evidence fit 390px, including keyboard activation', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const link = page.locator('.followup-card').first().getByRole('button');
    await link.focus(); await page.keyboard.press('Enter');
    await page.locator('.event-card.highlighted').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, 'followups-exam-390.png'), fullPage: true });
  });
  await check('Polling updates pending follow-up to cancelled and preserves missing evidence warning', async () => {
    run.status = 'RUNNING'; run.verdict = null; run.followUps[0].testStatus = 'PENDING'; run.followUps[0].reason = '';
    await open(); await page.locator('.followup-card .tone-PENDING').waitFor();
    run.status = 'CANCELLED'; run.followUps[0].testStatus = 'CANCELLED'; run.followUps[0].reason = 'Takip yarıda kaldı';
    run.followUps[0].evidenceEventIds = ['missing-event'];
    await page.locator('.followup-card .tone-CANCELLED').waitFor({ timeout: 8000 });
    await page.locator('.followup-card').first().getByRole('button').click();
    await page.locator('.evidence-records .warning-banner').waitFor();
    assert.match(await page.locator('.evidence-records').innerText(), /missing-event/);
  });
  await check('Empty, missing legacy field, and examiner failure never imply follow-up success', async () => {
    run.status = 'COMPLETED'; run.verdict = 'PASS'; run.followUps = [];
    events = [{ ...events[0], summary: 'UI STUB: sınavcı çalışamadı', payload: { error: true } }];
    await open(); await page.locator('.followups-panel .warning-banner').waitFor();
    assert.match(await page.locator('.followups-panel').innerText(), /geçtiği anlamına gelmez/);
    delete run.followUps; await open();
    assert.match(await page.locator('.followups-panel').innerText(), /eski API kaydı olabilir/);
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(artifacts, 'followups-checks.json'), JSON.stringify({ scope: 'UI HTTP contract stubs only, no paid model calls', checks, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
