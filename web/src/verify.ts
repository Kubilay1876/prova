import { createPublicClient, http, decodeEventLog, type Hex } from 'viem';
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
  if (typeof candidateVersionHash !== 'string' || typeof report.suiteHash !== 'string' || typeof report.fixtureHash !== 'string' || typeof report.policyHash !== 'string' || !Array.isArray(report.tests) || !Array.isArray(sourceEvents)) {
    return { state: 'MISSING_SOURCE', digest, message: 'Sürüm, paket, fixture, politika, test veya olay kaynağı eksik. Dosyanın kimlik ilişkisi doğrulanamadı.' };
  }
  const manifest = chainManifest;
  if (!manifest) return { state: 'UNCONFIGURED', digest, message: 'Zincir doğrulaması bekliyor. A’nın izinli Fuji ağ/adres manifesti ve olay ABI’si henüz yok; kayıt yerel, zincirde doğrulanmadı.' };
  if (manifest.chainId !== 43113 || !manifest.rpcUrl.startsWith('https://') || !manifest.abi.length) return { state: 'ERROR', digest, message: 'Sabit manifest geçersiz. Fuji ağ/adres/ABI yapılandırmasını kontrol edin.' };
  try {
    const client = createPublicClient({ chain: avalancheFuji, transport: http(manifest.rpcUrl, { timeout: 12000, retryCount: 0 }) });
    if (await client.getChainId() !== manifest.chainId) return { state: 'MISMATCH', digest, message: 'RPC yanlış ağda. Beklenen ağ Avalanche Fuji (43113).' };
    const head = await client.getBlockNumber();
    // Bound each query; scanning errors are never reported as absence of a record.
    const start = BigInt(manifest.deploymentBlock);
    if (head - start > 100000n) return { state: 'ERROR', digest, message: 'Tarama aralığı 100.000 bloğu aşıyor. A’nın sabit manifest/indeksleme desteği gerekli.' };
    for (let from = start; from <= head; from += 2048n) {
      const logs = await client.getLogs({ address: manifest.contractAddress, fromBlock: from, toBlock: from + 2047n > head ? head : from + 2047n });
      for (const log of logs) {
        let decoded;
        try { decoded = decodeEventLog({ abi: manifest.abi, eventName: manifest.eventName, topics: log.topics, data: log.data, strict: true }); } catch { continue; }
        if (decoded.eventName !== manifest.eventName) continue;
        if (!decoded.args || typeof decoded.args !== 'object' || Array.isArray(decoded.args)) continue;
        const args = decoded.args as unknown as Record<string, unknown>;
        if (!same(args.reportHash, digest)) continue;
        const receipt = await client.getTransactionReceipt({ hash: log.transactionHash as Hex });
        if (receipt.status !== 'success' || !same(receipt.to, manifest.contractAddress) || !same(args.recorder, manifest.recorderAddress) || !same(args.candidateVersionHash, candidateVersionHash) || !same(args.suiteHash, report.suiteHash)) return { state: 'MISMATCH', digest, message: 'Rapor olayı bulundu fakat makbuz, kayıtçı, sürüm veya paket eşleşmiyor.' };
        if (receipt.blockNumber >= head) return { state: 'PENDING', digest, message: 'Kayıt bulundu; bir sonraki blok onayı bekleniyor.' };
        return { state: 'VERIFIED', digest, txHash: receipt.transactionHash, message: 'Tam dosya baytları, başarılı Fuji makbuzu, izinli kayıtçı, aday sürümü ve paket olayı eşleşti. Bu sonuç aday davranışının güvenli olduğunu göstermez.' };
      }
    }
    return { state: 'NOT_FOUND', digest, message: 'Bu dosya hash’i için izinli kontratta kayıt bulunamadı. Dosya değişmiş veya kayıt henüz gönderilmemiş olabilir.' };
  } catch { return { state: 'ERROR', digest, message: 'Fuji RPC sorgusu tamamlanamadı. Zincir doğrulaması yapılamadı.' }; }
}
