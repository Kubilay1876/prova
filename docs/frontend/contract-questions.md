# A'ya entegrasyon notları

Backend referansı `31804ce`, suite dev-0.3. B yalnız web/ ve docs/frontend/ değiştirir.

## Kapanan — B-01: OneDrive persist rename EPERM

A'nın atomicWriteSync düzeltmesi bu bilgisayarda standart `npm run dev` ve OneDrive içindeki normal data/ yolu ile tekrar denendi. 9 gerçek API/ATK tarayıcı kontrolü geçti; betik koşularında önceki EPERM tekrarlanmadı. Geçici serve-backend.ts başlatıcısı bu kontrol için kullanılmadı. Bu, bütün Windows dosya kilidi ihtimallerinin test edildiği anlamına gelmez.

## A düzeltmesi geldi — B-02: Hata metninde yerel yol

A safeMessage maskelemesini ekledi. Kaynak okundu; bu B oturumunda kasıtlı altyapı arızasıyla tekrar test edilmedi. Önceki hata içeren kayıtların geriye dönük değişmediği biliniyor.

## Kapanan — B-03: Fuji manifesti

31804ce ile manifest geldi: chainId=43113, kontrat 0xda0a8d5e87f90da24dec7338aa4bcc6af43cea2b, yükleme bloğu 59596297. Tam public manifest web/src/chain-manifest.ts içine incelenerek kopyalandı. recordedAt(hash) yalnız kayıt bloğunu bulmak için kullanılır; asıl doğrulama olay ve başarılı makbuz eşleşmesidir. Karne hükmü ve kayıt durumu ayrıdır.

## Açık — B-04: Belgelerde eski kapsam

README ve docs/API.md Uygulama notları hâlâ yalnız T03/betik aday diyor. STATUS.md içindeki eski “henüz yapılmadı/engelli” maddeleri yeni altı test/Claude/sınavcı doğrulamalarıyla çelişiyor. B, güncel çalıştırılabilir API ve A'nın yeni STATUS maddelerini esas aldı; A belgelerini değiştirmedi. Gerçek güncel suiteVersion dev-0.3.

## Takip testi entegrasyonu

run.followUps opsiyonel olarak destekleniyor: testId, baseTestId, title, examinerReason, testStatus, reason, evidenceEventIds. Altı zorunludan ayrı görünür; counts ve verdict yeniden hesaplanmaz. Sınavcı seçimi/hatası testId=null EXAMINER_DECISION olayından okunur. Sınavcı hatasının ardından backend genel PASS verirse frontend bunu değiştirmez ama hatayı görünür tutar.

GET /api/candidates henüz kind/model alanlarını göndermiyor; label bunları içeriyor. B, health durumundan aday türü çıkarmıyor. supportedTestIds takip kimliklerini de içerdiği için zorunlu kapsam yalnız T01–T06 kesişimiyle gösterilir.

Fuji kaydı sınav bitiminden sonra asenkron gelebilir. API sözleşmesine göre terminal koşuda otomatik polling durur. PENDING kayıt için kullanıcıya koşuyu yeniden açması söylenir; kayıt tamamlandı iddiası yapılmaz.

## Açık — B-05: Public Fuji RPC erişimi

Bu bilgisayardaki salt okuma denemesi ilk eth_chainId çağrısında HTTP 429 / Cloudflare 1015 verdi. Başka hedefe otomatik geçiş veya doğrulandı iddiası yok. Sayfa bu durumu hata olarak gösteriyor. A'nın gerçek kayıtlı rapor baytları bu bilgisayarda yok; pozitif dosya/olay/makbuz yolu izole sentetik RPC ile test edildi. Gerçek ağda tekrar çalıştırma için web/tests/fuji-read-smoke.mjs hazır.
