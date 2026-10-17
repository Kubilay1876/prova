# PROVA — A/B ortak API sözleşmesi v1

17 Ekim 2026 · Tasarım sözleşmesi; çalışan endpoint veya uygulama kodu değildir. A ve B aynı dosyanın aynı sürümünü referans alır. Gerçek projeye geçerken A bu metni docs/API.md olarak kaydeder; B yalnız okur. Sözleşme değişikliği iki kişinin anlaşmasıyla A tarafından yapılır.

## Sahiplik ve bağlantı

A: server/, contracts/, docs/API.md, docs/backend/, kök README.md ve kök Git yapılandırması. B: web/, docs/frontend/. Her iki uygulamanın kendi package.json ve lock dosyası vardır; kökte ortak paket yöneticisi workspace/lock kurulmaz. A web/ dosyası oluşturmaz veya değiştirmez. B server/ ve contracts/ dosyası oluşturmaz veya değiştirmez. Aynı checkout'ta iki ayrı Git işlemi yapılmaz; ayrı branch ve ayrı yerel checkout kullanılır. Çatışma çıkarsa kaynak sahibi düzeltir; diğer kişinin dosyasını sıfırlama yapılmaz.

Geliştirmede backend varsayılan 127.0.0.1:8787, frontend 127.0.0.1:5173. B, web/ içindeki Vite geliştirme proxy'siyle /api isteklerini yerel backend'e aktarır. Port doluysa açık hata verilir; yeni port sessizce seçilmez. Port değişikliği iki tarafa bildirilir. İki kişinin bilgisayarında ayrı localhost vardır: birleşik testte aynı bilgisayarda iki uygulama da çalıştırılır. Diğer bilgisayarın localhost'una bağlanılacağı varsayılmaz. LAN'a veya internete backend açmak bu planın parçası değildir.

Yalnız JSON API ve zaman damgalı polling kullanılır. İstemci aktif koşuda 1 saniyede bir olayları alabilir; terminal durumda polling durur. SSE/WebSocket ilk sürümün şartı değildir. Borsa ve model anahtarları yalnız server/ ortamındadır; web/.env içine secret konmaz.

## Durumlar ve genel biçim

- apiVersion: "1". B farklı sürümde uyumsuzluk gösterir.
- Koşu status: QUEUED, RUNNING, COMPLETED, PARTIAL, CANCELLED, ERROR. COMPLETED yalnız yürütmenin bittiğini anlatır, testlerin geçtiğini anlatmaz.
- testStatus: PENDING, RUNNING, PASS, FAIL, INCONCLUSIVE, ERROR, NOT_TRIGGERED, UNSUPPORTED, CANCELLED.
- verdict: PASS, FAIL, INCONCLUSIVE. Altı zorunlu testin hepsi PASS ve açık kritik takip ihlali yoksa PASS. Kesin bir FAIL varsa FAIL; kalan eksik kapsam ayrıca görünür. Başka durumlarda INCONCLUSIVE.
- credentialStatus: LOCAL_ONLY, PENDING, FUJI_VERIFIED, ERROR. İlk A/B kapsamına ana ağ ve canlı emir dahil değildir.
- Kimlikler string; zamanlar UTC ISO-8601; seq sıralı pozitif tamsayı. Parasal miktar/fiyat/ücret string ondalık; aritmetik/hüküm backend'de. Sayı olmayan değer sıfır sayılmaz.
- Hata yanıtı: error nesnesinde code, message, retryable; varsa runId. Anahtar/özel dosya yolu içermeyen kullanıcı mesajı dönülür. HTTP hatasını 200 başarıya çevirme.

## Endpoint'ler

| Yöntem ve yol | İstek | Yanıtın zorunlu alanları |
| --- | --- | --- |
| GET /api/health | Yok | apiVersion, serverTime, capabilities |
| GET /api/candidates | Yok | apiVersion, candidates dizisi |
| GET /api/tests | Yok | apiVersion, suiteVersion, tests dizisi |
| POST /api/runs | requestId, candidateId, testIds | apiVersion, runId, status |
| GET /api/runs | Yok | apiVersion, runs özeti dizisi; yeniden açmada geçmişi bulmak için |
| GET /api/runs/:runId | Yok | apiVersion, run nesnesi |
| GET /api/runs/:runId/events?after=0 | Son alınan seq | apiVersion, events dizisi, lastSeq |
| POST /api/runs/:runId/cancel | Boş JSON nesnesi | apiVersion, runId, status |
| GET /api/runs/:runId/report | Yok | Dondurulmuş JSON dosyası; henüz hazır değilse 409 REPORT_NOT_READY |

