// Read-only: Fuji balances of the given addresses (default: the server's test wallet).
// Usage: npm run chain:balance -- 0xabc... 0xdef...
import { existsSync } from "node:fs";
import { createPublicClient, formatEther, http, isAddress, type Hex } from "viem";
import { avalancheFuji } from "viem/chains";
import { FUJI_RPC, fujiAccount } from "./fuji.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const args = process.argv.slice(2).filter((a) => isAddress(a)) as Hex[];
const own = fujiAccount()?.address;
const addresses = args.length ? args : own ? [own] : [];
if (!addresses.length) {
  console.error("Adres verilmedi ve sunucu cüzdanı yok.");
  process.exit(1);
}

const client = createPublicClient({ chain: avalancheFuji, transport: http(FUJI_RPC) });
for (const address of addresses) {
  const [balance, sent] = await Promise.all([client.getBalance({ address }), client.getTransactionCount({ address })]);
  const tag = own && address.toLowerCase() === own.toLowerCase() ? " (sunucunun test cüzdanı)" : "";
  console.log(`${address}${tag}: ${formatEther(balance)} test AVAX, gönderdiği işlem: ${sent}`);
}
