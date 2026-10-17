import { createPublicClient, http, decodeEventLog, type Hex, type Transport, type AbiEvent } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { chainManifest } from './chain-manifest.ts';
export type Verification = { state: 'VERIFIED' | 'UNCONFIGURED' | 'MISSING_SOURCE' | 'NOT_FOUND' | 'PENDING' | 'MISMATCH' | 'ERROR'; message: string; digest: string; txHash?: string };
export function compareDigest(digest: string, expected: string) {
  const normalized = expected.trim().replace(/^0x/i, '').toLowerCase();
  if (!normalized) return { state: 'UNCOMPARED', message: 'Beklenen hash verilmedi; yalnız dosyanın SHA-256 değeri hesaplandı.' };
  if (!/^[0-9a-f]{64}$/.test(normalized)) return { state: 'INVALID_REFERENCE', message: 'Beklenen SHA-256 değeri 64 onaltılık karakter olmalı.' };
  return same(digest, normalized) ? { state: 'MATCH', message: 'Dosyanın tam baytları beklenen run.reportHash.value ile eşleşiyor. Bu yerel bütünlük kontrolüdür.' } : { state: 'MISMATCH', message: 'Dosya hash’i beklenen run.reportHash.value ile eşleşmiyor. Dosya değişmiş veya başka koşuya ait olabilir.' };
}
export async function hashFile(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { bytes, digest: `0x${digest}` };
}
const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase().replace(/^0x/, '') === b.toLowerCase().replace(/^0x/, '');
export async function verifyFile(file: File): Promise<Verification> {
  if (file.size > 15 * 1024 * 1024) throw new Error('Dosya en fazla 15 MB olmalı.');
  const { bytes, digest } = await hashFile(file);
  let root: Record<string, unknown>;
  try { root = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error(); }
  catch { return { state: 'MISSING_SOURCE', digest, message: 'SHA-256 hesaplandı. Geçerli bir UTF-8 JSON raporu okunamadı.' }; }
  if (String(root.notice ?? '').includes('UI DEMO')) return { state: 'MISSING_SOURCE', digest, message: 'Bu dosya sentetik UI demo raporudur. Gerçek model, ATK veya zincir doğrulaması sağlamaz.' };
  // A's frozen report uses candidate.versionHash and evidence.events; older UI fixture envelopes remain explicit demos.
  const report = (root.run && typeof root.run === 'object' ? root.run : root) as Record<string, unknown>;
  const candidateVersionHash = report.candidateVersionHash ?? (root.candidate as Record<string, unknown> | undefined)?.versionHash;
  const sourceEvents = root.events ?? report.events ?? (root.evidence as Record<string, unknown> | undefined)?.events;
  if (!isHash(candidateVersionHash) || !isHash(report.suiteHash) || !isHash(report.fixtureHash) || !isHash(report.policyHash) || !Array.isArray(report.tests) || !Array.isArray(sourceEvents)) {
    return { state: 'MISSING_SOURCE', digest, message: 'Sürüm, paket, fixture, politika, test veya olay kaynağı eksik. Dosyanın kimlik ilişkisi doğrulanamadı.' };
  }
  return verifyRegistration({ digest, candidateVersionHash, suiteHash: report.suiteHash });
}
const isHash = (value: unknown): value is string => typeof value === 'string' && /^(?:0x)?[0-9a-fA-F]{64}$/.test(value);
const bytes32 = (value: string): Hex => `0x${value.replace(/^0x/, '').toLowerCase()}`;
function isRateLimited(error: unknown) {
  let cause = error;
  for (let i = 0; i < 6 && cause && typeof cause === 'object'; i++) {
    const current = cause as { status?: number; cause?: unknown };
    if (current.status === 429) return true;
    cause = current.cause;
  }
  return false;
}

// At most one extra RPC request per verification, including concurrent reads.
// Retrying the failed read preserves successful calls and never repeats the whole verification.
export function retryRateLimit(base: Transport, wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))): Transport {
  return options => {
    const transport = base({ ...options, retryCount: 0 });
    let retried = false;
    return {
      ...transport,
      request: async (args, requestOptions) => {
        try { return await transport.request(args, requestOptions); }
        catch (error) {
          if (retried || !isRateLimited(error)) throw error;
          retried = true;
          await wait(1500);
          return transport.request(args, requestOptions);
        }
      },
    };
  };
}