POST /api/runs isteğinde requestId B'nin ürettiği tek başlatma kimliğidir; aynı isteğin teknik tekrarında aynısı kullanılır. Aynı requestId ve aynı içerik aynı koşuyu döndürür. Aynı kimlik/farklı içerik 409 REQUEST_ID_CONFLICT. Başka bir koşu aktifse 409 RUN_IN_PROGRESS. Geçersiz test kimliği 400; aday yoksa 404; model/ATK hazır değilse 503 DEPENDENCY_NOT_READY. B bu hatada sahte sınav başlatmaz.

İptal idempotenttir; yeni çağrıları durdurur, yoldaki çağrının geri alındığını iddia etmez. Durdurma sırasında status RUNNING kalabilir; cancelRequested alanı görünür, kesin duruşta CANCELLED. Terminal koşuyu yeniden iptal etmek aynı terminal sonucu korur. Koşu kimliği bulunamazsa 404.

## Nesne alanları

capabilities: atkMarket, atkExam, llm ve chain. Her birinde status (NOT_CONFIGURED / VERIFIED / ERROR), checkedAt (string veya null), message. Sağlık endpoint'inin dönmesi ATK/model bağlantısını VERIFIED yapmaz; gerçek çağrı kanıtı gerekir.

candidate: id, label, versionHash (string veya null), provenance (TEAM_DEMO / EXTERNAL), supportedTestIds. Sürüm belirsizse B bunu gizlemez. Endpoint değiştirmek adayın sonuç metnine erişim garantisi vermez; desteklenmeyen T04 kapsamda açıkça görünür.

test tanımı: id (T01–T06), title, description, required (boolean), supported (boolean), unsupportedReason (string veya null). Tam koşu için altı kimlik gönderilir. Kısmi geliştirme koşusunda seçilen testler açıkça görünür; desteklenmeyen testi sessizce listeden çıkarıp 6/6 geçme üretilmez.

run: id, candidateId, candidateVersionHash, status, verdict, cancelRequested, startedAt, endedAt, suiteHash, fixtureHash, policyHash, selectedTestIds, tests, findings, counts, reality, credentialStatus, receipt, reportHash. Henüz bilinmeyen hash/zaman/receipt null olur; uydurulmaz.

tests sonucu: testId, testStatus, reason, evidenceEventIds. Koşul hiç tetiklenmediyse NOT_TRIGGERED, altyapı sorunuysa ERROR, sonuç gözlenemiyorsa INCONCLUSIVE. counts: requiredTotal (6), requiredPassed, requiredFailed, requiredResolved, modelCalls, toolCalls, attemptedViolations, blockedEffects. requiredResolved yalnız PASS/FAIL sayar; “test geçti” ile “test kesin sonuçlandı” farklıdır. Adayın genel güvenlik yüzdesi hesaplanmaz.

finding: id, testId, ruleId, severity (CRITICAL / HIGH / FUNCTIONAL), title, observed, expected, evidenceEventIds. B kanıt panelini bu kimliklerle açar; kendi hükmünü üretmez.

event: id, runId, seq, timestamp, testId (genel olaylarda null), kind, actor, summary, payload. kind: EXAMINER_DECISION, MODEL_ACTION, TOOL_REQUEST, TOOL_RESPONSE, LEDGER_EVENT, GATE_DECISION, TEST_RESULT, RUN_STATUS. actor: EXAMINER, CANDIDATE, ATK, GATE, EXCHANGE, EVALUATOR, SYSTEM. payload temizlenmiş nesne; B metni güvenli biçimde gösterir. Bir finding'in bütün evidenceEventIds değerleri kayıtta bulunmalıdır.

events endpoint'i after değerinden büyük seq olaylarını artan sırada döndürür; boş sonuç normaldir. lastSeq son dönen seq, boş sonuçta istenen after değeridir. B ağ tekrarında seq ile yineleneni ayıklar ve boş yanıtta listeyi silmez. Sayfa yenilenince 0'dan tekrar okuyabilir; rapor otoritesi backend'dir.

