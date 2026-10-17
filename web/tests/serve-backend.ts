// Integration launcher, not a backend implementation. Runs A's unchanged startApp.
// OneDrive can deny atomic .tmp -> .json renames; keep test runtime data in the OS temp directory.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApp } from '../../server/src/app.ts';
const dataDir = mkdtempSync(join(tmpdir(), 'prova-b-integration-'));
const app = await startApp({ apiPort: 8787, exchangePort: 18999, dataDir, stepDelayMs: 700 });
console.log('PROVA integration API http://127.0.0.1:8787 (unchanged backend, temporary runtime data)');
console.log(`atkExam: ${app.caps.atkExam.status}; LLM: ${app.caps.llm.status}`);
let closing = false;
async function close() { if (closing) return; closing = true; await app.close(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
