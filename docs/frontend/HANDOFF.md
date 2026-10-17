# A'ya B teslimi

## Birleştirme ve sahiplik

B dalı `b-web`. Yalnız web/ ve docs/frontend/ içerir. main'e doğrudan commit/push yapılmaz; birleştirmeyi A yapar. Commit kimliği GitHub noreply adresiyle yapılandırıldı.

## Çalıştırma

Aynı bilgisayarda backend ve frontend:

```powershell
cd server
npm install
npm run dev
```

Backend için global `@okx_ai/okx-trade-mcp@1.4.8` gerekli. Bu betik aday sürümü anahtarsız çalışır.

Ayrı terminalde:

```powershell
cd web
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev
```

Frontend http://127.0.0.1:5173, backend http://127.0.0.1:8787. Vite /api proxy'si hazır; port doluysa sessizce değişmez. Frontend kendi package ve lock dosyasına sahip. web/pnpm-workspace.yaml yalnız web bağımlılıklarının derleme iznini tutar; kök workspace yok.

### Bu OneDrive ortamında test edilen alternatif

Standart backend `data/` yazımında EPERM verdi. A kodu değiştirilmeden, server/ terminalinde:

```powershell
npm exec -- tsx ../web/tests/serve-backend.ts
```

Bu B test başlatıcısı A'nın startApp fonksiyonuna geçici dataDir verir. Portlar aynıdır. Önce standart backend kapatılmalı. Backend kaynaklarının düzeltildiği anlamına gelmez. Asıl hata ve yol sızıntısı contract-questions.md'de.

## API uyumu

- GET health/candidates/tests/runs, POST runs, GET runs/:id, GET events?after, POST cancel, GET report kullanılıyor.
- JSON yanıtlarında apiVersion "1" kontrol ediliyor. Rapor ham dosya olarak aynen indirilir.
- İstek: requestId (crypto.randomUUID), candidateId, altı test kimliği. Çift tıklama kilidi var. Yanıt kaybı/ağ belirsizliğinde aynı requestId ve içerik korunur. Kesin 4xx/DEPENDENCY_NOT_READY reddinde yeni seçim yapılabilir.
- GET runs tam run nesneleri döndürür; ortak alanları geçmişte gösteriliyor.
- Yalnız atkExam VERIFIED gerekir. LLM NOT_CONFIGURED olması betik adayları engellemez. Model gereksinimlerini A'nın 503 yanıtı yönetir.
- Aktifken saniyede bir polling, seq tekrar ayıklama, boş yanıtta önceki olayları koruma. Terminal status sonrası son bir olay okumasıyla paralel istek yarışı kapanır, sonra polling durur.
- Hüküm/counts A'dan gösterilir. Altı test seçimi tam sınav demek değildir. Desteklenmeyen testler ve gerekçeler görünür.
- 409 RUN_IN_PROGRESS mevcut runId'yi açabilir; 503 açık hazırlık mesajıyla gösterilir. Fixture'a otomatik geçiş yok.
- Karşılaştırma yalnız dolu/eşit suiteHash,fixtureHash,policyHash üçlüsünde eşdeğer sayılır.

## Rapor ve bağımsız doğrulama

A'nın raporu reportVersion/runId/candidate.versionHash/suiteHash/fixtureHash/policyHash/tests/evidence.events envelope'u olarak okunuyor. Ham dosya kendi hash'ini veya receipt'i içermiyor; hash referansı run.reportHash.value.

Karne ekranında Dosyayı bağımsız doğrula seçildiğinde referans hash doğrulayıcıya aktarılır. Bağımsız http://127.0.0.1:5173/verify açılışında backend gerekmez; referans elle girilir. Dosya seçilince tam baytlar cihazda SHA-256 ile hesaplanır. Beklenen hash boş/geçersiz/eşleşen/eşleşmeyen ayrı durumlar. Bu kontrol dosyayı sunucuya yüklemez.

Fuji manifesti/ABI yok. Zincir doğrulaması bekliyor yazıyor; yerel eşleşme zincir sonucu diye sunulmuyor. Sabit public manifest gelirse B chain-manifest.ts dosyasını değerlendirir; kullanıcı raporundan rastgele URL/RPC/kontrat hedefi çağrılmaz.

## Tekrar doğrulama

web/ içinde pnpm.cmd typecheck, pnpm.cmd test, pnpm.cmd build.

Playwright kuruluysa:

```powershell
node tests/real-api-smoke.mjs "PLAYWRIGHT_INDEX_MJS_TAM_YOLU"
node tests/browser-smoke.mjs "PLAYWRIGHT_INDEX_MJS_TAM_YOLU"
```

Gerçek test iki sunucunun çalışmasını gerektirir ve 9 senaryo içerir. Fixture/HTTP deneme paketi ayrı geçici browser profiliyle 16 senaryo içerir. Microsoft Edge kullanılır; kullanıcı tarayıcı profiline erişilmez. Ekran görüntüleri/JSON sonuçları artifacts/ altında Git dışında tutulur.

## Demo sırası

Adayın betik/LLM olmadığını söyle → altı testten yalnız T03 desteğini göster → yeniden göndereni başlat → bulgudan kanıta git → PARTIAL ve yerel kaydı ayır → gerçek raporu indir → hash eşleşmesini göster. PRODUCT.md iki dakikalık konuşma ve Q&A içerir.

Model bütçesi: ortak 100 USD'nin tamamı bu takımın değil. Yaklaşık 33,33 USD veya daha az; çalışma hedefi 20 USD (12 geliştirme,5 demo,3 tekrar). A gerçek kalan payı teyit etmeli. Şimdiki entegrasyon model çağrısı yapmıyor.
