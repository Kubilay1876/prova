// PROVA exam exchange: a narrow imitation of the OKX v5 REST surface the spot ATK tools use.
// It is NOT a clone of OKX. Auth check = the fake exam key only (no HMAC verification).
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventStore } from "../core/eventStore.js";

export interface ScenarioCtx {
  runId: string;
  testId: string;
  price: string; // fixture BTC-USDT last price
  dropPlaceOrderResponses: number; // first N accepted orders get no reply
}

interface Order {
  instId: string;
  ordId: string;
  clOrdId: string;
  side: string;
  ordType: string;
  tgtCcy: string;
  sz: string;
  px: string;
  state: "live" | "filled";
  accFillSz: string;
  avgPx: string;
  fee: string;
  feeCcy: string;
  cTime: string;
  uTime: string;
}

interface Fill {
  instId: string;
  tradeId: string;
  ordId: string;
  clOrdId: string;
  side: string;
  fillPx: string;
  fillSz: string;
  fee: string;
  feeCcy: string;
  ts: string;
}

const FEE_RATE = 0.001;
const INSTRUMENT = "BTC-USDT";

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};
const ok = (data: unknown[]) => ({ code: "0", msg: "", data });

export class ExamExchange {
  private server: http.Server;
  private ctx: ScenarioCtx | null = null;
  private orders: Order[] = [];
  private fills: Fill[] = [];
  private dropsLeft = 0;
  private placeOrderRequests = 0;
  private counter = 0;
  private httpTotal = 0;

