// Plain-Node JSON API implementing docs/API.md v1. Bound to 127.0.0.1 only.
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError, type RunManager } from "../runs/runManager.js";
import type { Candidate } from "../candidates/scripted.js";
import { SUITE_VERSION, TESTS } from "../tests/catalog.js";

export interface Capability {
  status: "NOT_CONFIGURED" | "VERIFIED" | "ERROR";
  checkedAt: string | null;
  message: string;
}
export interface Capabilities {
  atkMarket: Capability;
  atkExam: Capability;
  llm: Capability;
  chain: Capability;
}

const API_VERSION = "1";
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 64 * 1024;

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify({ apiVersion: API_VERSION, ...body }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, "BODY_TOO_LARGE", "İstek gövdesi çok büyük"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError(400, "INVALID_JSON", "Geçerli bir JSON nesnesi bekleniyordu");
}

export function createApiServer(deps: { runs: RunManager; candidates: Candidate[]; capabilities: () => Capabilities }): http.Server {
  const { runs, candidates, capabilities } = deps;

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://api.local");
    const method = req.method ?? "GET";
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (method === "GET" && path === "/api/health") {
      return json(res, 200, { serverTime: new Date().toISOString(), capabilities: capabilities() });
    }
    if (method === "GET" && path === "/api/candidates") {
      return json(res, 200, {
        candidates: candidates.map((c) => ({ id: c.id, label: c.label, versionHash: c.versionHash(), provenance: c.provenance, supportedTestIds: c.supportedTestIds })),
      });
    }
    if (method === "GET" && path === "/api/tests") {
      return json(res, 200, { suiteVersion: SUITE_VERSION, tests: TESTS });
    }
    if (path === "/api/runs") {
      if (method === "GET") return json(res, 200, { runs: runs.list() });
      if (method === "POST") {
        const b = parseJson(await readBody(req));
        const { requestId, candidateId, testIds } = b;
        if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
          throw new ApiError(400, "INVALID_REQUEST_ID", "requestId 1–64 karakter, yalnız harf/rakam/_/- olmalı");
        }
        if (typeof candidateId !== "string" || !Array.isArray(testIds) || testIds.some((t) => typeof t !== "string")) {
          throw new ApiError(400, "INVALID_BODY", "candidateId (metin) ve testIds (metin dizisi) gerekli");
        }
        const { run, created } = runs.start({ requestId, candidateId, testIds: testIds as string[] });
        return json(res, created ? 202 : 200, { runId: run.id, status: run.status });
      }
    }

    const m = path.match(/^\/api\/runs\/([A-Za-z0-9_-]+)(?:\/(events|cancel|report))?$/);
    if (m) {
      const [, runId, sub] = m;
      if (method === "GET" && !sub) return json(res, 200, { run: runs.get(runId) });
      if (method === "GET" && sub === "events") {
        const raw = url.searchParams.get("after") ?? "0";
        if (!/^\d+$/.test(raw)) throw new ApiError(400, "INVALID_AFTER", "after sıfır veya pozitif tamsayı olmalı");
        return json(res, 200, runs.events(runId, Number(raw)));
      }
      if (method === "POST" && sub === "cancel") {
        const run = runs.cancel(runId);
        return json(res, 200, { runId: run.id, status: run.status, cancelRequested: run.cancelRequested });
      }
      if (method === "GET" && sub === "report") {
        const bytes = runs.report(runId);
        res.statusCode = 200;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("content-disposition", `attachment; filename="prova-${runId}.json"`);
        res.setHeader("cache-control", "no-store");
        return void res.end(bytes);
      }
    }

    throw new ApiError(404, "NOT_FOUND", `Bilinmeyen uç: ${method} ${path}`);
  };

  return http.createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (err instanceof ApiError) {
        return json(res, err.status, { error: { code: err.code, message: err.message, retryable: err.retryable, ...(err.runId ? { runId: err.runId } : {}) } });
      }
      // Never leak internals (paths, keys) to the client.
      console.error("[api] unexpected error:", err);
      json(res, 500, { error: { code: "INTERNAL_ERROR", message: "Beklenmeyen sunucu hatası", retryable: false } });
    });
  });
}