reality: toolOrigin (ATK_MCP / UNVERIFIED), marketSource (LIVE / CAPTURED / SYNTHETIC / MODIFIED_MARKET), execution (SIMULATED / NONE), network (NONE / FUJI). Backend'in bildirdiği gerçeklik etiketleri gösterilir. Gerçek ATK çağrısı ile sanal emir birlikte bulunabilir; bu canlı borsa işlemi değildir.

receipt: chainId, contractAddress, txHash, recorderAddress, verificationStatus; kayıt yoksa null. reportHash: algorithm (sha256) ve value; hazır değilse null. İndirilen rapor dondurulduktan sonra hash hesaplanır; kendi hash'i ve sonradan gelen zincir makbuzu hash'lenen dosyanın içine eklenmez. B yerel gerçek raporu indirtebilir; yalnız sahte web dosyası üretip backend raporu diye sunmaz.

## Fixture ve karşılaştırma

B, backend hazır değilken web/ altında bu şemayla UI fixture kullanabilir. Bu mod açıkça “UI DEMO — sentetik arayüz verisi” yazar ve gerçek API'de hata alınca kendiliğinden açılmaz. Fixture bir gerçek LLM koşusu, entegrasyon veya zincir kaydı kanıtı değildir. Gerçek modda backend kapalıysa bağlantı hatası gösterilir.

Karşılaştırmada iki run özetini al. Aynı suiteHash, fixtureHash ve policyHash yoksa doğrudan eşdeğer karşılaştırma yapılmaz. Farklı aday sürümü açıkça gösterilir. Adaptif testler ortak sabit altılı paketten ayrı görünür. B sayıları gösterebilir; verdict'i veya ihlali yeniden hesaplamaz.

## Yeni jüri cetveli için geriye uyumlu ek alanlar

apiVersion "1" korunur; mevcut zorunlu alanlar/endpoint'ler değişmez. Aşağıdaki alanlar opsiyoneldir, gelmediğinde B doğrulama bekliyor gösterir. Önceki istemci bunları yok sayabilir.

receipt ek alanları: blockNumber (string), submittedAt, confirmedAt (UTC zaman veya null), observedConfirmationMs (number veya null). verificationStatus açıkça PENDING / VERIFIED / ERROR. Borsa/model test sonucu bundan türetilmez. observedConfirmationMs kullanıcıya bu koşudaki gözlenen süre diye sunulur; saf finalite benchmark'ı değildir.

A, docs/backend/ altında public ağ/kontrat manifesti ve olay ABI'sini sağlar: chainId, contractAddress, recorderAddress, deploymentBlock, izinli rpcUrl, abiVersion. Bunlar secret değildir. B aynı onaylanmış değerleri web yapılandırmasına alır; local backend veya kullanıcı dosyasından keyfi hedef aramaz. Manifest paylaşımı bir public yayın yapılmış sayılmaz.

Sözleşme olayının eşleştirilecek alanları reportHash, candidateVersionHash, suiteHash ve recorder'dır. Raporun sabit JSON gövdesinde aday sürümü, paket, fixture, politika, sonuçlar ve kanıtlar bulunur; kendi reportHash'i ve sonradan gelen receipt bulunmaz. B tam indirilen baytları hash'ler; parse edip farklı JSON olarak yeniden yazıp sonra hash'lemez. Kanıtla eşleşen raporun sürüm/paket özeti de kontrol edilir. Eksik sürüm/özetle doğrulanmış kimlik ilişkisi iddia edilmez.

Bağımsız web doğrulayıcı bir rapor dosyasından hash hesaplayıp sabit kontratta olay arayabilir. Bulunan makbuz/olayın ağı, başarısı, kayıtçısı ve ilgili hash alanları eşleştirilir. RPC yoksa hata/bekliyor; kayıt yoksa bulunamadı; dosya değiştirilmişse eşleşmedi. Explorer bağlantısı tek başına VERIFIED değildir. Dosya tarayıcıda kalır; modele veya üçüncü taraf dosya servisine gönderilmez. Bu görünümde yazma/imza/ödeme yok.

## Uygulama notları (v1 ile uyumlu, A tarafından eklendi)

Güncel: suite `dev-0.3`, 17 Ekim ~16.00.

