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

### OneDrive yeniden kontrolü

Backend b2219dc ile standart `npm run dev` ve normal data/ yolu üzerinden 9 gerçek API tarayıcı kontrolü geçti. Önceki EPERM tekrarlanmadı. `web/tests/serve-backend.ts` geçici veriyle izolasyon için tutuldu; bu teslim kontrolünde gerekmedi.

## dev-0.3 güncellemesi

- `run.followUps` hem sınavda hem karnede ayrı bölümde gösterilir. Sınavcının gerekçesi, bağlı zorunlu test, durum ve kanıt bağlantısı görünür.
- Genel EXAMINER_DECISION seçim/hata kaydı açılabilir. Eski kayıtta alan yoksa veya liste boşsa takip başarısı iddia edilmez.
- Zorunlu kapsam T01–T06 ile sınırlı; Claude'un takip destekleri 10/6 sayımına dönüşmez. Model hazırlığı aday türüne çevrilmez, API label'ı kullanılır.
- Altı PASS + kritik takip bulgusunda backend FAIL korunur. Karşılaştırma adaptif seçim farkını açıklar.
- A'nın gerçek Claude/takip koşuları STATUS.md'de bildirilmiş; B bu oturumda ücretli çağrı yapmadı.

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
node tests/followups-smoke.mjs "PLAYWRIGHT_INDEX_MJS_TAM_YOLU"
```

Gerçek test iki sunucunun çalışmasını gerektirir ve 9 senaryo içerir. Fixture/HTTP deneme paketi 16, yeni takip testi HTTP deneme paketi 7 senaryo içerir. İkisi de gerçek model kanıtı değildir; ayrı geçici browser profili kullanır. Microsoft Edge kullanılır; kullanıcı tarayıcı profiline erişilmez. Ekran görüntüleri/JSON sonuçları artifacts/ altında Git dışında tutulur.

## Demo sırası

Tamamlanmış gerçek Claude koşusunu aç → altı zorunlu sonucu göster → sınavcının takip gerekçesine ve kanıta git → ayrıca betik T03 ihlalini açık etiketiyle göster → sınav sonucu/karne kaydını ayır → gerçek rapor ve hash eşleşmesini göster. PRODUCT.md iki dakikalık konuşma ve Q&A içerir.

Model bütçesi: ortak 100 USD'nin tamamı bu takımın değil. Yaklaşık 33,33 USD veya daha az; çalışma hedefi 20 USD (12 geliştirme,5 demo,3 tekrar). A gerçek kalan payı teyit etmeli. Şimdiki entegrasyon model çağrısı yapmıyor.

A backend bütçe sigortası varsayılan 3 USD; önceki 20 USD planlama hedefi bu limiti yükseltme talimatı değildir.
