import type { Run, RunEvent, Status } from './types.ts';
export const isActive = (status: Status) => status === 'QUEUED' || status === 'RUNNING';
export function mergeEvents(previous: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  const bySeq = new Map(previous.map(event => [event.seq, event]));
  for (const event of incoming) if (!bySeq.has(event.seq)) bySeq.set(event.seq, event);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}
export function comparable(a: Run, b: Run) {
  return (['suiteHash', 'fixtureHash', 'policyHash'] as const).every(key => Boolean(a[key]) && a[key] === b[key]);
}
export function evidenceFor(ids: string[], events: RunEvent[]) {
  return { events: events.filter(event => ids.includes(event.id)), missing: ids.filter(id => !events.some(event => event.id === id)) };
}