// Public digest/identity lookup only. Transport injection is for isolated tests, never report contents.
export async function verifyRegistration(source: { digest: string; candidateVersionHash: string; suiteHash: string }, transport?: Transport): Promise<Verification> {
  const { digest, candidateVersionHash, suiteHash } = source;
  const manifest = chainManifest;
  if (!isHash(digest) || !isHash(candidateVersionHash) || !isHash(suiteHash)) return { state: 'MISSING_SOURCE', digest, message: 'Rapor, aday sürümü veya paket özeti geçerli bir SHA-256 değeri değil.' };
  if (manifest.chainId !== 43113 || !manifest.rpcUrl.startsWith('https://') || !manifest.abi.length) return { state: 'ERROR', digest, message: 'Sabit manifest geçersiz. Fuji ağ/adres/ABI yapılandırmasını kontrol edin.' };
  try {
    const client = createPublicClient({ chain: avalancheFuji, transport: retryRateLimit(transport ?? http(manifest.rpcUrl, { timeout: 12000, retryCount: 0 })) });
    if (await client.getChainId() !== manifest.chainId) return { state: 'MISMATCH', digest, message: 'RPC yanlış ağda. Beklenen ağ Avalanche Fuji (43113).' };
    const [head, recorder, recordedAt] = await Promise.all([
      client.getBlockNumber(),
      client.readContract({ address: manifest.contractAddress, abi: manifest.abi, functionName: 'recorder' }),
      client.readContract({ address: manifest.contractAddress, abi: manifest.abi, functionName: 'recordedAt', args: [bytes32(digest)] }),
    ]);
    if (!same(recorder, manifest.recorderAddress)) return { state: 'MISMATCH', digest, message: 'Sözleşmenin kayıtçısı sabit manifestteki izinli kayıtçıyla eşleşmiyor.' };
    if (typeof recordedAt !== 'bigint') throw new Error('Invalid recordedAt response');
    if (recordedAt === 0n) return { state: 'NOT_FOUND', digest, message: 'Bu dosya hash’i için izinli Fuji kontratında kayıt bulunamadı. Dosya değişmiş veya kayıt henüz gönderilmemiş olabilir.' };
    const start = BigInt(manifest.deploymentBlock);
    if (recordedAt < start) return { state: 'MISMATCH', digest, message: 'Kayıt bloğu sözleşmenin yükleme bloğundan önce görünüyor.' };
    if (recordedAt > head) return { state: 'PENDING', digest, message: 'Yeni kayıt bildirildi; güncel blok ve olay onayı bekleniyor.' };
    const event = manifest.abi.find(item => item.type === 'event' && item.name === manifest.eventName) as AbiEvent | undefined;
    if (!event) throw new Error('Manifest event missing');
    // recordedAt is an index, not sufficient proof. Verify the actual log and its receipt at that block.
    const logs = await client.getLogs({ address: manifest.contractAddress, event, args: { reportHash: bytes32(digest) }, fromBlock: recordedAt, toBlock: recordedAt, strict: true });
    for (const log of logs) {
      if (log.removed || !same(log.address, manifest.contractAddress) || log.blockNumber !== recordedAt || !log.transactionHash) continue;
      let decoded;
      try { decoded = decodeEventLog({ abi: manifest.abi, eventName: manifest.eventName, topics: log.topics, data: log.data, strict: true }); } catch { continue; }
      if (decoded.eventName !== manifest.eventName) continue;
      if (!decoded.args || typeof decoded.args !== 'object' || Array.isArray(decoded.args)) continue;
      const args = decoded.args as unknown as Record<string, unknown>;
      if (!same(args.reportHash, digest)) continue;
      const receipt = await client.getTransactionReceipt({ hash: log.transactionHash as Hex });
      const inReceipt = receipt.logs.some(item => !item.removed && item.logIndex === log.logIndex && same(item.address, log.address) && same(item.data, log.data) && item.topics.length === log.topics.length && item.topics.every((topic, i) => same(topic, log.topics[i])));
      if (receipt.status !== 'success' || !same(receipt.transactionHash, log.transactionHash) || !same(receipt.to, manifest.contractAddress) || receipt.blockNumber !== recordedAt || !same(receipt.blockHash, log.blockHash) || !inReceipt || !same(args.recorder, manifest.recorderAddress) || !same(args.candidateVersionHash, candidateVersionHash) || !same(args.suiteHash, suiteHash)) return { state: 'MISMATCH', digest, message: 'Rapor olayı bulundu fakat makbuz, kayıtçı, sürüm veya paket eşleşmiyor.' };
      if (receipt.blockNumber >= head) return { state: 'PENDING', digest, message: 'Kayıt bulundu; bir sonraki blok onayı bekleniyor.' };
      return { state: 'VERIFIED', digest, txHash: receipt.transactionHash, message: 'Tam dosya baytları, başarılı Fuji makbuzu, izinli kayıtçı, aday sürümü ve paket olayı eşleşti. Bu sonuç aday davranışının güvenli olduğunu göstermez.' };
    }
    return { state: 'MISMATCH', digest, message: 'Kontratta kayıt bloğu var fakat eşleşen ReportRecorded olayı doğrulanamadı.' };
  } catch (error) {
    if (isRateLimited(error)) return { state: 'ERROR', digest, message: 'Fuji RPC sorgusu tamamlanamadı (429: hız sınırı). Daha sonra yeniden dene; zincir kaydı doğrulanmadı.' };
    return { state: 'ERROR', digest, message: 'Fuji RPC sorgusu tamamlanamadı. Zincir doğrulaması yapılamadı.' };
  }
}
