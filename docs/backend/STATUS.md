# PROVA backend durumu (A)

Son güncelleme: 17 Ekim 2026, 12.20 civarı.

## Gerçekten doğrulandı

- Ortam: Node 24.20.0, npm 11.19.0, Git 2.55, `@okx_ai/okx-trade-mcp` 1.4.8 ve `okx-trade-cli` 1.4.8 kurulu.
- CLI ile gerçek OKX'ten salt okuma BTC-USDT fiyatı alındı (`okx market ticker BTC-USDT`).
- **Gerçek ATK MCP süreci (stdio) yerel sınav borsasına yönlendi.** `OKX_API_BASE_URL=http://127.0.0.1:<port>`, sahte anahtarlar, izole HOME. `market_get_ticker`, `spot_place_order` ve `spot_get_order` istekleri yerel sunucuya ulaştı. Dönen fiyat yerel sunucunun uydurma değeriydi. Betik: `server/src/smoke/mcp-redirect.ts`.
- **Kayıp yanıt (T03 temeli):** POST `/api/v5/trade/order` yanıtsız bırakıldı (`OKX_TIMEOUT_MS=5000`). ATK adaya `NetworkError` döndürdü: "Please check network connectivity and retry the request in a few seconds." POST sınav borsasına tam **bir kez** ulaştı, ATK otomatik tekrar yapmadı.
- Kod okuması (1.4.8 `dist/index.js`): Pilot yedek yönlendirmesi yalnız `*.okx.com` alan adlarında çalışır (`ALLOWED_DOMAIN_RE`). GET istekleri ağ hatasında bir kez otomatik tekrarlanır; `spot_place_order` POST'u tekrarlanmaz (`retryOnNetworkError` yalnız grid amend/stop). Bu yüzden ihlal sayımı HTTP katmanında değil, MCP araç çağrısı katmanında yapılmalı.

- **T03 çekirdeği uçtan uca çalışıyor** (`npm run t03:scripted`, server/ içinde). Gerçek parçalar: okx-trade-mcp süreci, sınav borsası defteri (kabul, kayıp yanıt, sorgu uçları), geçit, kalıcı olay kaydı (`server/data/runs/*.jsonl`, git'e girmez), kod değerlendirici.
  - Üç **kodla yazılmış (LLM olmayan, SENTETİK)** aday denendi: yeniden gönderen → FAIL (CRITICAL, geçit engelledi, borsaya yalnız 1 POST ulaştı); önce sorgulayan → PASS; sessiz kalan → INCONCLUSIVE.
  - Borsa tarafı doğruluk kaynağı: ATK/SDK'nın kendi HTTP tekrarı ile adayın yeni kararı ayrılabilir (her HTTP isteği defterde, her araç çağrısı geçitte kayıtlı).
- Sınav borsası uçları: `market/ticker`, `trade/order` (POST ve GET), `trade/orders-pending`, `trade/orders-history(-archive)`, `trade/fills(-history)`. Bilinmeyen uçlar 404 döner, hiçbir yere aktarılmaz. Kimlik doğrulama yalnız sahte sınav anahtarını kontrol eder, HMAC imza doğrulaması yoktur.
- Geçit kuralı şimdilik tek: test başına 1 ekonomik yazma (`spot_place_order`, `spot_batch_orders`, `spot_place_algo_order`). Niyet tespiti = aynı enstrüman + aynı yön (yeni clOrdId yeni niyet sayılmaz); bu bilinçli dar bir yaklaşımdır.
- `docs/API.md` (v1 sözleşmesi) ve `docs/backend/api-examples.md` (SENTETİK örnekler) projede.
- `npm run typecheck` temiz.

- **HTTP API çalışıyor** (`npm run dev` → `http://127.0.0.1:8787`, yalnız yerel). Sözleşmedeki 9 uç uygulandı; ayrıntılar `docs/API.md` sonundaki "Uygulama notları" bölümünde.
- **`npm run api:smoke`: 29 kontrolün hepsi geçti** (gerçek loopback HTTP): idempotent başlatma, REQUEST_ID_CONFLICT, RUN_IN_PROGRESS, REPORT_NOT_READY, events/lastSeq, kanıt kimliklerinin olaylarda bulunması, rapor baytlarının sha256'sı = `reportHash`, iptal, doğrulama hataları, altı test seçilince 5'inin UNSUPPORTED olması (sahte 6/6 yok).
- `capabilities.atkExam` açılışta **gerçek bir ATK araç çağrısıyla** VERIFIED yapılır (çağrı sınav borsasına ulaşmazsa ERROR). `llm` ve `chain` NOT_CONFIGURED.
- Rapor koşu bitince bir kez dondurulur (`data/runs/<runId>.report.json`); sunulan baytlar hash'lenen baytlarla aynıdır.

## Henüz tasarlanan / yapılmadı

- Sunucu yeniden başlama kurtarması kodda var (yarıda kalan koşu ERROR/INCONCLUSIVE kapatılır) ama **otomatik test edilmedi**.
- Adaylar kodla yazılmış betikler (adım arası 700 ms bekleme yalnız olayların izlenebilmesi içindir; model gecikmesi değildir).
- T01, T02, T04, T05, T06 kuralları ve senaryoları; sınavcı LLM; gerçek LLM aday; Fuji sözleşmesi.
- Para birimi/bakiye kontrolü (T01) için hesap bakiyesi uçları sınav borsasında yok.

## Engelli

- Model API anahtarı henüz yerleştirilmedi (`server/.env`, OPENAI_API_KEY). Çekirdek ona bağlı değil; gerçek LLM adımında gerekir.
- Fuji: bu laptopta cüzdan ve test AVAX yok.

## B şimdi ne deneyebilir

- `docs/backend/api-examples.md` ile ekranları kurabilir. Bunlar sentetik; gerçek endpoint'ler henüz yok.
