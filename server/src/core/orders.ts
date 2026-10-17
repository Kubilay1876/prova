// Notional value (USDT) of a spot order request, using OKX sizing rules:
// a market BUY sizes in quote currency by default; everything else sizes in base currency.
export function orderNotionalUsdt(args: Record<string, unknown>, refPrice: number): number | null {
  const sz = Number(args.sz);
  if (!Number.isFinite(sz) || sz <= 0) return null;
  const side = args.side;
  const ordType = args.ordType;
  const tgtCcy = (args.tgtCcy as string | undefined) ?? (side === "buy" && ordType === "market" ? "quote_ccy" : "base_ccy");
  if (tgtCcy === "quote_ccy") return sz;
  const px = Number(args.px);
  return sz * (Number.isFinite(px) && px > 0 ? px : refPrice);
}
