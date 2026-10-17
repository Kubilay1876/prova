import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { liveApi, ApiError } from './api';
import { fixtureApi } from './fixture';
import { comparable, evidenceFor, isActive, mergeEvents } from './domain';
import { compareDigest, verifyFile, type Verification } from './verify';
import { chainManifest } from './chain-manifest';
import type { Candidate, Finding, Health, Run, RunEvent, RunSummary, TestDefinition } from './types';

type View = 'connect' | 'exam' | 'report' | 'verify';
type Mode = 'live' | 'demo';
const labels: Record<string, string> = {
  PASS: 'Geçti', FAIL: 'İhlal bulundu', INCONCLUSIVE: 'Kanıt yetersiz', MATCH: 'Hash eşleşti', UNCOMPARED: 'Karşılaştırılmadı', INVALID_REFERENCE: 'Referans geçersiz', PENDING: 'Bekliyor', RUNNING: 'Sürüyor', QUEUED: 'Sırada', COMPLETED: 'Tamamlandı', PARTIAL: 'Kısmi', CANCELLED: 'İptal edildi', ERROR: 'Hata', NOT_TRIGGERED: 'Tetiklenmedi', UNSUPPORTED: 'Desteklenmiyor', NOT_CONFIGURED: 'Hazır değil', VERIFIED: 'Doğrulandı', LOCAL_ONLY: 'Yerel karne', FUJI_VERIFIED: 'Backend: Fuji doğrulandı', CRITICAL: 'Kritik', HIGH: 'Yüksek', FUNCTIONAL: 'İşlevsel', UNCONFIGURED: 'Doğrulanmadı', MISSING_SOURCE: 'Kaynak eksik', NOT_FOUND: 'Kayıt bulunamadı', MISMATCH: 'Eşleşmedi',
};
function Badge({ value, children }: { value?: string | null; children?: ReactNode }) { return <span className={`badge tone-${value ?? 'neutral'}`}>{children ?? (value ? labels[value] ?? value : 'Henüz yok')}</span>; }
const short = (value: string | null | undefined) => value ? `${value.slice(0, 10)}…${value.slice(-6)}` : 'Bilinmiyor';
const date = (value: string | null) => value ? new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const errorText = (e: unknown) => e instanceof Error ? e.message : 'İşlem tamamlanamadı.';
const steps = [{ key: 'connect' as const, title: 'Adayı bağla', sub: 'Sürüm ve kapsam' }, { key: 'exam' as const, title: 'Sınavı izle', sub: 'Olaylar ve kanıtlar' }, { key: 'report' as const, title: 'Karneyi incele', sub: 'Bulgular ve karşılaştırma' }];
const requiredTests = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'];

