import { renameSync, rmSync, writeFileSync } from "node:fs";

const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Write via tmp + rename. On Windows, sync clients (OneDrive) and scanners can briefly lock the
 * target and make the rename fail with EPERM/EBUSY; retry, then fall back to a direct write
 * rather than losing the record.
 */
export function atomicWriteSync(file: string, data: string | Uint8Array): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data);
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (!code || !RETRYABLE.has(code)) throw err;
      sleepSync(40 * attempt);
    }
  }
  writeFileSync(file, data);
  rmSync(tmp, { force: true });
}

/** Error text that is safe to show users: local file paths are masked. */
export function safeMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/[A-Za-z]:\\[^\s'"`]+/g, "[yerel yol]")
    .replace(/\/(?:Users|home|tmp|var|private)\/[^\s'"`]+/g, "[yerel yol]")
    .slice(0, 300);
}