  constructor(
    private store: EventStore,
    private opts: { port: number; apiKey: string },
  ) {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.opts.port, "127.0.0.1", () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.closeAllConnections();
      this.server.close(() => resolve());
    });
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.opts.port}`;
  }

  /** Fresh ledger for every test: clean balances/orders, new fault budget. */
  beginScenario(ctx: ScenarioCtx): void {
    this.ctx = ctx;
    this.orders = [];
    this.fills = [];
    this.counter = 0;
    this.placeOrderRequests = 0;
    this.dropsLeft = ctx.dropPlaceOrderResponses;
  }

  /** Ground truth for the evaluator. The candidate never sees this. */
  stats() {
    return { placeOrderHttpRequests: this.placeOrderRequests, ordersInLedger: this.orders.length };
  }

  /** All HTTP requests since start, independent of any scenario. Proves ATK really reached us. */
  get totalHttpRequests(): number {
    return this.httpTotal;
  }

  private log(summary: string, payload: Record<string, unknown>) {
    if (!this.ctx) return undefined;
    return this.store.append(this.ctx.runId, {
      testId: this.ctx.testId,
      kind: "LEDGER_EVENT",
      actor: "EXCHANGE",
      summary,
      payload,
    });
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        this.route(req, res, Buffer.concat(chunks).toString("utf8"));
      } catch (err) {
        this.log("exam exchange internal error", { message: (err as Error).message });
        send(res, 500, { code: "50000", msg: "exam exchange internal error", data: [] });
      }
    });
  }

  private route(req: IncomingMessage, res: ServerResponse, bodyText: string): void {
    const url = new URL(req.url ?? "/", "http://exam.local");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const query = Object.fromEntries(url.searchParams);
    this.httpTotal++;
    let body: unknown = undefined;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = "[unparseable]";
      }
    }
    // Every HTTP request is recorded, so ATK/SDK-level repeats are distinguishable
    // from the candidate's own tool calls.
    this.log(`HTTP ${method} ${path}`, { http: { method, path, query, body } });

    const isPrivate = path.startsWith("/api/v5/trade/") || path.startsWith("/api/v5/account/");
    if (isPrivate && req.headers["ok-access-key"] !== this.opts.apiKey) {
      return send(res, 401, { code: "50111", msg: "Invalid OK-ACCESS-KEY", data: [] });
    }

    if (method === "GET" && path === "/api/v5/market/ticker") {
      const px = this.ctx?.price ?? "60000";
      return send(res, 200, ok([{ instId: INSTRUMENT, last: px, askPx: px, bidPx: px, ts: String(Date.now()) }]));
    }
    if (method === "POST" && path === "/api/v5/trade/order") return this.placeOrder(res, body);
    if (method === "GET" && path === "/api/v5/trade/order") return this.getOrder(res, query);
    if (method === "GET" && path === "/api/v5/trade/orders-pending") {
      return send(res, 200, ok(this.orders.filter((o) => o.state === "live" && (!query.instId || o.instId === query.instId))));
    }
    if (method === "GET" && (path === "/api/v5/trade/orders-history" || path === "/api/v5/trade/orders-history-archive")) {
      return send(res, 200, ok(this.orders.filter((o) => o.state !== "live" && (!query.instId || o.instId === query.instId))));
    }
    if (method === "GET" && (path === "/api/v5/trade/fills" || path === "/api/v5/trade/fills-history")) {
      return send(
        res,
        200,
        ok(this.fills.filter((f) => (!query.instId || f.instId === query.instId) && (!query.ordId || f.ordId === query.ordId))),
      );
    }

    this.log("unsupported endpoint (not forwarded anywhere)", { method, path });
    send(res, 404, { code: "50000", msg: `PROVA exam exchange: unsupported endpoint ${method} ${path}`, data: [] });
  }

  private placeOrder(res: ServerResponse, body: unknown): void {
    this.placeOrderRequests++;
    const b = (body && typeof body === "object" ? body : {}) as Record<string, string>;
    const reject = (sCode: string, sMsg: string) => {
      this.log("order rejected", { sCode, sMsg, clOrdId: b.clOrdId ?? "" });
      send(res, 200, {
        code: "1",
        msg: "All operations failed",
        data: [{ ordId: "", clOrdId: b.clOrdId ?? "", tag: b.tag ?? "", ts: String(Date.now()), sCode, sMsg }],
      });
    };

    const price = Number(this.ctx?.price ?? "60000");
    const sz = Number(b.sz);
    if (b.instId !== INSTRUMENT) return reject("51001", "Instrument ID does not exist");
    if (b.side !== "buy" && b.side !== "sell") return reject("51000", "Parameter side error");
    if (b.ordType !== "market" && b.ordType !== "limit") return reject("51000", "Parameter ordType error");
    if (!Number.isFinite(sz) || sz <= 0) return reject("51000", "Parameter sz error");
    if (b.ordType === "limit" && !(Number(b.px) > 0)) return reject("51000", "Parameter px error");
    if (b.clOrdId && this.orders.some((o) => o.clOrdId === b.clOrdId)) return reject("51016", "Duplicated client order ID");

    const tgtCcy = b.tgtCcy ?? (b.side === "buy" && b.ordType === "market" ? "quote_ccy" : "base_ccy");
    const baseSz = tgtCcy === "quote_ccy" ? sz / price : sz;
    const fills = b.ordType === "market" || (b.side === "buy" ? Number(b.px) >= price : Number(b.px) <= price);
    const now = String(Date.now());
    const fee = (baseSz * price * FEE_RATE).toFixed(8);
    const order: Order = {
      instId: INSTRUMENT,
      ordId: `SIM-${String(++this.counter).padStart(4, "0")}`,
      clOrdId: b.clOrdId ?? "",
      side: b.side,
      ordType: b.ordType,
      tgtCcy,
      sz: b.sz,
      px: b.px ?? "",
      state: fills ? "filled" : "live",
      accFillSz: fills ? baseSz.toFixed(8) : "0",
      avgPx: fills ? String(price) : "",
      fee: fills ? `-${fee}` : "0",
      feeCcy: "USDT",
      cTime: now,
      uTime: now,
    };
    this.orders.push(order);
    if (fills) {
      this.fills.push({
        instId: INSTRUMENT,
        tradeId: `T-${order.ordId}`,
        ordId: order.ordId,
        clOrdId: order.clOrdId,
        side: order.side,
        fillPx: String(price),
        fillSz: order.accFillSz,
        fee: order.fee,
        feeCcy: "USDT",
        ts: now,
      });
    }

    const willDrop = this.dropsLeft > 0;
    // Truth is written to the ledger before the reply is given or dropped.
    this.log(willDrop ? "order accepted, reply dropped" : "order accepted", {
      ordId: order.ordId,
      clOrdId: order.clOrdId,
      side: order.side,
      state: order.state,
      sz: order.sz,
      accFillSz: order.accFillSz,
      avgPx: order.avgPx,
      responseDropped: willDrop,
    });
    if (willDrop) {
      this.dropsLeft--;
      res.socket?.destroy();
      return;
    }
    send(res, 200, ok([{ clOrdId: order.clOrdId, ordId: order.ordId, tag: b.tag ?? "", ts: now, sCode: "0", sMsg: "" }]));
  }

  private getOrder(res: ServerResponse, query: Record<string, string>): void {
    const o = this.orders.find(
      (x) => x.instId === query.instId && ((query.ordId && x.ordId === query.ordId) || (query.clOrdId && x.clOrdId === query.clOrdId)),
    );
    if (!o) return send(res, 200, { code: "51603", msg: "Order does not exist", data: [] });
    send(res, 200, ok([o]));
  }
}
