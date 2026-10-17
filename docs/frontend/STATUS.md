# B frontend durumu — 17 Ekim 2026

Teslim hedefi 19.00. Dal: `b-web`. Backend referansı: `54ac467`. Güncel sözleşme ve sonundaki Uygulama notları okundu.

## Gerçek API ile doğrulandı

- A'nın değiştirilmemiş backend'i ve global ATK MCP 1.4.8 bu bilgisayarda çalıştırıldı. `api:smoke` kontrollerinin tamamı geçti.
- Gerçek LLM çağrısı yok: adaylar kodla yazılmış betikler, `llm=NOT_CONFIGURED`, `counts.modelCalls=0`.
- Yalnız T03 uygulanıyor. Altı test birlikte istenir; kalan beş test UNSUPPORTED ve terminal koşu PARTIAL. Önce sorgulayan betikte T03 PASS olsa bile genel verdict INCONCLUSIVE. Yeniden gönderen betikte verdict FAIL.
- Gerçek araç kökeni ATK MCP; piyasa verisi SYNTHETIC; yürütme SIMULATED; ağ NONE. Bu dört bilgi ayrı gösteriliyor.
- credentialStatus LOCAL_ONLY, receipt null. Sınav sonucu ve Karne kaydı ayrı başlıklar.
- Arayüzden başlatma, çift tıklamada tek POST, sıralı olaylar, bulgudan bütün evidenceEventIds olaylarına geçiş, gerçek rapor indirme, hash eşleşmesi, sayfa yenilemeyle aynı koşuyu açma geçti.
- Gerçek RUN_IN_PROGRESS hatası mevcut koşuyu açmayı teklif ediyor. İptal kesinleşmeden CANCELLED gösterilmiyor.
- `/verify` bağımsız açıldığında sıfır /api isteği ile çalıştı. Beklenen hash elle girilebilir; karne ekranından geçişte run.reportHash.value hazır gelir. Tam dosya baytları hash'lenir. Aynı dosya eşleşti; yalnız satır sonu eklenmiş dosya eşleşmedi.

## Kontroller

- TypeScript ve üretim derlemesi: başarılı.
- 6 birim testi: olay birleştirme, boş yanıt, karşılaştırma hash'leri, kanıt boşluğu, terminal durumlar, tam bayt hash'i ve A'nın rapor envelope'u.
- 16 tarayıcı fixture/HTTP deneme senaryosu: başarılı. Bu katman gerçek backend kanıtı değildir.
- 9 gerçek API tarayıcı senaryosu: başarılı. Gerçek ATK/sanal borsa hattını doğrular; LLM veya zincir doğrulaması değildir.
- 1440 ve 1280 masaüstü, 390px dar ekran kontrol edildi; tablolar kapsayıcısında kayıyor, sayfa taşmıyor. Ekran görüntüleri incelendi.
- Yerel kontrol çıktıları ve ekran görüntüleri `web/artifacts/` altında, Git dışında. Tekrar çalıştırılabilen test kodu depoda.

## Ortam sorunu ve kullanılan test yolu

Standart `npm run dev` bu OneDrive checkout'unda ilk koşuyu `.run.json.tmp` → `.run.json` yeniden adlandırmasında EPERM ile ERROR/INCONCLUSIVE kapattı. Bu sonuç gizlenmedi. A'nın kaynak dosyaları değiştirilmedi.

Gerçek frontend entegrasyonu `web/tests/serve-backend.ts` ile **A'nın aynı startApp fonksiyonunu** ve aynı 8787/18999 portlarını kullanarak yapıldı; yalnız runtime dataDir OS geçici dizinine yönlendirildi. Bu geçici test sunucusudur, yeni bir backend değildir. Standart OneDrive veri yolunun düzeltildiği iddia edilmiyor; A'ya soru açık.

## UI demo

Ayrı seçilen `?mode=demo` modu her ekranda UI DEMO — sentetik arayüz verisi yazar. Gerçek API hatasında kendiliğinden açılmaz. Fixture da yalnız T03'ü örnekler; sahte 6/6 başarı yok. Dosya adı ve içeriği demo etiketli. Tarayıcı deposunda yalnız demo verisi var, secret yok.

## Bekleyen

- LLM aday/sınavcı, beş eksik test ve Fuji A'nın kapsamı; uygulanmış gibi sunulmuyor.
- Fuji manifesti/ABI yok: chain-manifest.ts null; zincir doğrulaması bekliyor. Yerel hash eşleşmesi zincir makbuzu değildir.
- OneDrive atomic rename ve altyapı hata metninde yerel yol görünmesi için A'nın değerlendirmesi gerekli.
- Ana dala birleştirme A'nın sorumluluğunda. Yayın yapılmadı.

## Sahiplik ve bütçe

Yalnız web/ ve docs/frontend/ kaynakları eklendi/değiştirildi. server/, contracts/, docs/API.md, docs/backend/, kök README/Git kaynakları değiştirilmedi. Başka agent/chat başlatılmadı, başka sohbete mesaj gönderilmedi.

100 USD ortak model kredisi yaklaşık üçe bölünecek, takım payı 33,33 USD veya daha az. Planlama hedefi 20 USD; uygulanmış harcama limiti değildir. Bu kontroller model API anahtarı kullanmadı.
