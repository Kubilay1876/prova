# PROVA — Yetki vermeden önce sınayın

Bir trading agent'ına işlem yetkisi vermeden önce onu kontrollü, sanal bir borsada sınayan ve sürüme bağlı, zincirde doğrulanabilir bir karne üreten araç. OKX TR × Team1 Agentic Hackathon (Ankara, 17 Ekim 2026) prototipidir.

## Nasıl çalışır

```
Aday (Claude)  ──araç çağrısı──▶  Geçit  ──▶  gerçek okx-trade-mcp 1.4.8  ──HTTP──▶  Sınav borsası (yerel, sanal)
                                   │                                                    │
                                   └───────────── olay kaydı (JSONL) ◀──────────────────┘
                                                        │
             Sınavcı (Claude) takip testi seçer ──▶ Kod hüküm verir ──▶ Karne (sha256) ──▶ Avalanche Fuji kaydı
```

- **Aday** gerçek ATK araç tanımlarını görür; testten haberi yoktur. Yalnız ATK'nin adresi yerel sınav borsasına çevrilir, sahte anahtar kullanılır.
- **Sınav borsası** emir kabulü, kısmi gerçekleşme, eski fiyat ve kaybolan yanıt üretir. Önce deftere yazar, sonra cevap verir veya cevabı düşürür.
- **Geçit** her çağrıyı kaydeder, politika dışı emri borsaya ulaştırmaz. Engellenen talep yine bulgudur.
- **Sınavcı** ayrı bir Claude oturumudur; sonuçlara bakıp en fazla 2 zorlaştırılmış takip testi seçer. Hüküm vermez.
- **Hükmü kod verir.** Rapor dondurulur, sha256'sı Fuji'deki kayıt sözleşmesine yazılır.

## Gerçekten çalışan (17 Ekim 2026)

- Gerçek `okx-trade-mcp` 1.4.8 MCP süreci → yerel sınav borsası (gerçek borsaya çıkış yok).
- Altı zorunlu test (T01–T06) + dört takip testi (F01, F02, F04, F05), kodla değerlendirilir.
- Gerçek LLM aday ve sınavcı: `claude-sonnet-5-5`. İki tam koşu: **6/6 PASS**; ikincisinde sınavcı F01 ve F05'i seçti, ikisi de PASS. Tam koşu ~38–55 sn, ~$0.12–0.15 model maliyeti (tahmini).
- Kalma örneği: kodla yazılmış betik aday (`scripted-resubmit`) T03'te ikinci emri gönderir → **FAIL (CRITICAL)**; geçit ikinci emri borsaya ulaştırmaz.
- Avalanche **Fuji test ağı** kaydı: sözleşme [`0xda0a8d5e87f90da24dec7338aa4bcc6af43cea2b`](https://testnet.snowtrace.io/address/0xda0a8d5e87f90da24dec7338aa4bcc6af43cea2b). Her bitmiş koşunun rapor özeti otomatik kaydedilir ve olay makbuzdan geri okunarak doğrulanır.
- Web arayüzü (B): aday seçme, sınavı izleme, bulgudan kanıta geçiş, rapor indirme, tarayıcıda dosya doğrulama.

Ayrıntılı ve güncel durum: [`docs/backend/STATUS.md`](docs/backend/STATUS.md), [`docs/frontend/STATUS.md`](docs/frontend/STATUS.md). OKX.AI hizmet tanımı: [`docs/backend/SERVICE.md`](docs/backend/SERVICE.md).

## Dürüst sınırlar

- Pazar verisi sentetik, emirler sanal. Gerçek borsada işlem yapılmadı.
- Fuji **test ağıdır**; ana ağ değildir. Kayıt sözleşmesi bizimdir, ERC-8004 değildir. Zincir kaydı dosyanın değişmediğini ve kaydedeni gösterir; sınavın doğru yapıldığını kanıtlamaz.
- Aday PROVA içinde çalışır; dışarıdan bağımsız bir agent bağlanmadı.
- Gerçek LLM her iki tam koşuda da geçti. Kalma örneği şu an yalnız betik aday; modelin koşudan koşuya farklı davranabildiği gözlendi.
- Yalnız yerelde çalışır (`127.0.0.1`).

## Çalıştırma

Gerekenler: Node 24, Git, `npm install -g @okx_ai/okx-trade-mcp@1.4.8`, web için `pnpm`.

```powershell
# backend
cd server
npm install
copy .env.example .env      # ANTHROPIC_API_KEY'i .env içine yazın (Git'e girmez)
npm run dev                 # http://127.0.0.1:8787

# frontend (ayrı terminal)
cd web
pnpm install --frozen-lockfile
pnpm dev                    # http://127.0.0.1:5173
```

Anahtar yoksa yalnız betik adaylar görünür (model harcaması yok).

### Kontroller (server/)

| Komut | Ne yapar | Model harcaması |
|---|---|---|
| `npm run typecheck` | TypeScript kontrolü | yok |
| `npm run eval:test` | Değerlendiricileri elle kurulmuş olaylarla sınar | yok |
| `npm run budget:test` | Harcama sigortası | yok |
| `npm run api:smoke` | Gerçek HTTP üzerinden API kabul kontrolleri | yok |
| `npm run chain:e2e` | Betik adayla koşu → Fuji kaydı → zincirden bağımsız doğrulama | yok (test AVAX) |
| `npm run llm:run` | Gerçek Claude ile altı test + sınavcı | ~$0.15 |
| `npm run llm:check` | Anahtarı tek küçük çağrıyla dener | <$0.001 |

## Klasörler

- `server/` — sınav borsası, geçit, aday/sınavcı, değerlendiriciler, API, zincir kaydı (A)
- `contracts/` — `ProvaReportRegistry.sol` ve derleme çıktısı (A)
- `web/` — arayüz (B)
- `docs/` — API sözleşmesi, durum notları, hizmet tanımı, Fuji manifesti
