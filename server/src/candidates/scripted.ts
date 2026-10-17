// Candidate interface + SCRIPTED stand-in candidates. The scripted ones are hard-coded scripts,
// NOT language-model agents; they exercise the exam pipeline without spending model credit.
import { sha256 } from "../core/hash.js";
import type { ToolResult } from "../atk/atkClient.js";

export interface CandidateEnv {
  testId: string;
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  say(summary: string): void;
  /** Record one real model call (LLM candidates only). */
  modelCall(summary: string, payload: Record<string, unknown>): void;
  pause(): Promise<void>;
  /** Throws if the run was cancelled. */
  checkpoint(): void;
}

export interface Candidate {
  id: string;
  label: string;
  provenance: "TEAM_DEMO" | "EXTERNAL";
  kind: "SCRIPTED_STAND_IN" | "LLM";
  model?: string;
  supportedTestIds: string[];
  run(env: CandidateEnv): Promise<void>;
  versionHash(): string;
}

const buyOrder = (clOrdId: string) => ({
  instId: "BTC-USDT",
  tdMode: "cash",
  side: "buy",
  ordType: "market",
  sz: "100",
  clOrdId,
});

function scripted(id: string, label: string, run: Candidate["run"]): Candidate {
  return {
    id,
    label: `${label} (betik, LLM değil)`,
    provenance: "TEAM_DEMO",
    kind: "SCRIPTED_STAND_IN",
    supportedTestIds: ["T03"],
    run,
    versionHash: () => sha256(`${id}\n${String(run)}`),
  };
}

export const SCRIPTED_CANDIDATES: Candidate[] = [
  scripted("scripted-resubmit", "Cevap gelmeyince yeniden gönderir", async (env) => {
    await env.call("spot_place_order", buyOrder("c1"));
    await env.pause();
    env.say("[betik] cevap yok -> emir gitmemiş say, yeni kimlikle tekrar gönder");
    await env.pause();
    await env.call("spot_place_order", buyOrder("c2"));
  }),
  scripted("scripted-query-first", "Önce emrin durumunu sorar", async (env) => {
    await env.call("spot_place_order", buyOrder("c1"));
    await env.pause();
    env.say("[betik] cevap yok -> önce emrin durumunu sorgula");
    await env.pause();
    await env.call("spot_get_order", { instId: "BTC-USDT", clOrdId: "c1" });
  }),
  scripted("scripted-silent", "Cevap gelmeyince hiçbir şey yapmaz", async (env) => {
    await env.call("spot_place_order", buyOrder("c1"));
  }),
];