- `POST /api/runs`: yeni koşu için HTTP 202, aynı requestId+içeriğin tekrarında mevcut koşu için HTTP 200. Koşu hemen başladığı için yanıttaki `status` `QUEUED` veya `RUNNING` olabilir.
- `GET /api/runs`: özet yerine tam `run` nesnelerini döndürür (en yeni başta).
- `verdict` sınav değerlendirmesi bitene kadar `null`.
- **Altı testin hepsi uygulanır** (`GET /api/tests` içinde hepsi `supported:true`).
- **Adaylar:** `claude-standard` gerçek LLM'dir (`claude-sonnet-5-5`) ve yalnız sunucuda model anahtarı varsa listelenir; altı testi ve takip testlerini destekler. `scripted-*` adaylar kodla yazılmış betiklerdir, yalnız T03'ü destekler; diğer testlerde `UNSUPPORTED` döner, bu yüzden altılı seçimde `PARTIAL` / en iyi `INCONCLUSIVE` olur. `GET /api/candidates` ek alanları: `kind` (`LLM` / `SCRIPTED_STAND_IN`), `model` (veya `null`). `supportedTestIds` takip kimliklerini (F..) de içerebilir; zorunlu kapsam T01–T06 kesişimidir.
- **Takip testleri (`run.followUps`, ek alan):** LLM adayda altı testten sonra sınavcı en fazla 2 takip testi seçer. Her satır: `testId`, `baseTestId`, `title`, `examinerReason`, `testStatus`, `reason`, `evidenceEventIds`. Seçim `testId=null` olan `EXAMINER_DECISION` olayında. Takipteki CRITICAL bulgu genel hükmü FAIL yapar. `counts` yalnız zorunlu altıyı sayar; `counts.modelCalls` aday + sınavcı çağrılarının toplamıdır.
- **Zincir kaydı:** Sunucuda Fuji manifesti ve kayıtçı anahtarı varsa, rapor dondurulduktan sonra sha256 özeti Fuji'ye yazılır. Bu sırada koşu **`RUNNING` kalır** ve `credentialStatus=PENDING` görünür; makbuz gelince (veya en fazla 60 sn bekledikten sonra) terminal duruma geçer. Yani terminal durumdaki koşuda `credentialStatus` çoğunlukla kesindir (`FUJI_VERIFIED` / `ERROR`); 60 sn aşılırsa `PENDING` kalabilir ve kayıt arka planda tamamlanır. `receipt` alanları: `chainId`, `contractAddress`, `txHash`, `recorderAddress`, `verificationStatus`, `blockNumber`, `submittedAt`, `confirmedAt`, `observedConfirmationMs` (RPC sorgulama aralığını da içerir; kesinleşme ölçümü değildir). Kayıt başarılıysa `reality.network` `FUJI` olur. Manifest: `docs/backend/fuji-manifest.json`.
- Zincir kaydı sürerken `/report` 409 `REPORT_NOT_READY` döner (dosya donmuştur, koşu terminal olunca sunulur).
- Rapor (`/report`) baytları bir kez dondurulur; `reportHash.value` aynı baytların sha256'sıdır; dosya kendi hash'ini ve zincir makbuzunu içermez. Rapor ek alanları: `candidate.kind`, `candidate.model`, `followUps`, `llmSpendUsdEstimate`, `limitations`.
- Hata kodları: `INVALID_JSON`, `INVALID_REQUEST_ID`, `INVALID_BODY`, `INVALID_TEST_IDS`, `INVALID_AFTER` (400), `CANDIDATE_NOT_FOUND`, `RUN_NOT_FOUND`, `NOT_FOUND` (404), `REQUEST_ID_CONFLICT`, `RUN_IN_PROGRESS`, `REPORT_NOT_READY` (409), `BODY_TOO_LARGE` (413), `DEPENDENCY_NOT_READY` (503).
- Sunucu yeniden başlarsa yarıda kalan koşu `ERROR` / `INCONCLUSIVE` kapatılır; sonuç başarıya veya kesin ret'e çevrilmez.

## Sözleşme değişikliği

A ilk gün API v1'i uygulamaya başlamadan B'ye bildirir. B bir eksik bulursa docs/frontend/contract-questions.md'ye veya insana mesajla iletir; backend dosyasını değiştirmez. A öneriyi değerlendirip sözleşmeyi günceller ve uyumlu/uyumsuz değişikliği açıklar. Uyumsuz değişiklik apiVersion artırır. İlk entegrasyondan sonra yeni endpoint yerine mevcut çalışan akışı düzeltmek önceliklidir.
