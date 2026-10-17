# PROVA frontend — B teslimi

Bağımsız React + TypeScript + Vite uygulaması. B yalnız `web/` ve `docs/frontend/` dosyalarının sahibidir. Kaynak hazırlık belgesinin uygulama karşılığıdır; backend içermez.

## Çalıştır

Node.js 22.12+ veya 24, pnpm gerekir. Komutları **web klasöründe** çalıştır:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev
```

Gerçek API: http://127.0.0.1:5173/

Etiketli arayüz demosu: http://127.0.0.1:5173/?mode=demo

Bağımsız doğrulayıcı: http://127.0.0.1:5173/verify

Frontend 5173, backend 8787. Vite `/api` isteklerini `http://127.0.0.1:8787` hedefine iletir. Port doluysa durur; başka port seçmez. Aynı makinede iki uygulama da çalışmalıdır. Üretim `dist/` çıktısı API sunucusu içermez; tek başına dosya barındırmaya koymak sınav motorunu yayımlamaz.

## Kontrol

```powershell
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

`tests/browser-smoke.mjs` isteğe bağlı tarayıcı testi; ilk argüman kurulu Playwright `index.mjs` dosyasının tam yoludur. Microsoft Edge ve çalışan frontend gerekir. Geçici yeni tarayıcı profili kullanır. İlk kontrol API bağlantı kesintisini açık bir HTTP deneme kuralıyla simüle eder; gerçek backend açıkken de çalışabilir. Test hem etiketli fixture hem açık bir HTTP deneme katmanı kullanır; gerçek LLM/ATK/Fuji kanıtı değildir. Ekran görüntüleri ve sonuçlar Git dışındaki `artifacts/` altına yazılır.

## Dosyalar

- `src/types.ts`: ortak API v1 tipleri.
- `src/api.ts`: gerçek HTTP adaptörü; fixture’a otomatik dönüş yok.
- `src/fixture.ts`: etiketli sentetik koşular; yalnız demo verisi tarayıcıda saklanır.
- `src/domain.ts`: olay birleştirme, kanıt arama, karşılaştırma eşitliği.
- `src/App.tsx`: aday, sınav, karne, geçmiş ve doğrulayıcı ekranları.
- `src/verify.ts`: tam dosya SHA-256 ve sabit manifest için salt okuma zincir adaptörü.
- `src/chain-manifest.ts`: A’dan gelecek, kodda incelenmiş public Fuji manifesti; şu an `null`.
- `src/styles.css`: masaüstü ve dar ekran görünümü.

Model/borsa anahtarı, seed veya imza frontend’e girilmez. Kullanıcı dosyasının URL/RPC/kontrat alanları ağ hedefi olarak kullanılmaz. React kanıt metinlerini metin olarak gösterir; HTML çalıştırılmaz.

Gerçek entegrasyon durumu ve A’ya sorular: `../docs/frontend/STATUS.md`, `HANDOFF.md`, `contract-questions.md`.


## Gerçek backend ile tarayıcı kontrolü

`tests/real-api-smoke.mjs` çalışan frontend + A backend'i üzerinde 9 gerçek entegrasyon senaryosu içerir. Aynı Playwright index.mjs yolunu ilk argüman alır. Betik adaylar/sentetik piyasa/sanal emir/yerel karne sınırını korur; gerçek LLM veya Fuji kanıtı değildir.

Bu OneDrive ortamında standart backend data/ atomic rename işlemi EPERM verdi. A'nın kaynakları değiştirilmeden server/ terminalinde `npm exec -- tsx ../web/tests/serve-backend.ts` ile aynı startApp fonksiyonunun geçici dataDir seçeneği kullanılarak test edildi. Önce standart backend kapatılmalı. Ayrıntı docs/frontend/contract-questions.md'de.

Bağımsız /verify backend'e istek atmaz. Beklenen run.reportHash.value elle girilir veya seçili karneden aktarılır. Aynı tam dosya baytları ile karşılaştırma, zincir kaydından ayrı gösterilir. Fuji manifesti yokken zincir doğrulaması bekliyor kalır.
