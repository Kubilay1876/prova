import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NewEvent, RunEvent } from "./types.js";

const SECRET_KEY = /apikey|secret|passphrase|password|token|signature|ok-access/i;
const RUN_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth-limit]";
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 4000) return value.slice(0, 4000) + "…[truncated]";
  return value;
}

/**
 * Append-only JSONL, one file per run. An event is written to disk first and only then
 * handed to listeners, so a restart re-reads the same seq numbers.
 */
export class EventStore {
  private lastSeq = new Map<string, number>();
  private listeners = new Set<(e: RunEvent) => void>();

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private file(runId: string): string {
    if (!RUN_ID.test(runId)) throw new Error("invalid runId");
    return join(this.dir, `${runId}.jsonl`);
  }

  subscribe(fn: (e: RunEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  read(runId: string, after = 0): RunEvent[] {
    const f = this.file(runId);
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunEvent)
      .filter((e) => e.seq > after);
  }

  append(runId: string, e: NewEvent): RunEvent {
    if (!this.lastSeq.has(runId)) this.lastSeq.set(runId, this.read(runId).at(-1)?.seq ?? 0);
    const seq = (this.lastSeq.get(runId) ?? 0) + 1;
    const event: RunEvent = {
      id: `evt_${runId}_${seq}`,
      runId,
      seq,
      timestamp: new Date().toISOString(),
      testId: e.testId,
      kind: e.kind,
      actor: e.actor,
      summary: e.summary,
      payload: sanitize(e.payload) as Record<string, unknown>,
    };
    appendFileSync(this.file(runId), JSON.stringify(event) + "\n", "utf8");
    this.lastSeq.set(runId, seq);
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // a broken listener must not affect the record
      }
    }
    return event;
  }
}
