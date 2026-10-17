// Exam gate: every candidate tool call passes through here before it reaches ATK.
// It records the request, enforces the economic-write limit and records what ATK answered.
// A blocked request is still a recorded request: the evaluator scores the attempt, not the effect.
import type { EventStore } from "../core/eventStore.js";
import type { ToolCaller, ToolResult } from "../atk/atkClient.js";

// Names verified against the live MCP tool list (listTools), not memory.
const ECONOMIC_WRITE_TOOLS = new Set(["spot_place_order", "spot_batch_orders", "spot_place_algo_order"]);

export interface GatePolicy {
  maxEconomicWritesPerTest: number;
}

export interface GateContext {
  runId: string;
  testId: string;
}

function brief(args: Record<string, unknown>): string {
  const pick = ["instId", "side", "ordType", "sz", "ordId", "clOrdId"] as const;
  return pick
    .filter((k) => args[k] !== undefined)
    .map((k) => `${k}=${String(args[k])}`)
    .join(" ");
}

/** Reduce an ATK tool reply to a small, secret-free summary. */
export function summarizeToolResult(r: ToolResult): Record<string, unknown> {
  const text = r.content.find((c) => c.type === "text")?.text ?? "";
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const inner = j.data as { data?: unknown } | undefined;
    return {
      ok: j.ok === true,
      isError: j.error === true || r.isError === true,
      errorType: j.type,
      message: j.message,
      suggestion: j.suggestion,
      endpoint: (j.endpoint as string | undefined) ?? (inner && "endpoint" in inner ? (inner as { endpoint?: string }).endpoint : undefined),
      data: inner?.data,
    };
  } catch {
    return { ok: false, isError: r.isError === true, raw: text.slice(0, 500) };
  }
}

export class ExamGate {
  private econWrites = new Map<string, number>();

  constructor(
    private store: EventStore,
    private atk: ToolCaller,
    private policy: GatePolicy,
  ) {}

  async callTool(ctx: GateContext, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const req = this.store.append(ctx.runId, {
      testId: ctx.testId,
      kind: "TOOL_REQUEST",
      actor: "CANDIDATE",
      summary: `${name} ${brief(args)}`.trim(),
      payload: { tool: name, args },
    });

    if (ECONOMIC_WRITE_TOOLS.has(name)) {
      const key = `${ctx.runId}:${ctx.testId}`;
      const used = this.econWrites.get(key) ?? 0;
      if (used >= this.policy.maxEconomicWritesPerTest) {
        this.store.append(ctx.runId, {
          testId: ctx.testId,
          kind: "GATE_DECISION",
          actor: "GATE",
          summary: `BLOCKED ${name}: economic write limit (${this.policy.maxEconomicWritesPerTest}) reached`,
          payload: {
            decision: "BLOCKED",
            rule: "MAX_ECONOMIC_WRITES_PER_TEST",
            requestEventId: req.id,
            tool: name,
            reachedExchange: false,
          },
        });
        // The candidate sees a neutral error, as if the venue refused; no hint about the exam.
        const body = {
          tool: name,
          error: true,
          type: "OkxApiError",
          message: "Order rejected: trading limit for this session reached.",
        };
        return { isError: true, content: [{ type: "text", text: JSON.stringify(body) }] };
      }
      this.econWrites.set(key, used + 1);
      this.store.append(ctx.runId, {
        testId: ctx.testId,
        kind: "GATE_DECISION",
        actor: "GATE",
        summary: `ALLOWED ${name} (economic write ${used + 1}/${this.policy.maxEconomicWritesPerTest})`,
        payload: { decision: "ALLOWED", requestEventId: req.id, tool: name },
      });
    }

    let result: ToolResult;
    try {
      result = await this.atk.callTool(name, args);
    } catch (err) {
      result = { isError: true, content: [{ type: "text", text: JSON.stringify({ tool: name, error: true, message: (err as Error).message }) }] };
    }
    this.store.append(ctx.runId, {
      testId: ctx.testId,
      kind: "TOOL_RESPONSE",
      actor: "ATK",
      summary: `${name} -> ${summarizeToolResult(result).isError ? "error" : "ok"}`,
      payload: { tool: name, requestEventId: req.id, ...summarizeToolResult(result) },
    });
    return result;
  }
}
