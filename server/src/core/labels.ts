// Turkish wording for user-visible event summaries. Codes in payloads stay as they are (API v1);
// only the human-readable summary text is translated.

const STATUS_TR: Record<string, string> = {
  PASS: "GEÇTİ",
  FAIL: "KALDI",
  INCONCLUSIVE: "BELİRSİZ",
  NOT_TRIGGERED: "TETİKLENMEDİ",
  UNSUPPORTED: "DESTEKLENMİYOR",
  ERROR: "HATA",
  CANCELLED: "İPTAL",
  COMPLETED: "TAMAMLANDI",
  PARTIAL: "KISMİ",
  RUNNING: "SÜRÜYOR",
  LOCAL_ONLY: "yalnız yerel",
  PENDING: "bekliyor",
  FUJI_VERIFIED: "Fuji'de doğrulandı",
};

export const tr = (code: string | null | undefined): string => (code ? STATUS_TR[code] ?? code : "—");

const CLAIM_TR: Record<string, string> = {
  filled: "tamamen gerçekleşti",
  partially_filled: "kısmen gerçekleşti",
  no_order: "emir verilmedi",
  rejected: "reddedildi / gerçekleşmedi",
  unknown: "bilinmiyor",
};

/** Turkish for a candidate's report_result status; the raw code stays in the payload. */
export const claimTr = (status: unknown): string => (typeof status === "string" ? CLAIM_TR[status] ?? status : "?");

// Real ATK tool names are kept (they are evidence); a Turkish gloss is put in front.
const TOOL_TR: Record<string, string> = {
  market_get_ticker: "Fiyat sorgusu",
  spot_place_order: "Emir ver",
  spot_get_order: "Emir durumu sorgusu",
  spot_get_orders: "Emir listesi sorgusu",
  spot_get_fills: "Gerçekleşme sorgusu",
  spot_cancel_order: "Emir iptali",
  spot_batch_orders: "Toplu emir",
  spot_place_algo_order: "Algoritmik emir",
  report_result: "Sonuç bildirimi",
};

export const toolTr = (name: string): string => `${TOOL_TR[name] ?? "Araç çağrısı"} (${name})`;

/** Short Turkish description of the most relevant tool arguments. */
export function argsTr(args: Record<string, unknown>): string {
  const parts: string[] = [];
  if (args.instId !== undefined) parts.push(String(args.instId));
  if (args.side !== undefined) parts.push(args.side === "buy" ? "alış" : args.side === "sell" ? "satış" : String(args.side));
  if (args.ordType !== undefined) parts.push(args.ordType === "market" ? "piyasa emri" : args.ordType === "limit" ? "limitli emir" : String(args.ordType));
  if (args.sz !== undefined) parts.push(`miktar ${String(args.sz)}`);
  if (args.px !== undefined) parts.push(`fiyat ${String(args.px)}`);
  if (args.ordId !== undefined) parts.push(`emir no ${String(args.ordId)}`);
  if (args.clOrdId !== undefined) parts.push(`istemci kimliği ${String(args.clOrdId)}`);
  return parts.join(", ");
}
