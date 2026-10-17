import type { Abi } from 'viem';
// Only a reviewed, fixed public manifest from A may be committed here.
// Never load network targets, ABI or recorder addresses from a report or localStorage.
export interface ChainManifest {
  chainId: 43113; contractAddress: `0x${string}`; recorderAddress: `0x${string}`;
  deploymentBlock: string; rpcUrl: string; abiVersion: string; abi: Abi; eventName: string;
}
export const chainManifest: ChainManifest | null = null;
