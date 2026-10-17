// Fuji (Avalanche C-Chain TEST network) recorder for frozen PROVA reports.
// Writes reportHash + candidateVersionHash + suiteHash to ProvaReportRegistry and reads the event
// back from the receipt before calling it VERIFIED. Test network only; no real funds.
import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, decodeEventLog, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

export const MANIFEST_PATH = "../docs/backend/fuji-manifest.json";
export const ARTIFACT_PATH = "../contracts/build/ProvaReportRegistry.json";
export const FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";

export interface FujiManifest {
  chainId: 43113;
  contractAddress: Hex;
  recorderAddress: Hex;
  deploymentBlock: string;
  rpcUrl: string;
  abiVersion: string;
  eventName: "ReportRecorded";
  abi: Abi;
  deployTxHash: Hex;
  note: string;
}

export interface ChainReceipt {
  chainId: number;
  contractAddress: string;
  txHash: string;
  recorderAddress: string;
  verificationStatus: "PENDING" | "VERIFIED" | "ERROR";
  blockNumber: string | null;
  submittedAt: string;
  confirmedAt: string | null;
  observedConfirmationMs: number | null;
}

const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

function toBytes32(hex: string | null): Hex {
  const h = (hex ?? "").replace(/^0x/, "");
  if (h === "") return `0x${"0".repeat(64)}`;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error("hash must be 32 bytes of hex");
  return `0x${h.toLowerCase()}`;
}

export function fujiAccount() {
  const pk = process.env.FUJI_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return null;
  return privateKeyToAccount(pk as Hex);
}

export class FujiRecorder {
  private pub;
  private wallet;

  private constructor(
    readonly manifest: FujiManifest,
    private account: NonNullable<ReturnType<typeof fujiAccount>>,
  ) {
    const transport = http(manifest.rpcUrl, { timeout: 20_000 });
    this.pub = createPublicClient({ chain: avalancheFuji, transport });
    this.wallet = createWalletClient({ chain: avalancheFuji, transport, account });
  }

  /** Null unless a deployment manifest exists and this machine holds the recorder key. */
  static load(): FujiRecorder | null {
    const account = fujiAccount();
    if (!account || !existsSync(MANIFEST_PATH)) return null;
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as FujiManifest;
    if (manifest.chainId !== 43113 || !same(manifest.recorderAddress, account.address)) return null;
    return new FujiRecorder(manifest, account);
  }

  /** Real chain read: the deployed contract must report our address as its recorder. */
  async check(): Promise<boolean> {
    const [chainId, onChainRecorder] = await Promise.all([
      this.pub.getChainId(),
      this.pub.readContract({ address: this.manifest.contractAddress, abi: this.manifest.abi, functionName: "recorder" }),
    ]);
    return chainId === 43113 && same(onChainRecorder, this.account.address);
  }

  async record(reportHash: string, candidateVersionHash: string | null, suiteHash: string): Promise<ChainReceipt> {
    const args = [toBytes32(reportHash), toBytes32(candidateVersionHash), toBytes32(suiteHash)] as const;
    const t0 = Date.now();
    const submittedAt = new Date(t0).toISOString();
    const txHash = await this.wallet.writeContract({
      address: this.manifest.contractAddress,
      abi: this.manifest.abi,
      functionName: "record",
      args,
    });
    const receipt = await this.pub.waitForTransactionReceipt({ hash: txHash });
    const confirmedMs = Date.now();
    const base: ChainReceipt = {
      chainId: 43113,
      contractAddress: this.manifest.contractAddress,
      txHash,
      recorderAddress: this.account.address,
      verificationStatus: "ERROR",
      blockNumber: receipt.blockNumber.toString(),
      submittedAt,
      confirmedAt: new Date(confirmedMs).toISOString(),
      observedConfirmationMs: confirmedMs - t0,
    };
    if (receipt.status !== "success" || !same(receipt.to, this.manifest.contractAddress)) return base;

    // Read the event back and match every field before claiming VERIFIED.
    for (const log of receipt.logs) {
      if (!same(log.address, this.manifest.contractAddress)) continue;
      try {
        const ev = decodeEventLog({ abi: this.manifest.abi, data: log.data, topics: log.topics, strict: true });
        const a = ev.args as unknown as Record<string, unknown>;
        if (
          ev.eventName === "ReportRecorded" &&
          same(a.reportHash, args[0]) &&
          same(a.candidateVersionHash, args[1]) &&
          same(a.suiteHash, args[2]) &&
          same(a.recorder, this.account.address)
        ) {
          return { ...base, verificationStatus: "VERIFIED" };
        }
      } catch {
        // not our event
      }
    }
    return base;
  }
}
