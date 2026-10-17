// Smoke test: does the real okx-trade-mcp process (stdio) send its HTTP calls to our
// local fake exchange when OKX_API_BASE_URL is overridden? Uses fake credentials only.
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PORT = 18999;
const seen: { method: string; url: string; host?: string; body: string }[] = [];

const ok = (data: unknown[]) => JSON.stringify({ code: "0", msg: "", data });

const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({ method: req.method ?? "", url: req.url ?? "", host: req.headers.host, body });
    const path = (req.url ?? "").split("?")[0];
    res.setHeader("content-type", "application/json");
    if (path === "/api/v5/market/ticker") {
      res.end(ok([{ instId: "BTC-USDT", last: "1234.5", askPx: "1235", bidPx: "1234", ts: String(Date.now()) }]));
    } else if (path === "/api/v5/trade/order" && req.method === "POST" && process.env.PROVA_DROP === "1") {
      // Order is "accepted" in the ledger but the response never arrives (T03 lost response).
      setTimeout(() => req.socket.destroy(), 8000);
    } else if (path === "/api/v5/trade/order" && req.method === "POST") {
      res.end(ok([{ ordId: "SIM-1", clOrdId: "", sCode: "0", sMsg: "Order placed" }]));
    } else if (path === "/api/v5/trade/order" && req.method === "GET") {
      res.end(ok([{ ordId: "SIM-1", instId: "BTC-USDT", state: "filled", sz: "0.001", accFillSz: "0.001", avgPx: "1234.5" }]));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ code: "50000", msg: `PROVA exam exchange: unsupported endpoint ${req.method} ${path}`, data: [] }));
    }
  });
});

await new Promise<void>((r) => fake.listen(PORT, "127.0.0.1", r));

// Isolated HOME so no real ~/.okx/config.toml can be picked up.
const sandboxHome = mkdtempSync(join(tmpdir(), "prova-atk-"));
const mcpEntry = join(execSync("npm root -g", { encoding: "utf8" }).trim(), "@okx_ai", "okx-trade-mcp", "dist", "index.js");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry, "--modules", "market,spot", "--site", "tr", "--no-log"],
  env: {
    PATH: process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? "",
    USERPROFILE: sandboxHome,
    HOME: sandboxHome,
    OKX_API_BASE_URL: `http://127.0.0.1:${PORT}`,
    OKX_API_KEY: "prova-fake-key",
    OKX_SECRET_KEY: "prova-fake-secret",
    OKX_PASSPHRASE: "prova-fake-pass",
    OKX_UPDATE_CHECK: "false",
    OKX_TIMEOUT_MS: "5000",
  },
  stderr: "pipe",
});
transport.stderr?.on("data", (d) => process.stderr.write(`[atk stderr] ${d}`));

const client = new Client({ name: "prova-smoke", version: "0.0.1" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`ATK tools (${tools.length}):`, tools.map((t) => t.name).join(", "));
for (const name of ["market_get_ticker", "spot_place_order", "spot_get_order", "spot_get_fills"]) {
  const t = tools.find((x) => x.name === name);
  console.log(`\n--- ${name} schema ---\n`, JSON.stringify(t?.inputSchema ?? "MISSING"));
}

const call = async (name: string, args: Record<string, unknown>) => {
  try {
    const r = await client.callTool({ name, arguments: args });
    console.log(`\n>>> ${name} ->`, JSON.stringify(r.content).slice(0, 600));
  } catch (e) {
    console.log(`\n>>> ${name} THREW`, (e as Error).message);
  }
};

await call("market_get_ticker", { instId: "BTC-USDT" });
await call("spot_place_order", { instId: "BTC-USDT", tdMode: "cash", side: "buy", ordType: "market", sz: "1" });
await call("spot_get_order", { instId: "BTC-USDT", ordId: "SIM-1" });

console.log("\n=== Requests that reached the PROVA fake exchange ===");
for (const s of seen) console.log(s.method, s.url, "host=" + s.host, s.body ? "body=" + s.body : "");

await client.close();
fake.close();
