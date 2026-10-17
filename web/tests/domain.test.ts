import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparable, evidenceFor, isActive, mergeEvents } from '../src/domain.ts';
import type { Run, RunEvent } from '../src/types.ts';
const event = (seq: number): RunEvent => ({ id: `e${seq}`, seq, runId: 'r1', timestamp: '2026-10-17T10:00:00Z', testId: 'T03', kind: 'TOOL_REQUEST', actor: 'CANDIDATE', summary: 'test', payload: {} });
test('poll replay merges out-of-order duplicates and preserves earlier evidence on an empty response', () => {
  const first = mergeEvents([event(1), event(2)], [event(4), event(2), event(3)]);
  assert.deepEqual(first.map(e => e.seq), [1, 2, 3, 4]);
  assert.deepEqual(mergeEvents(first, []), first);
});
test('comparison requires all three matching nonempty hashes', () => {
  const run = { suiteHash: 'suite', fixtureHash: 'fixture', policyHash: 'policy' } as Run;
  assert.equal(comparable(run, { ...run, candidateVersionHash: 'different-version' }), true);
  for (const key of ['suiteHash', 'fixtureHash', 'policyHash'] as const) {
    assert.equal(comparable(run, { ...run, [key]: 'changed' }), false);
    assert.equal(comparable({ ...run, [key]: null }, { ...run, [key]: null }), false);
  }
});
test('evidence lookup reports missing references instead of treating them as complete', () => {
  const result = evidenceFor(['e1', 'e3'], [event(1), event(2)]);
  assert.deepEqual(result.events.map(e => e.id), ['e1']);
  assert.deepEqual(result.missing, ['e3']);
});
test('every terminal run status stops normal polling including PARTIAL and ERROR', () => {
  assert.equal(isActive('QUEUED'), true); assert.equal(isActive('RUNNING'), true);
  for (const status of ['COMPLETED', 'PARTIAL', 'CANCELLED', 'ERROR'] as const) assert.equal(isActive(status), false);
});
