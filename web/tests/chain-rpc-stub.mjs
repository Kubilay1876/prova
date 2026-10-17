// Synthetic JSON-RPC responses for isolated verifier tests. No network or signing.
import { encodeAbiParameters, encodeEventTopics, toFunctionSelector } from 'viem';
export function rpcStub(manifest, source) {
  const block = BigInt(manifest.deploymentBlock) + 19n;
  const hex = n => `0x${n.toString(16)}`;
  const tx = `0x${'7'.repeat(64)}`, blockHash = `0x${'8'.repeat(64)}`;
  const state = { calls: [], chainId: 43113, recorded: true, wrongRecorder: false, wrongVersion: false, wrongSuite: false, failedReceipt: false, missingReceiptLog: false, wrongContract: false, wrongBlockHash: false, removed: false, pending: false, missingLog: false, rpcError: false };
  function log() {
    return { address: state.wrongContract ? `0x${'9'.repeat(40)}` : manifest.contractAddress, blockNumber: hex(block), blockHash, transactionHash: tx, transactionIndex: '0x0', logIndex: '0x0', removed: state.removed,
      topics: encodeEventTopics({ abi: manifest.abi, eventName: manifest.eventName, args: { reportHash: source.digest, recorder: state.wrongRecorder ? `0x${'9'.repeat(40)}` : manifest.recorderAddress } }),
      data: encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [state.wrongVersion ? `0x${'9'.repeat(64)}` : source.candidateVersionHash, state.wrongSuite ? `0x${'9'.repeat(64)}` : source.suiteHash]),
    };
  }
  async function request({ method, params }) {
    state.calls.push({ method, params });
    if (state.rpcError) throw new Error('TEST RPC unavailable');
    if (method === 'eth_chainId') return hex(state.chainId);
    if (method === 'eth_blockNumber') return hex(state.pending ? block : block + 2n);
    if (method === 'eth_call') {
      const data = params[0].data;
      if (data.startsWith(toFunctionSelector('recorder()'))) return encodeAbiParameters([{ type: 'address' }], [manifest.recorderAddress]);
      if (data.startsWith(toFunctionSelector('recordedAt(bytes32)'))) return encodeAbiParameters([{ type: 'uint256' }], [state.recorded && data.slice(10).toLowerCase() === source.digest.slice(2).toLowerCase() ? block : 0n]);
    }
    if (method === 'eth_getLogs') return state.missingLog ? [] : [log()];
    if (method === 'eth_getTransactionReceipt') return { transactionHash: tx, transactionIndex: '0x0', blockHash: state.wrongBlockHash ? `0x${'9'.repeat(64)}` : blockHash, blockNumber: hex(block), from: manifest.recorderAddress, to: manifest.contractAddress, cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1', contractAddress: null, logsBloom: `0x${'0'.repeat(512)}`, logs: state.missingReceiptLog ? [] : [log()], status: state.failedReceipt ? '0x0' : '0x1', type: '0x2' };
    throw new Error(`Unexpected test RPC method ${method}`);
  }
  return { state, request, block, tx };
}
