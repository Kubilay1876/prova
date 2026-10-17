// One-time deployment of ProvaReportRegistry to Avalanche Fuji (TEST network) from the server's
// test wallet. Writes the public manifest B's verifier needs to docs/backend/fuji-manifest.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http, type Abi, type Hex } from "viem";
import { avalancheFuji } from "viem/chains";
import { ARTIFACT_PATH, FUJI_RPC, MANIFEST_PATH, fujiAccount, type FujiManifest } from "./fuji.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const account = fujiAccount();
if (!account) {
  console.error("FUJI_PRIVATE_KEY yok. Önce: npm run wallet:init");
  process.exit(1);
}
if (existsSync(MANIFEST_PATH) && !process.argv.includes("--force")) {
  console.error(`Zaten yüklenmiş (${MANIFEST_PATH}). Yeniden yüklemek için --force.`);
  process.exit(1);
}
const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as { abi: Abi; bytecode: Hex };

const transport = http(FUJI_RPC, { timeout: 30_000 });
const pub = createPublicClient({ chain: avalancheFuji, transport });
const wallet = createWalletClient({ chain: avalancheFuji, transport, account });

const balance = await pub.getBalance({ address: account.address });
console.log(`Kayıtçı ${account.address}, bakiye ${formatEther(balance)} test AVAX`);
if (balance === 0n) {
  console.error("Bakiye 0: önce bu adrese Fuji test AVAX gönderilmeli.");
  process.exit(1);
}

const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
console.log(`Yükleme işlemi gönderildi: ${hash}`);
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error(`Yükleme başarısız (status=${receipt.status}).`);
  process.exit(1);
}

const manifest: FujiManifest = {
  chainId: 43113,
  contractAddress: receipt.contractAddress,
  recorderAddress: account.address,
  deploymentBlock: receipt.blockNumber.toString(),
  rpcUrl: FUJI_RPC,
  abiVersion: "1",
  eventName: "ReportRecorded",
  abi: artifact.abi,
  deployTxHash: hash,
  note: "Avalanche Fuji TEST network. Custom PROVA registry, not an ERC-8004 Validation Registry.",
};
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Sözleşme: ${receipt.contractAddress} (blok ${receipt.blockNumber})`);
console.log(`Manifest yazıldı: ${MANIFEST_PATH}`);
console.log(`Gezgin: https://testnet.snowtrace.io/address/${receipt.contractAddress}`);
