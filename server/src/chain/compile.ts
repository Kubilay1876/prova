// Compiles contracts/ProvaReportRegistry.sol with solc-js and writes ABI + bytecode to
// contracts/build/. EVM target "shanghai" so the bytecode runs on Avalanche C-Chain.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import { sha256 } from "../core/hash.js";

const SRC = "../contracts/ProvaReportRegistry.sol";
const OUT = "../contracts/build/ProvaReportRegistry.json";
const source = readFileSync(SRC, "utf8");

const input = {
  language: "Solidity",
  sources: { "ProvaReportRegistry.sol": { content: source } },
  settings: {
    evmVersion: "shanghai",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input))) as {
  errors?: { severity: string; formattedMessage: string }[];
  contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
};
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
for (const e of out.errors ?? []) console.log(e.formattedMessage);
if (errors.length) process.exit(1);

const c = out.contracts["ProvaReportRegistry.sol"].ProvaReportRegistry;
mkdirSync("../contracts/build", { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      contractName: "ProvaReportRegistry",
      compiler: `solc ${solc.version()}`,
      evmVersion: "shanghai",
      sourceSha256: sha256(source),
      abi: c.abi,
      bytecode: `0x${c.evm.bytecode.object}`,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Derlendi: solc ${solc.version()}, bytecode ${c.evm.bytecode.object.length / 2} bayt -> contracts/build/ProvaReportRegistry.json`);
