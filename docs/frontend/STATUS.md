# B frontend durumu — 17 Ekim 2026

Dal: `b-web`. Backend referansı: `31804ce` (suite dev-0.3). Ana dal, önceki B teslimini içerdiğinden b-web çatışmasız ileri alındı. B'nin yeni kaynak değişiklikleri yalnız web/ ve docs/frontend/ altında.

## Yeni eklenen ekran desteği

- Altı zorunlu test ve seçilen adayın desteği API'den gelir. Claude'un dört takip testi destek listesinde olsa bile kapsam 6/6 olarak kalır; 10/6 gösterilmez. Betik adaylarda yalnız T03 desteklenir.
- Aday türü/modeli API label'ından aynen gösterilir. llm NOT_CONFIGURED, adayın betik olduğunu kanıtlamaz; ilk başarılı çağrı henüz yapılmamış olabilir. Koşu bitince health yeniden alınır.
- Sınav ve karne ekranlarında ayrı **Takip testleri** bölümü: testId, baseTestId, title, examinerReason, testStatus, reason ve evidenceEventIds gösterilir.
- Genel EXAMINER_DECISION olayları seçim kaydıyla birlikte görünür. Sınavcı hatası açıkça gösterilir. Boş liste, henüz gelmemiş sonuç ve eski kayıtta alanın bulunmaması başarıya çevrilmez.
- Takip testinden kanıta tıklamak ilgili olayları filtreler/vurgular. Bulguya tıklamak önceki filtreyi temizler; kanıt başka test filtresinin arkasında kalmaz.
- Zorunlu test sayaçları takiplerden ayrı. Backend verdict aynen gösterilir; 6/6 zorunlu PASS + kritik takip bulgusu genel FAIL olabilir.
- Karşılaştırmada seçilen takip kimlikleri ayrı görünür; aynı sabit paket hash'leri, adaptif seçimin aynı olduğunu iddia etmez.

## Bu bilgisayarda doğrulananlar

- TypeScript, üretim derlemesi ve 8 birim testi başarılı.
- 16 mevcut fixture/HTTP deneme tarayıcı kontrolü başarılı.
- 7 yeni takip testi/Claude kapsamı tarayıcı kontrolü başarılı. Bunlar açık HTTP test yanıtlarıdır; gerçek model veya sınavcı çalıştırıldığı anlamına gelmez.
- 9 gerçek API + ATK MCP tarayıcı kontrolü başarılı. Bu kez standart `server/npm run dev`, OneDrive içindeki normal `data/` yolu kullanıldı. Önceki EPERM hatası tekrarlanmadı; geçici dataDir başlatıcısı gerekmedi.
- Gerçek entegrasyonda yalnız ücretsiz betik adaylar çalıştırıldı: T03 FAIL/PASS, beş UNSUPPORTED, PARTIAL, gerçek kanıt/rapor, hash eşleşmesi, 409 ve iptal doğrulandı. `followUps: []`, modelCalls 0.
- 1440/1280 masaüstü ve 390 px görünüm; yeni takip kartlarının masaüstü/mobil ekran görüntüleri incelendi. Sayfa taşması ve tarayıcı JS hatası görülmedi.
- Kontrol çıktıları `web/artifacts/` içinde Git dışında.

## A'nın bildirdiği, burada yeniden çalıştırılmayan

`docs/backend/STATUS.md` gerçek Claude adayıyla altı testin ve sınavcının F01/F05 seçiminin geçtiğini bildiriyor. Bu B oturumunda ücretli model çağrısı yapılmadı; Claude ve dolu followUps arayüz davranışı test yanıtlarıyla doğrulandı. Gerçek Claude yalnız backend'in aday listesinde varsa seçilebilir. API anahtarları frontend'e aktarılmadı.

## Bekleyen / sınırlar

- Fuji manifesti alındı ve sabit web yapılandırmasına aktarıldı. /verify kayıt bloğu, olay ve makbuz eşleştirmesi yapıyor. Gerçek RPC denemesi HTTP 429 hız sınırı nedeniyle tamamlanamadı; bu bilgisayarda canlı zincir başarısı iddia edilmiyor. Detay FUJI-INTEGRATION.md içinde.
- A'nın README/API/STATUS belgelerinde eski T03-only bölümler yeni durumla çelişiyor; contract-questions.md içinde not edildi.
- B-02 hata maskelemesi A tarafından eklendi; bu oturumda kasıtlı dosya erişim hatası oluşturulmadı.
- b-web'in main'e birleştirilmesi A'nın sorumluluğunda. Hosting yayını yapılmadı.

UI demo açık etiketli, T03 örneği olarak kaldı; gerçek API hatasında otomatik açılmaz. Shared 100 USD bütçenin tamamı takıma ait değildir. A'nın kodunda varsayılan 3 USD harcama sigortası bulunuyor; bu oturum ortak model kredisini kullanmadı.

## Fuji ekran güncellemesi

8 birim testi ve 4 yeni tarayıcı kontrolü başarılı: tam dosya eşleşmesi, tek satır sonu farkı, yanlış kimlik, makbuz tutarlılığı, bekleme, HTTP 429 ve mobil görünüm. Ağ yanıtları bu testlerde açıkça sentetiktir. Kaynakta kullanıcı dosyasından hedef/ABI alınmaz; yalnız public hash ve sabit kontrat okuma sorguları gönderilir. Gerçek zincir çağrıları imza/model anahtarı gerektirmez. A daha önceki LLM koşularının zincire kaydedilmediğini bildiriyor.
