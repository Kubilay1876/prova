// Offline checks for the spend guard. No network, no key.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Budget, BudgetExceeded } from "../llm/budget.js";

const dir = mkdtempSync(join(tmpdir(), "prova-budget-"));
let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  if (!cond) failed++;
};
const throws = (fn: () => void) => {
  try { fn(); return false; } catch (e) { return e instanceof BudgetExceeded; }
};

try {
  const b = new Budget(join(dir, "spend.json"), 0.01); // tiny cap: 1 cent
  check("starts at zero", b.spentUsd === 0);
  check("small haiku call is allowed", !throws(() => b.reserve("claude-haiku-5-5", 3000, 500)));

  // 100K in + 100K out on haiku (prompt not above 100K) = $0.01 + $0.05 = $0.06
  const cost = b.charge("claude-haiku-5-5", { input_tokens: 100_000, output_tokens: 100_000 });
  check("haiku price math: 100K in + 100K out = $0.06", Math.abs(cost - 0.06) < 1e-9, `$${cost}`);
  // prompts above 100K tokens bill at the long-prompt rate: 1M in x $0.50 + 1M out x $2.50 = $3.00
  const longCost = new Budget(join(dir, "long.json"), 10).charge("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 });
  check("haiku long-prompt rate applies above 100K prompt tokens ($3.00)", Math.abs(longCost - 3) < 1e-9, `$${longCost}`);
  check("spend persisted across instances", new Budget(join(dir, "spend.json"), 0.01).spentUsd > 0.059);
  check("call refused once the cap is passed", throws(() => b.reserve("claude-haiku-5-5", 100, 100)));

  const c = new Budget(join(dir, "spend2.json"), 0.80);
  check("unknown model is refused, not guessed", throws(() => c.reserve("claude-unknown-9", 100, 100)));
  check("opus worst case (1M out = $20) is refused under $0.80", throws(() => c.reserve("claude-opus-5-5", 1000, 1_000_000)));

  // cache math: read = 0.1x, write = 1.25x of input price (haiku $0.10/M); 50K each keeps the prompt at 100K
  const d = new Budget(join(dir, "spend3.json"), 1);
  const cc = d.charge("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 50_000, cache_read_input_tokens: 50_000 });
  check("cache write 1.25x + read 0.1x on 50K each = $0.00675", Math.abs(cc - 0.00675) < 1e-9, `$${cc}`);

  // a realistic run: 20 calls x 3000 in / 400 out on haiku = 20 x ($0.0003 + $0.0002) = $0.01
  const e = new Budget(join(dir, "spend4.json"), 1);
  for (let i = 0; i < 20; i++) e.charge("claude-haiku-5-5", { input_tokens: 3000, output_tokens: 400 });
  check("realistic run (20 calls, 3k in / 400 out each) costs about 1 cent", Math.abs(e.spentUsd - 0.01) < 1e-9, `$${e.spentUsd.toFixed(5)}`);
  console.log(`      -> so a $0.80 cap buys roughly ${Math.floor(0.8 / e.spentUsd)} such runs`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed === 0 ? "\nALL BUDGET CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
