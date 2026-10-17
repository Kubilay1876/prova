# A'ya entegrasyon notları

Backend referansı `b2219dc`, suite dev-0.3. B yalnız web/ ve docs/frontend/ değiştirir.

## Kapanan — B-01: OneDrive persist rename EPERM

A'nın atomicWriteSync düzeltmesi bu bilgisayarda standart `npm run dev` ve OneDrive içindeki normal data/ yolu ile tekrar denendi. 9 gerçek API/ATK tarayıcı kontrolü geçti; betik koşularında önceki EPERM tekrarlanmadı. Geçici serve-backend.ts başlatıcısı bu kontrol için kullanılmadı. Bu, bütün Windows dosya kilidi ihtimallerinin test edildiği anlamına gelmez.

## A düzeltmesi geldi — B-02: Hata metninde yerel yol

A safeMessage maskelemesini ekledi. Kaynak okundu; bu B oturumunda kasıtlı altyapı arızasıyla tekrar test edilmedi. Önceki hata içeren kayıtların geriye dönük değişmediği biliniyor.

## Açık — B-03: Fuji manifesti

Manifest henüz yok. chain-manifest.ts null. Gerekli public alanlar: chainId=43113, contractAddress, recorderAddress, deploymentBlock, izinli HTTPS rpcUrl, abiVersion, tam ABI ve eventName. Karne hükmü ve kayıt durumu ayrıdır.

## Açık — B-04: Belgelerde eski kapsam

README ve docs/API.md Uygulama notları hâlâ yalnız T03/betik aday diyor. STATUS.md içindeki eski “henüz yapılmadı/engelli” maddeleri yeni altı test/Claude/sınavcı doğrulamalarıyla çelişiyor. B, güncel çalıştırılabilir API ve A'nın yeni STATUS maddelerini esas aldı; A belgelerini değiştirmedi. Gerçek güncel suiteVersion dev-0.3.

## Takip testi entegrasyonu

run.followUps opsiyonel olarak destekleniyor: testId, baseTestId, title, examinerReason, testStatus, reason, evidenceEventIds. Altı zorunludan ayrı görünür; counts ve verdict yeniden hesaplanmaz. Sınavcı seçimi/hatası testId=null EXAMINER_DECISION olayından okunur. Sınavcı hatasının ardından backend genel PASS verirse frontend bunu değiştirmez ama hatayı görünür tutar.

GET /api/candidates henüz kind/model alanlarını göndermiyor; label bunları içeriyor. B, health durumundan aday türü çıkarmıyor. supportedTestIds takip kimliklerini de içerdiği için zorunlu kapsam yalnız T01–T06 kesişimiyle gösterilir.

Fuji kaydı sınav bitiminden sonra asenkron gelebilir. API sözleşmesine göre terminal koşuda otomatik polling durur. PENDING kayıt için kullanıcıya koşuyu yeniden açması söylenir; kayıt tamamlandı iddiası yapılmaz.
