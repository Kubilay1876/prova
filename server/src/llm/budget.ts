// Hard spend guard for every model call. The whole project's API spend is capped (default USD 3).
// Cumulative estimated spend is persisted; once the cap is reached, calls are refused.
// Prices are USD per 1M tokens from the Claude API model table (cached 2026-10-06); an
// unknown model is refused instead of guessed, so an expensive model cannot slip in.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWriteSync } from "../core/fsutil.js";

interface Price {
  in: number;
  out: number;
  /** Haiku 5.5 bills more for prompts above 100K tokens. */
  longPromptIn?: number;
  longPromptOut?: number;
}

const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5, longPromptIn: 0.5, longPromptOut: 2.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number; // includes thinking tokens
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

interface SpendFile {
  totalUsd: number;
  calls: number;
  byModel: Record<string, { usd: number; calls: number }>;
  updatedAt: string;
}

export class BudgetExceeded extends Error {}

const priceOf = (model: string, promptTokens: number): { in: number; out: number } => {
  const p = PRICES[model];
  if (!p) throw new BudgetExceeded(`Model "${model}" için fiyat bilinmiyor; harcama sigortası çağrıyı reddetti`);
  const long = promptTokens > 100_000 && p.longPromptIn !== undefined;
  return { in: long ? p.longPromptIn! : p.in, out: long ? p.longPromptOut! : p.out };
};

export class Budget {
  constructor(
    private file = "data/spend.json",
    readonly capUsd = Number(process.env.PROVA_BUDGET_USD ?? "3.00"),
  ) {
    if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error("PROVA_BUDGET_USD must be a positive number");
  }

  private load(): SpendFile {
    if (!existsSync(this.file)) return { totalUsd: 0, calls: 0, byModel: {}, updatedAt: new Date().toISOString() };
    return JSON.parse(readFileSync(this.file, "utf8")) as SpendFile;
  }

  private save(s: SpendFile) {
    mkdirSync(dirname(this.file), { recursive: true });
    atomicWriteSync(this.file, JSON.stringify(s, null, 2));
  }

  get spentUsd(): number {
    return this.load().totalUsd;
  }

  /** Call BEFORE a request with its worst case: refuses if spent + worst case would pass the cap. */
  reserve(model: string, maxInputTokens: number, maxOutputTokens: number): void {
    const p = priceOf(model, maxInputTokens);
    const worst = (maxInputTokens * p.in + maxOutputTokens * p.out) / 1e6;
    const spent = this.spentUsd;
    if (spent + worst > this.capUsd) {
      throw new BudgetExceeded(
        `Harcama sigortası: şimdiye kadar ~$${spent.toFixed(4)} harcandı, bu çağrı en kötü ~$${worst.toFixed(4)} tutabilir, sınır $${this.capUsd.toFixed(2)}`,
      );
    }
  }

  /** Call AFTER a request with the real usage numbers the API returned. Returns this call's cost. */
  charge(model: string, usage: Usage): number {
    const created = usage.cache_creation_input_tokens ?? 0;
    const read = usage.cache_read_input_tokens ?? 0;
    const prompt = usage.input_tokens + created + read;
    const p = priceOf(model, prompt);
    const usd = (usage.input_tokens * p.in + created * p.in * 1.25 + read * p.in * 0.1 + usage.output_tokens * p.out) / 1e6;
    const s = this.load();
    s.totalUsd += usd;
    s.calls += 1;
    const m = (s.byModel[model] ??= { usd: 0, calls: 0 });
    m.usd += usd;
    m.calls += 1;
    s.updatedAt = new Date().toISOString();
    this.save(s);
    return usd;
  }
}
