// Creates a throw-away Fuji TEST wallet once and stores its key in server/.env (git-ignored).
// Prints only the public address and its Fuji balance. Never prints the key.
// This wallet is for the Avalanche Fuji test network only; never send real funds to it.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createPublicClient, formatEther, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

const ENV = ".env";
const hasKey = existsSync(ENV) && /^FUJI_PRIVATE_KEY=0x[0-9a-fA-F]{64}\s*$/m.test(readFileSync(ENV, "utf8"));
if (!hasKey) {
  const pk = generatePrivateKey();
  const text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  appendFileSync(ENV, (text.endsWith("\n") || text === "" ? "" : "\n") + `FUJI_PRIVATE_KEY=${pk}\n`, "utf8");
  console.log("Yeni Fuji test cüzdanı oluşturuldu (gizli anahtar server/.env içinde).");
} else {
  console.log("Fuji test cüzdanı zaten var.");
}

process.loadEnvFile(ENV);
const account = privateKeyToAccount(process.env.FUJI_PRIVATE_KEY as `0x${string}`);
console.log(`Adres: ${account.address}`);

const client = createPublicClient({ chain: avalancheFuji, transport: http("https://api.avax-test.network/ext/bc/C/rpc") });
const [chainId, balance] = await Promise.all([client.getChainId(), client.getBalance({ address: account.address })]);
console.log(`Ağ chainId: ${chainId} (Fuji = 43113)`);
console.log(`Bakiye: ${formatEther(balance)} test AVAX`);
