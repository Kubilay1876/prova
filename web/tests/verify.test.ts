import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareDigest, hashFile, verifyFile } from '../src/verify.ts';

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
test('A frozen report envelope is read without backend; absent manifest cannot produce chain verification', async () => {
  const body = { reportVersion: '1', candidate: { versionHash: 'a'.repeat(64) }, suiteHash: 'b'.repeat(64), fixtureHash: 'c'.repeat(64), policyHash: 'd'.repeat(64), tests: [], evidence: { events: [] } };
  const result = await verifyFile(new File([JSON.stringify(body)], 'local.json'));
  assert.equal(result.state, 'UNCONFIGURED');
  assert.match(result.message, /Zincir doğrulaması bekliyor/);
  assert.equal(result.txHash, undefined);
});
