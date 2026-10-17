// Starts the real okx-trade-mcp process (stdio) in an isolated exam profile:
// fake credentials, base URL pointed at the local exam exchange, throw-away HOME.
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}

export interface ToolCaller {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ExamAtk extends ToolCaller {
  toolNames: string[];
  serverVersion: string | undefined;
  stderrLog: string[];
  close(): Promise<void>;
}

export async function startExamAtk(opts: {
  baseUrl: string;
  apiKey: string;
  modules?: string;
  timeoutMs?: number;
}): Promise<ExamAtk> {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(opts.baseUrl)) {
    throw new Error("exam ATK may only point at the local exam exchange (http://127.0.0.1:<port>)");
  }
  const sandboxHome = mkdtempSync(join(tmpdir(), "prova-atk-"));
  const mcpEntry = join(execSync("npm root -g", { encoding: "utf8" }).trim(), "@okx_ai", "okx-trade-mcp", "dist", "index.js");
  const stderrLog: string[] = [];

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpEntry, "--modules", opts.modules ?? "market,spot", "--site", "tr", "--no-log"],
    // Explicit env only: nothing from the developer's shell (no real keys) is inherited.
    env: {
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      USERPROFILE: sandboxHome,
      HOME: sandboxHome,
      OKX_API_BASE_URL: opts.baseUrl,
      OKX_API_KEY: opts.apiKey,
      OKX_SECRET_KEY: "prova-fake-secret",
      OKX_PASSPHRASE: "prova-fake-pass",
      OKX_UPDATE_CHECK: "false",
      OKX_TIMEOUT_MS: String(opts.timeoutMs ?? 3000),
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (d: Buffer) => stderrLog.push(String(d)));

  const client = new Client({ name: "prova-exam", version: "0.1.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();

  return {
    toolNames: tools.map((t) => t.name),
    serverVersion: client.getServerVersion()?.version,
    stderrLog,
    callTool: async (name, args) => (await client.callTool({ name, arguments: args })) as unknown as ToolResult,
    close: async () => {
      await client.close();
      rmSync(sandboxHome, { recursive: true, force: true });
    },
  };
}
