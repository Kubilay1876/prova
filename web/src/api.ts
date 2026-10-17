import type { Api, Health, Candidate, TestDefinition, Run, RunSummary, EventsResponse, Status } from './types.ts';
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public runId?: string) { super(message); }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...init, signal: AbortSignal.timeout(12000), headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } }); }
  catch { throw new Error('Yerel API’ye ulaşılamadı. Backend aynı bilgisayarda 127.0.0.1:8787 üzerinde çalışmalı.'); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error(`API JSON yanıtı vermedi (HTTP ${response.status}).`); }
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; runId?: string } }).error;
    const code = error?.code ?? String(response.status);
    const explanation = code === 'RUN_IN_PROGRESS' ? 'Başka bir koşu sürüyor. Mevcut koşuyu aç veya bitmesini bekle.' : code === 'DEPENDENCY_NOT_READY' ? 'ATK sınav bağlantısı hazır değil. Backend’in bağlantı kontrolünü tamamlamasını bekle; sahte koşu başlatılmadı.' : error?.message ?? 'İstek tamamlanamadı.';
    throw new ApiError(code, `${code}: ${explanation}`, response.status, error?.runId);
  }
  if ((body as { apiVersion?: string }).apiVersion !== '1') throw new Error('API sürümü uyumsuz. Beklenen apiVersion: 1.');
  return body as T;
}
export const liveApi: Api = {
  health: () => request<Health>('/health'),
  candidates: async () => (await request<{ candidates: Candidate[] }>('/candidates')).candidates,
  tests: () => request<{ suiteVersion: string; tests: TestDefinition[] }>('/tests'),
  runs: async () => (await request<{ runs: RunSummary[] }>('/runs')).runs,
  run: async id => (await request<{ run: Run }>(`/runs/${encodeURIComponent(id)}`)).run,
  events: (id, after) => request<EventsResponse>(`/runs/${encodeURIComponent(id)}/events?after=${after}`),
  start: (requestId, candidateId, testIds) => request<{ runId: string; status: Status }>('/runs', { method: 'POST', body: JSON.stringify({ requestId, candidateId, testIds }) }),
  cancel: id => request<{ runId: string; status: Status }>(`/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }),
  report: async id => {
    const response = await fetch(`/api/runs/${encodeURIComponent(id)}/report`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error?.message ?? `Karne indirilemedi (HTTP ${response.status}).`); }
    return response.blob();
  },
};