export function App() {
  const initial = new URLSearchParams(location.search);
  const [mode, setMode] = useState<Mode>(initial.get('mode') === 'demo' ? 'demo' : 'live');
  const [view, setView] = useState<View>(location.pathname === '/verify' || location.hash === '#verify' ? 'verify' : initial.has('run') ? 'exam' : 'connect');
  const [health, setHealth] = useState<Health | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tests, setTests] = useState<TestDefinition[]>([]);
  const [missingDefinitions, setMissingDefinitions] = useState<string[]>([]);
  const [suiteVersion, setSuiteVersion] = useState('—');
  const [candidateId, setCandidateId] = useState('');
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [runId, setRunId] = useState<string | null>(initial.get('run'));
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [compareId, setCompareId] = useState('');
  const [comparison, setComparison] = useState<Run | null>(null);
  const [comparisonError, setComparisonError] = useState('');
  const [retry, setRetry] = useState(0);
  const [requestPending, setRequestPending] = useState(false);
  const [conflictRunId, setConflictRunId] = useState<string | null>(null);
  const pendingRequest = useRef<{ id: string; candidateId: string; testIds: string[] } | null>(null);
  const startLock = useRef(false);
  const seq = useRef(0);
  const api = mode === 'demo' ? fixtureApi : liveApi;
  const selectedCandidate = candidates.find(c => c.id === candidateId);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const result = await Promise.allSettled([api.health(), api.candidates(), api.tests(), api.runs()]);
    setLoading(false);
    return result;
  }, [api]);
  useEffect(() => {
    if (view === 'verify') { setError(''); setLoading(false); return; }
    let active = true;
    setHealth(null); setCandidates([]); setTests([]); setHistory([]); setMissingDefinitions([]);
    void load().then(result => {
      if (!active) return;
      const [h, c, t, r] = result;
      if (h.status === 'fulfilled') setHealth(h.value);
      if (c.status === 'fulfilled') { setCandidates(c.value); setCandidateId(previous => c.value.some(item => item.id === previous) ? previous : c.value[0]?.id ?? ''); }
      if (t.status === 'fulfilled') {
        const missing = requiredTests.filter(id => !t.value.tests.some(test => test.id === id));
        setMissingDefinitions(missing);
        setTests(requiredTests.map(id => t.value.tests.find(test => test.id === id) ?? { id, title: 'Test tanımı eksik', description: 'API bu zorunlu testin tanımını döndürmedi. Kapsam doğrulanmadı.', required: true, supported: false, unsupportedReason: 'API tanımı eksik; gerçek destek durumu bilinmiyor.' }));
        setSuiteVersion(t.value.suiteVersion);
      }
      if (r.status === 'fulfilled') setHistory(r.value);
      const failure = result.find(item => item.status === 'rejected');
      if (failure?.status === 'rejected') setError(errorText(failure.reason));
    });
    return () => { active = false; };
  }, [load, retry, view === 'verify']);

  useEffect(() => {
    if (view === 'verify') return;
    setRun(null); setEvents([]); setEvidenceIds([]); setSelectedFinding(null); setPollError(''); setCancelPending(false); seq.current = 0;
    if (!runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const [r, e] = await Promise.allSettled([api.run(runId!), api.events(runId!, seq.current)]);
      if (stopped) return;
      if (r.status === 'fulfilled') { setRun(r.value); if (!isActive(r.value.status)) setCancelPending(false); }
      if (e.status === 'fulfilled') { setEvents(previous => mergeEvents(previous, e.value.events)); seq.current = Math.max(seq.current, e.value.lastSeq, ...e.value.events.map(event => event.seq)); }
      const failed = r.status === 'rejected' ? r.reason : e.status === 'rejected' ? e.reason : null;
      setPollError(failed ? errorText(failed) : '');
      if (failed || r.status === 'fulfilled' && isActive(r.value.status)) timer = setTimeout(() => { void tick(); }, failed ? 3000 : 1000);
      else {
        // The parallel event snapshot can precede the terminal status. Drain once after that status is known.
        try {
          const final = await api.events(runId!, seq.current);
          if (stopped) return;
          setEvents(previous => mergeEvents(previous, final.events));
          seq.current = Math.max(seq.current, final.lastSeq, ...final.events.map(event => event.seq));
        } catch (error) {
          if (stopped) return;
          setPollError(errorText(error)); timer = setTimeout(() => { void tick(); }, 3000); return;
        }
        void api.health().then(value => { if (!stopped) setHealth(value); }).catch(() => { /* Keep last known capabilities. */ });
        void api.runs().then(value => { if (!stopped) setHistory(value); }).catch(() => { /* Run remains visible if history refresh fails. */ });
      }
    }
    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [api, runId, retry, view === 'verify']);

  useEffect(() => {
    setComparison(null); setComparisonError('');
    if (!compareId) return;
    let active = true;
    void api.run(compareId).then(value => { if (active) setComparison(value); }).catch(e => { if (active) setComparisonError(errorText(e)); });
    return () => { active = false; };
  }, [api, compareId]);

  function updateUrl(nextMode: Mode, id: string | null) {
    const url = new URL(location.href); url.search = ''; url.hash = '';
    if (nextMode === 'demo') url.searchParams.set('mode', 'demo');
    if (id) url.searchParams.set('run', id);
    window.history.replaceState(null, '', url);
  }
  function switchMode(next: Mode) {
    setMode(next); setRunId(null); setView('connect'); setCompareId(''); setComparison(null); pendingRequest.current = null; setRequestPending(false); setError(''); updateUrl(next, null);
  }
  function openRun(id: string) {
    setRun(null); setEvents([]); setEvidenceIds([]); setSelectedFinding(null);
    if (id === runId) setRetry(value => value + 1);
    setRunId(id); setView('exam'); setFilter('ALL'); setCompareId(''); updateUrl(mode, id);
  }
  async function startRun() {
    if (startLock.current || !candidateId) return;
    startLock.current = true; setStarting(true); setError(''); setConflictRunId(null);
    if (!pendingRequest.current) pendingRequest.current = { id: crypto.randomUUID(), candidateId, testIds: [...requiredTests] };
    setRequestPending(true);
    try {
      const request = pendingRequest.current;
      const response = await api.start(request.id, request.candidateId, request.testIds);
      pendingRequest.current = null; setRequestPending(false); openRun(response.runId);
    } catch (e) {
      if (e instanceof ApiError && (e.status < 500 || e.code === 'DEPENDENCY_NOT_READY')) {
        pendingRequest.current = null; setRequestPending(false);
        if (e.code === 'RUN_IN_PROGRESS' && e.runId) setConflictRunId(e.runId);
        setError(errorText(e));
      } else setError(`${errorText(e)} Aynı başlatma kimliği korunuyor; tekrar denemek aynı isteği gönderir.`);
    }
    finally { startLock.current = false; setStarting(false); }
  }
  async function cancel() {
    if (!run || cancelBusy || cancelPending) return;
    setCancelBusy(true); setError('');
    try { const response = await api.cancel(run.id); setCancelPending(isActive(response.status)); setRetry(x => x + 1); }
    catch (e) { setError(errorText(e)); } finally { setCancelBusy(false); }
  }
  async function download() {
    if (!run || downloadBusy) return;
    setDownloadBusy(true); setError('');
    try { const blob = await api.report(run.id); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${mode === 'demo' ? 'UI-DEMO-sentetik-' : 'PROVA-karne-'}${run.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e) { setError(errorText(e)); } finally { setDownloadBusy(false); }
  }
  function showFinding(finding: Finding) { setFilter('ALL'); setSelectedFinding(finding); setEvidenceIds(finding.evidenceEventIds); setView('exam'); }
  function showTestEvidence(testId: string, ids: string[]) { setFilter(testId); setEvidenceIds(ids); setSelectedFinding(null); setView('exam'); }
  const activeRun = Boolean(run && isActive(run.status));
  const evidence = evidenceFor(evidenceIds, events);
  const filteredEvents = events.filter(event => filter === 'ALL' || event.testId === filter);
  // Scripted stand-ins intentionally run without LLM access. A owns dependency readiness and returns 503 when needed.
  const ready = mode === 'demo' || health?.capabilities.atkExam.status === 'VERIFIED';

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#connect" onClick={e => { e.preventDefault(); setView('connect'); }} aria-label="PROVA başlangıç"><span className="brand-icon">P<span>✓</span></span><span>PROVA<small>AGENT SINAV ALANI</small></span></a>
      <div className="workspace-label">ÇALIŞMA ALANI <span>01</span></div>
      <nav aria-label="Ana gezinme">{steps.map((step, i) => <button key={step.key} className={`nav-item ${view === step.key ? 'active' : ''}`} onClick={() => setView(step.key)} aria-current={view === step.key ? 'page' : undefined}><span className="nav-number">0{i + 1}</span>{step.title}<span className="nav-arrow">↗</span></button>)}<div className="nav-divider"/><button className={`nav-item ${view === 'verify' ? 'active' : ''}`} onClick={() => setView('verify')} aria-current={view === 'verify' ? 'page' : undefined}><span className="nav-number">◇</span>Karneyi doğrula<span className="nav-arrow">↗</span></button></nav>
      <div className="sidebar-note"><span className="note-icon">↳</span><strong>Güven, kanıttan başlar.</strong><p>Agent’ın ne istediğini, defterde ne olduğunu ve geçidin neyi durdurduğunu birlikte incele.</p></div>
      <div className="sidebar-footer"><span className="dot"/> Yerel çalışma alanı <small>API v1 · Fuji test ağına hazır</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Çalışma alanı <span>/</span> <strong>{view === 'verify' ? 'Bağımsız doğrulayıcı' : steps.find(s => s.key === view)?.title}</strong></div><div className="top-actions"><span className={`connection ${health && mode === 'live' ? 'connected' : ''}`}><span className="dot"/>{mode === 'demo' ? 'Sentetik arayüz' : health ? 'Yerel API yanıt verdi' : 'API bağlantısı yok'}</span><label className="mode-select"><span className="sr-only">Veri modu</span><select value={mode} disabled={starting || activeRun || requestPending} onChange={e => switchMode(e.target.value as Mode)}><option value="live">Gerçek API</option><option value="demo">UI Demo</option></select></label></div></header>
      <main>
        {mode === 'demo' && <div className="demo-banner" role="status"><span>◈</span><div><strong>UI DEMO — sentetik arayüz verisi</strong><span>Gerçek model/ATK çalışması, canlı emir veya zincir kaydı değildir.</span></div><button className="text-button" disabled={activeRun || requestPending} onClick={() => switchMode('live')}>Gerçek API’ye geç ↗</button></div>}
        {error && <div className="error-banner" role="alert"><strong>İşlem tamamlanamadı</strong><p>{error}</p><button onClick={() => setRetry(x => x + 1)}>Bağlantıyı yeniden dene</button>{conflictRunId && <button onClick={() => { openRun(conflictRunId); setError(''); setConflictRunId(null); }}>Süren koşuyu aç →</button>}{mode === 'live' && !activeRun && !requestPending && <button onClick={() => switchMode('demo')}>Etiketli UI demosunu aç</button>}</div>}
        {view === 'verify' ? <Verifier expectedHash={run?.reportHash?.value} expectedRunId={run?.id}/> : <>
          <section className="page-heading"><div><div className="eyebrow">KANITA DAYALI AGENT DEĞERLENDİRMESİ</div><h1>{view === 'connect' ? 'Yetki vermeden önce, sına.' : view === 'exam' ? 'Karardan kanıta.' : 'Sonucu değil, kanıtı oku.'}</h1><p>{view === 'connect' ? 'Kontrollü hata senaryolarında agent davranışını gözle. Her bulguyu kaynağına kadar izle.' : view === 'exam' ? 'Adayın talebi, sanal defter ve geçit kararı aynı zaman çizelgesinde.' : 'Backend’in verdiği hüküm, gerçek kapsam ve sürümler arasındaki fark bir arada.'}</p></div><div className="heading-stamp"><span>PROVA / LAB</span><strong>06</strong><small>DAVRANIŞ TESTİ</small></div></section>
          <div className="stepper" aria-label="Sınav adımları">{steps.map((step, i) => <button key={step.key} className={view === step.key ? 'current' : ''} onClick={() => setView(step.key)} aria-current={view === step.key ? 'step' : undefined}><span className="step-index">0{i + 1}</span><span><strong>{step.title}</strong><small>{step.sub}</small></span><span className="step-arrow">→</span></button>)}</div>
          <Reality run={run}/>
          {view === 'connect' && <>
            <div className="connect-grid"><section className="panel candidate-panel"><div className="section-top"><div><div className="eyebrow">01 / ADAY VE SÜRÜM</div><h2>Sınava girecek agent</h2></div><Badge>{mode === 'demo' ? 'UI fixture' : 'API v1'}</Badge></div>
              <label className="field-label" htmlFor="candidate">Aday sürümü</label><select id="candidate" className="wide-select" value={candidateId} disabled={loading || requestPending || activeRun} onChange={e => setCandidateId(e.target.value)}>{!candidates.length && <option value="">{loading ? 'Adaylar yükleniyor…' : 'Aday bulunamadı'}</option>}{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select>
              <dl className="candidate-meta"><div><dt>Sürüm kimliği</dt><dd><code title={selectedCandidate?.versionHash ?? undefined}>{short(selectedCandidate?.versionHash)}</code></dd></div><div><dt>Aday kaynağı</dt><dd>{selectedCandidate?.provenance === 'TEAM_DEMO' ? 'Takım adayı' : selectedCandidate ? 'Dış aday' : '—'}</dd></div><div><dt>Desteklenen kapsam</dt><dd>{selectedCandidate ? `${requiredTests.filter(id => selectedCandidate.supportedTestIds.includes(id)).length} / 6 zorunlu test` : 'Bilinmiyor'}</dd></div></dl>
              <div className="inline-note">Adayın türü ve modeli API’den gelen adında belirtilir. LLM bağlantısı ilk başarılı model çağrısından sonra doğrulanır. Emirler yerel sanal borsada yürütülür.</div>
              <button className="primary full" disabled={starting || loading || !candidateId || !tests.length || !ready || activeRun || missingDefinitions.length > 0} onClick={() => void startRun()}>{starting ? 'Başlatma yanıtı bekleniyor…' : requestPending ? 'Aynı isteği tekrar dene' : 'Davranış sınavını başlat'}<span>→</span></button>
              <p className="helper">{missingDefinitions.length ? `API test tanımları eksik: ${missingDefinitions.join(', ')}. A’nın tanımları tamamlaması gerekiyor; desteklenmeyen test de listede bulunmalı.` : !ready ? 'ATK sınav bağlantısı VERIFIED olmalı. Betik adaylar LLM bağlantısı gerektirmez.' : requestPending ? 'Yanıt kesinleşene kadar aday ve başlatma kimliği korunur.' : 'Altı test istenir; desteklenmeyen veya eksik testler karnede açıkça görünür.'}</p>
            </section><section className="panel"><div className="section-top"><div><div className="eyebrow">BAĞLANTI KONTROLÜ</div><h2>Sınav ortamı</h2></div><button className="icon-button" aria-label="Bağlantı durumunu yenile" disabled={loading} onClick={() => setRetry(x => x + 1)}>↻</button></div>
              <div className="capabilities">{(['llm', 'atkMarket', 'atkExam', 'chain'] as const).map((key, i) => <div className="capability" key={key}><span className="cap-icon">{['✧', '⇄', '⌘', '◇'][i]}</span><div><strong>{['LLM bağlantısı', 'ATK piyasa verisi', 'ATK sınav araçları', 'Avalanche Fuji kaydı'][i]}</strong><small>{health?.capabilities[key].message ?? 'API yanıtı bekleniyor.'}</small>{health?.capabilities[key].checkedAt && <small>Kontrol: {date(health.capabilities[key].checkedAt)}</small>}</div><Badge value={health?.capabilities[key].status ?? 'NOT_CONFIGURED'}/></div>)}</div>
              <div className="soft-note">API erişimi, araç bağlantısının doğrulandığı anlamına gelmez. Her durum backend’den ayrı alınır.</div>
            </section></div>
            <section className="panel suite-panel"><div className="section-top"><div><div className="eyebrow">SABİT SINAV PAKETİ</div><h2>Altı test. Açık kapsam.</h2></div><code>{suiteVersion}</code></div><div className="suite-grid">{tests.map(test => { const supported = test.supported && Boolean(selectedCandidate?.supportedTestIds.includes(test.id)); return <article className={`suite-card ${!supported ? 'unsupported' : ''}`} key={test.id}><div><span className="test-id">{test.id}</span><Badge value={supported ? undefined : 'UNSUPPORTED'}>{missingDefinitions.includes(test.id) ? 'Tanım eksik' : supported ? 'Zorunlu test' : undefined}</Badge></div><h3>{test.title}</h3><p>{test.description}</p>{!supported && <small>{test.unsupportedReason ?? 'Seçilen aday bu testi desteklemiyor; kapsamda eksik olarak gösterilir.'}</small>}</article>; })}</div>{!tests.length && <Empty title={loading ? 'Test paketi yükleniyor' : 'Test paketi alınamadı'} text="API bağlantısını kontrol et veya etiketli UI demosunu seç."/>}</section>
          </>}
          {view === 'exam' && (!run ? <Empty title={runId ? 'Koşu verisi bekleniyor' : 'Henüz bir sınav açılmadı'} text={pollError || 'Aday ekranından bir koşu başlat veya geçmişten bir karne aç.'} action={<button onClick={() => setView('connect')}>Adayı seç →</button>}/> : <>
            <div className="run-bar"><div><span className="eyebrow">{mode === 'demo' ? 'SENTETİK KOŞU' : 'KOŞU'}</span><strong title={run.id}>{run.id}</strong><small>{date(run.startedAt)} · İstanbul</small></div><div><Badge value={run.status}/>{activeRun && <button className="danger-outline" disabled={cancelBusy || cancelPending || run.cancelRequested} onClick={() => void cancel()}>{cancelPending || run.cancelRequested ? 'Durdurma onayı bekleniyor…' : 'Sınavı durdur'}</button>}{!activeRun && <button className="primary" onClick={() => setView('report')}>Karneyi incele →</button>}</div></div>
            {pollError && <div className="error-banner" role="alert">{pollError} Son alınan olaylar korunuyor; bağlantı tekrar denenecek.</div>}
            {(cancelPending || run.cancelRequested) && activeRun && <div className="warning-banner" role="status">Durdurma istendi. Kesin iptal henüz bildirilmedi; yoldaki çağrı tamamlanabilir.</div>}
            <FollowUps run={run} events={events} onEvidence={showTestEvidence}/>
            <div className="exam-grid"><section className="panel test-list"><div className="section-top"><h2>Testler</h2><span className="muted">{run.counts.requiredResolved} / {run.counts.requiredTotal} kesin</span></div><button className={`test-row ${filter === 'ALL' ? 'selected' : ''}`} onClick={() => setFilter('ALL')}><span>Tümü</span><span>{events.length} olay</span></button>{tests.map(test => { const result = run.tests.find(t => t.testId === test.id); return <button key={test.id} className={`test-row ${filter === test.id ? 'selected' : ''}`} onClick={() => setFilter(test.id)}><span className="test-id">{test.id}</span><strong>{test.title}</strong><Badge value={result?.testStatus ?? 'PENDING'}/><small>{result?.reason ?? (run.selectedTestIds.includes(test.id) ? 'Sonuç bekleniyor.' : 'Bu koşuda seçilmedi.')}</small></button>; })}</section>
              <section className="panel event-panel"><div className="section-top"><div><div className="eyebrow">SIRALI KAYIT</div><h2>Olay akışı</h2></div><span className={`stream-status ${activeRun ? 'stream-active' : ''}`}><span className="dot"/>{activeRun ? '1 sn / polling' : 'Akış sona erdi'}</span></div>
                <div className="event-legend"><span>◯ Aday talebi</span><span>▤ Sanal defter</span><span>◇ Geçit kararı</span></div>
                <div className="timeline">{filteredEvents.map(event => <button key={event.seq} className={`event-card event-${event.kind} ${evidenceIds.includes(event.id) ? 'highlighted' : ''}`} onClick={() => { setSelectedFinding(null); setEvidenceIds([event.id]); }}><span className="timeline-dot"/><div className="event-meta"><span>#{String(event.seq).padStart(3, '0')} · {event.actor}</span><time>{date(event.timestamp)}</time></div><strong>{event.summary}</strong><span className="event-kind">{event.kind} <span>↗</span></span></button>)}{!filteredEvents.length && <Empty title="Olay bekleniyor" text="Boş yanıt, daha önce alınan olayları silmez."/>}</div>
              </section><aside className="panel evidence-panel"><div className="section-top"><div><div className="eyebrow">KAYNAĞINA KADAR</div><h2>Kanıt paneli</h2></div><span>↗</span></div>
                {run.findings.length > 0 && <div className="findings-stack">{run.findings.map(finding => <button className={`finding-card ${selectedFinding?.id === finding.id ? 'chosen' : ''}`} key={finding.id} onClick={() => showFinding(finding)}><Badge value={finding.severity}/><strong>{finding.title}</strong><span>{finding.testId} · {finding.evidenceEventIds.length} kanıt olayı →</span></button>)}</div>}
                {selectedFinding && <div className="finding-detail"><h3>{selectedFinding.title}</h3><span className="field-label">GÖZLENEN</span><p>{selectedFinding.observed}</p><span className="field-label">BEKLENEN</span><p>{selectedFinding.expected}</p><code>{selectedFinding.ruleId}</code></div>}
                {evidenceIds.length === 0 ? <div className="evidence-empty"><span>⌕</span><h3>Her bulgunun bir izi var.</h3><p>Bir bulguya veya olaya tıkla; ilgili kayıt ve ham kanıt burada açılır.</p></div> : <div className="evidence-records">{evidence.missing.length > 0 && <div className="warning-banner">Kanıt boşluğu: {evidence.missing.join(', ')} kayıtta bulunamadı. {activeRun ? 'Akış sürüyor.' : 'Backend kanıtı eksik.'}</div>}{evidence.events.map(event => <details key={event.id} open><summary>#{event.seq} · {event.actor}<small>{event.id}</small></summary><p>{event.summary}</p><pre>{JSON.stringify(event.payload, null, 2)}</pre></details>)}</div>}
              </aside></div>
          </>)}
          {view === 'report' && (!run ? <Empty title="İncelenecek karne seç" text="Bir sınav başlat veya aşağıdaki geçmişten koşu aç."/> : <>
            <section className="panel report-hero"><div><div className="eyebrow">{mode === 'demo' ? 'UI DEMO / SENTETİK KARNE' : 'BACKEND DEĞERLENDİRMESİ'}</div><h2>Sınav sonucu</h2><h3 className="verdict-title">{run.verdict ? labels[run.verdict] : 'Henüz kesin hüküm yok'}</h3><p>Yürütme durumu: <Badge value={run.status}/></p><p className="muted">{run.status === 'PARTIAL' ? 'Kısmi sınav: altı testin tamamı sınanmadı.' : 'Yürütmenin bitmesi, bütün testlerin geçtiği anlamına gelmez.'}</p></div><div className="report-counts"><div><strong>{run.counts.requiredPassed}<small>/{run.counts.requiredTotal}</small></strong><span>Zorunlu test geçti</span></div><div><strong>{run.counts.requiredFailed}</strong><span>Zorunlu test ihlali</span></div><div><strong>{run.counts.requiredResolved}<small>/{run.counts.requiredTotal}</small></strong><span>Kesin sonuçlandı</span></div></div><button className="primary" disabled={activeRun || downloadBusy} onClick={() => void download()}>{downloadBusy ? 'İndiriliyor…' : mode === 'demo' ? 'UI demo JSON indir ↓' : 'Backend karnesini indir ↓'}</button></section>
            <div className="report-grid"><section className="panel"><div className="section-top"><h2>Test sonuçları</h2><span className="muted">Hüküm kaynağı: {mode === 'demo' ? 'UI fixture' : 'backend'}</span></div><div className="table-scroll"><table><thead><tr><th>Test</th><th>Sonuç</th><th>Gerekçe / kapsam</th><th>Kanıt</th></tr></thead><tbody>{tests.map(test => { const result = run.tests.find(t => t.testId === test.id); return <tr key={test.id}><td><code>{test.id}</code><strong>{test.title}</strong></td><td><Badge value={result?.testStatus ?? 'PENDING'}/></td><td>{result?.reason ?? 'Bu test için sonuç yok; tam kapsam doğrulanmadı.'}</td><td>{result?.evidenceEventIds.length ? <button onClick={() => { showTestEvidence(test.id, result.evidenceEventIds); }}>{result.evidenceEventIds.length} olay ↗</button> : '—'}</td></tr>; })}</tbody></table></div>
              {run.findings.map(finding => <button className="report-finding" key={finding.id} onClick={() => showFinding(finding)}><Badge value={finding.severity}/><strong>{finding.title}</strong><span>Kanıta git ↗</span></button>)}
            </section><section className="panel identity-panel"><div className="section-top"><h2>Karne kaydı</h2><Badge value={run.credentialStatus}/></div><dl>{([['Koşu', run.id], ['Aday', run.candidateId], ['Aday sürümü', run.candidateVersionHash], ['Paket / suite', run.suiteHash], ['Fixture', run.fixtureHash], ['Politika', run.policyHash], ['Rapor SHA-256', run.reportHash?.value]] as const).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><code>{value ?? 'Henüz bilinmiyor'}</code></dd></div>)}</dl><p className="helper">Seçili testler: {run.selectedTestIds.join(', ') || 'Yok'}</p><div className="mini-counts"><span>{run.counts.modelCalls} model çağrısı</span><span>{run.counts.toolCalls} araç çağrısı</span><span>{run.counts.attemptedViolations} ihlal talebi</span><span>{run.counts.blockedEffects} engellenen etki</span></div><div className="soft-note">{run.receipt ? `Backend makbuz bildirimi: ${run.receipt.verificationStatus}. Bağımsız kontrol için tam rapor dosyasını doğrula.` : run.credentialStatus === 'PENDING' ? 'Zincir kaydı bekliyor. Güncel kayıt durumu için koşuyu yeniden aç.' : 'Zincir makbuzu yok. Doğrulanmış zincir kaydı gösterilemiyor.'}</div><button className="secondary full" onClick={() => setView('verify')}>Dosyayı bağımsız doğrula ↗</button></section></div>
            <FollowUps run={run} events={events} onEvidence={showTestEvidence}/>
            <section className="panel"><div className="section-top"><div><div className="eyebrow">AYNI KOŞULLAR, FARKLI SÜRÜMLER</div><h2>Koşuları karşılaştır</h2></div></div><label className="field-label" htmlFor="compare">Karşılaştırılacak koşu</label><select id="compare" className="wide-select" value={compareId} onChange={e => setCompareId(e.target.value)}><option value="">Geçmişten bir koşu seç</option>{history.filter(item => item.id !== run.id).map(item => <option key={item.id} value={item.id}>{item.id} · {short(item.candidateVersionHash)}</option>)}</select>{comparisonError && <p role="alert">{comparisonError}</p>}{comparison && <><div className={comparable(run, comparison) ? 'soft-note' : 'warning-banner'}>{comparable(run, comparison) ? 'Paket, fixture ve politika hash’leri aynı. Sabit altı test aynı koşullarda karşılaştırılabilir. Sınavcının seçtiği takip testleri farklı olabilir; genel hükümler bu farktan etkilenebilir.' : 'Eşdeğer değil: paket, fixture veya politika hash’i farklı ya da eksik. Sonuç farkı sürümün iyileştiğini kanıtlamaz.'}</div><div className="table-scroll"><table><thead><tr><th>Alan</th><th>Bu koşu</th><th>Diğer koşu</th></tr></thead><tbody><tr><td>Aday sürümü</td><td><code title={run.candidateVersionHash ?? ''}>{short(run.candidateVersionHash)}</code></td><td><code title={comparison.candidateVersionHash ?? ''}>{short(comparison.candidateVersionHash)}</code></td></tr>{(['suiteHash', 'fixtureHash', 'policyHash'] as const).map(key => <tr key={key}><td>{key}</td><td><code title={run[key] ?? ''}>{short(run[key])}</code></td><td><code title={comparison[key] ?? ''}>{short(comparison[key])}</code></td></tr>)}<tr><td>Seçilen takip testleri</td><td>{run.followUps?.map(t => t.testId).join(', ') || 'Kayıt yok'}</td><td>{comparison.followUps?.map(t => t.testId).join(', ') || 'Kayıt yok'}</td></tr><tr><td>Backend hükmü</td><td><Badge value={run.verdict}/></td><td><Badge value={comparison.verdict}/></td></tr>{tests.map(test => <tr key={test.id}><td>{test.id} · {test.title}</td><td><Badge value={run.tests.find(t => t.testId === test.id)?.testStatus}/></td><td><Badge value={comparison.tests.find(t => t.testId === test.id)?.testStatus}/></td></tr>)}</tbody></table></div></>}</section>
          </>)}
          <section className="panel history-panel"><div className="section-top"><div><div className="eyebrow">KALDIĞIN YERDEN DEVAM ET</div><h2>Koşu geçmişi</h2></div><button className="text-button" disabled={loading} onClick={() => setRetry(x => x + 1)}>Yenile ↻</button></div>{history.length === 0 ? <p className="empty-inline">{loading ? 'Geçmiş yükleniyor…' : mode === 'live' && !health ? 'API erişilemediği için geçmiş alınamadı.' : 'Henüz kayıtlı bir koşu yok.'}</p> : <div className="table-scroll"><table><thead><tr><th>Koşu</th><th>Aday sürümü</th><th>Başlangıç</th><th>Yürütme</th><th>Hüküm</th><th><span className="sr-only">İşlem</span></th></tr></thead><tbody>{history.map(item => <tr key={item.id}><td><code className="run-id" title={item.id}>{item.id}</code></td><td><code title={item.candidateVersionHash ?? ''}>{short(item.candidateVersionHash)}</code></td><td>{date(item.startedAt)}</td><td><Badge value={item.status}/></td><td><Badge value={item.verdict}/></td><td><button className="text-button" onClick={() => openRun(item.id)}>Aç ↗</button></td></tr>)}</tbody></table></div>}</section>
        </>}
        <footer className="page-footer"><span>PROVA <span> / </span> Davranışa bak. Kanıtı izle.</span><span>Yerel sınav · Sanal yürütme · Açık kapsam</span></footer>
      </main>
    </div>
  </div>;
}

function FollowUps({ run, events, onEvidence }: { run: Run; events: RunEvent[]; onEvidence: (testId: string, ids: string[]) => void }) {
  const decisions = events.filter(event => event.kind === 'EXAMINER_DECISION' && event.actor === 'EXAMINER' && event.testId === null);
  const rows = run.followUps ?? [];
  return <section className="panel followups-panel" aria-label="Takip testleri">
    <div className="section-top"><div><div className="eyebrow">SINAVCININ SEÇTİĞİ EK KAPSAM</div><h2>Takip testleri</h2></div><Badge>{rows.length} kayıtlı seçim</Badge></div>
    <p className="helper">Zorunlu altı testten ayrı değerlendirilir. Sınavcı test seçer; hükmü backend’in kod değerlendiricisi verir. Kritik takip bulgusu genel hükmü etkileyebilir.</p>
    {decisions.map(event => <div className={event.payload.error === true ? 'warning-banner' : 'soft-note'} key={event.id}><strong>Sınavcı bildirimi</strong><p>{event.summary}</p><button className="text-button" onClick={() => onEvidence('ALL', [event.id])}>Seçim kaydını incele ↗</button></div>)}
    {rows.length === 0 ? <p className="empty-inline">{run.followUps === undefined ? 'Bu koşu takip testi alanı içermiyor; eski API kaydı olabilir.' : isActive(run.status) ? 'Henüz takip testi bildirilmedi. Sınavcı seçimi geldiğinde burada görünür.' : 'Bu koşuda takip testi kaydı yok. Bu durum takip testlerinin geçtiği anlamına gelmez.'}</p> : <div className="followups-grid">{rows.map(row => <article className="followup-card" key={row.testId}>
      <div className="section-top"><span className="test-id">{row.testId} · {row.baseTestId} takibi</span><Badge value={row.testStatus}/></div>
      <h3>{row.title}</h3><span className="field-label">SINAVCININ SEÇİM GEREKÇESİ</span><p>{row.examinerReason || 'Gerekçe bildirilmedi.'}</p>
      <span className="field-label">TEST SONUCU / KAPSAM</span><p>{row.reason || 'Sonuç henüz bildirilmedi.'}</p>
      <button className="secondary" onClick={() => onEvidence(row.testId, row.evidenceEventIds)}>{row.evidenceEventIds.length ? `${row.evidenceEventIds.length} kanıt olayı ↗` : 'Test akışını aç ↗'}</button>
    </article>)}</div>}
  </section>;
}

function Reality({ run }: { run: Run | null }) {
  return <div className="reality-strip" aria-label="Veri ve yürütme gerçekliği">{[
    ['ARAÇ KÖKENİ', run?.reality.toolOrigin === 'ATK_MCP' ? 'ATK MCP · backend bildirimi' : 'Doğrulanmadı'],
    ['VERİ KAYNAĞI', ({ LIVE: 'Canlı piyasa verisi', CAPTURED: 'Kaydedilmiş veri', SYNTHETIC: 'Sentetik veri', MODIFIED_MARKET: 'Değiştirilmiş piyasa' } as Record<string, string>)[run?.reality.marketSource ?? ''] ?? 'Henüz bilinmiyor'],
    ['YÜRÜTME', run?.reality.execution === 'SIMULATED' ? 'Sanal emir' : 'İşlem yok'],
    ['KAYIT AĞI', run?.reality.network === 'FUJI' ? 'Fuji · test ağı' : 'Yerel · zincir kaydı yok'],
  ].map(([title, value]) => <div key={title}><span>{title}</span><strong>{value}</strong></div>)}</div>;
}
function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><span>↳</span><h3>{title}</h3><p>{text}</p>{action}</div>; }
function Verifier({ expectedHash, expectedRunId }: { expectedHash?: string; expectedRunId?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [expected, setExpected] = useState(expectedHash ?? new URLSearchParams(location.search).get('expectedHash') ?? '');
  const [result, setResult] = useState<Verification | null>(null);
  const [comparison, setComparison] = useState<ReturnType<typeof compareDigest> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  async function verify() {
    if (!file || busy) return;
    const id = ++request.current; setBusy(true); setError(''); setResult(null); setComparison(null);
    try {
      const value = await verifyFile(file);
      if (id === request.current) { setResult(value); setComparison(compareDigest(value.digest, expected)); }
    } catch (e) { if (id === request.current) setError(errorText(e)); }
    finally { if (id === request.current) setBusy(false); }
  }
  return <>
    <section className="page-heading"><div><div className="eyebrow">BAĞIMSIZ / SALT OKUMA</div><h1>Karne değişmiş mi?</h1><p>Dosyanın tam baytlarını cihazında hash’le ve beklenen rapor hash’iyle karşılaştır. Backend bağlantısı gerekmez; zincir kontrolü için Fuji RPC erişimi gerekir.</p></div><div className="heading-stamp"><span>PROVA / VERIFY</span><strong>◇</strong><small>İMZA GEREKMEZ</small></div></section>
    <div className="verify-grid"><section className="panel">
      <div className="section-top"><h2>Rapor dosyasını seç</h2><Badge>SHA-256</Badge></div>
      <label className="file-drop"><span>⇧</span><strong>{file?.name ?? 'Dondurulmuş JSON karneyi seç'}</strong><small>En fazla 15 MB · Dosya cihazında kalır</small><input type="file" accept=".json,application/json" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); setComparison(null); setError(''); }}/></label>
      <p className="helper">Dosya parse edilip yeniden yazılmaz; indirilen baytlar doğrudan hash’lenir. Dosyadaki RPC, URL veya kontrat adresleri çağrılmaz.</p>
      <label className="field-label expected-hash-label" htmlFor="expected-hash">Beklenen SHA-256 · isteğe bağlı</label>
      <input id="expected-hash" className="wide-select hash-input" type="text" value={expected} spellCheck={false} autoComplete="off" disabled={busy} placeholder="64 karakterli referans hash · isteğe bağlı" onChange={e => { setExpected(e.target.value); setResult(null); setComparison(null); }}/>
      <p className="helper">{expectedRunId && expectedHash ? `Seçili koşunun backend bildirimi: ${expectedRunId}. Değer API’den alındı; zincir kanıtı değildir.` : 'Yerel karşılaştırma için daha önce kaydettiğin run.reportHash.value değerini gir. Boş bırakırsan Fuji kaydı yine kontrol edilir.'}</p>
      <button className="primary full" disabled={!file || busy} onClick={() => void verify()}>{busy ? 'Dosya ve Fuji kaydı inceleniyor…' : 'Dosyayı doğrula'}<span>→</span></button>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {result && <div className="verification-result" role="status">
        <h3>Dosya bütünlüğü</h3>{comparison && <><Badge value={comparison.state}/><p>{comparison.message}</p></>}
        <label className="field-label">DOSYANIN SHA-256 DEĞERİ</label><code>{result.digest}</code>
        <h3 className="chain-result-title">Karne kaydı</h3><Badge value={result.state}/><p>{result.message}</p>
        {result.txHash && <a target="_blank" rel="noreferrer" href={`https://testnet.snowtrace.io/tx/${result.txHash}`}>Fuji işlemini aç ↗</a>}
      </div>}
    </section><section className="panel verify-explainer"><div className="eyebrow">ŞU AN NE KONTROL EDİLİR?</div><h2>Dosya → SHA-256 → Fuji kaydı</h2>
      <ol><li><strong>Tam dosya baytları</strong><p>SHA-256 cihazında hesaplanır; dosya dışarı gönderilmez.</p></li><li><strong>Beklenen rapor hash’i</strong><p>run.reportHash.value ile eşleşme gösterilir. Boş veya geçersiz referans açıkça belirtilir.</p></li><li><strong>Fuji olayı ve işlem makbuzu</strong><p>Hash’in kayıt bloğu bulunur; sabit kontrat, kayıtçı, aday sürümü ve paket özeti başarılı işlemdeki olayla karşılaştırılır.</p></li></ol>
      <div className="soft-note">Hash eşleşmesi, dosyanın referans alınan baytlarla aynı olduğunu gösterir. Adayın davranışının güvenli olduğunu veya sınav hükmünün doğruluğunu tek başına kanıtlamaz.</div>
      <dl className="verify-network"><div><dt>Ağ</dt><dd>Avalanche Fuji · test ağı · {chainManifest.chainId}</dd></div><div><dt>Sabit kontrat</dt><dd><code>{chainManifest.contractAddress}</code></dd></div><div><dt>İzinli kayıtçı</dt><dd><code>{chainManifest.recorderAddress}</code></dd></div></dl><p className="helper">Her dosyanın kaydı ayrıca kontrol edilir. Kayıt bulunamaması, RPC hatası ve bekleyen onay başarıya çevrilmez. Bu özel PROVA kayıt sözleşmesidir.</p>
    </section></div>
  </>;
}
