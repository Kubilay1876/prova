# PROVA — iki dakikalık sunum ve jüri hazırlığı

Güncel kapsam: backend 31804ce, suite dev-0.3. Claude ve sınavcıya ilişkin gerçek koşu kanıtı A'nın docs/backend/STATUS.md kaydıdır. B, ücretli çağrıyı tekrarlamadı; ekranları ve ücretsiz gerçek ATK/betik akışını doğruladı.

## Demo hazırlığı

Anahtarın bulunduğu bilgisayarda iki uygulamayı açın. Claude adayı API listesinde bulunmalı. Süreyi korumak için önceden tamamlanmış gerçek Claude koşusunu geçmişten açın; yoksa gerçek betik T03 akışını gösterip kapsamı söyleyin. UI DEMO verisini gerçek Claude koşusu diye sunmayın. Zincire kaydedilmiş bir rapor dosyasını doğrulayıcıya verin; eski LLM koşuları yerel kalmış olabilir. RPC erişimini sunumdan önce kontrol edin.

## İki dakikalık konuşma

**0:00–0:20 — Sorun.**

“Bir trading agent'ına yetki vermeden önce sadece ne söylediğini değil, hata anında ne yaptığını görmek istiyoruz. PROVA, belirli bir aday sürümünü kontrollü sanal borsada sınar; kararını olay kaydına bağlayan bir karne üretir.”

**0:20–0:45 — Aday ve sabit sınav.**

“Bu adayın adında modeli ve gerçek LLM olduğu yazıyor. Altı zorunlu test bütçe, eski fiyat, kayıp yanıt, gerçekleşme iddiası, bekleme ve geçerli görevi tamamlama davranışlarını sınar. Araç bağlantısı gerçek OKX ATK MCP; piyasa verisi sentetik, emirler sanal.”

**0:45–1:10 — Sınavcı ve takip.**

“Sınavcı ayrı bir model oturumunda sonuçları okur, sabit katalogdan en fazla iki takip seçer. Burada hangi zorunlu testi derinleştirdiğini, neden seçtiğini ve sonucunu görüyoruz. Sınavcı hüküm vermez; değerlendirmeyi kod yapar. Takipler altı zorunlu testin sayısına eklenmez.”

**1:10–1:35 — Kanıt.**

“Bir takip testine veya bulguya tıklayınca ilgili olayları açıyoruz. Adayın talebi, sanal borsa defteri ve geçidin engellediği etki ayrıdır. Altı test geçse bile kritik takip ihlali genel hükmü FAIL yapabilir. Hata örneğini göstermek için ayrıca yeniden gönderen betiğin T03 kaydını kullanıyoruz; bunu LLM hatası diye sunmuyoruz.”

**1:35–2:00 — Karne.**

“Karne aday sürümünü, sınav koşullarını ve kanıtları taşır. Raporu indirip tam dosya baytlarının SHA-256 değerini karşılaştırabiliyoruz. Sınav sonucu ve karne kaydı ayrı: burada zincir makbuzu yoksa yerel kayıt yazar. Bu, yalnız bu sürümün bu koşudaki davranışıdır; genel güvenlik veya yatırım başarısı garantisi değildir.”

## Jüri soruları

**Gerçek LLM çalıştı mı?** A'nın kayıtlarına göre Claude ile altı test ve ardından F01/F05 takipleri PASS aldı. B'nin bu güncellemesindeki model/sınavcı ekran kontrolleri sentetik HTTP yanıtlarıyla yapıldı; gerçek LLM çalıştırma kanıtı bunlar değildir.

**Agentic design nerede?** Aday gerçek araç şemalarıyla karar verir; ayrı bağlamdaki sınavcı sonuçlara göre en fazla iki katalog testi seçer ve gerekçe yazar. Kod seçimi sınırlar ve hükmü verir. Sınavcı serbestçe yeni test kodu üretmez.

**Altı test de geçtiyse iyi agent mı?** Yalnız o koşudaki kapsamı geçti. A'nın gözleminde aynı model farklı koşularda farklı karar verebiliyor. Altı PASS tek başına testin ayırt ediciliğini kanıtlamaz; kötü davranış örneği şimdilik açıkça etiketli betik adaydır.

**Kötü aday engellendiyse neden FAIL?** Geçidin engellemesi ile adayın ihlal talebi ayrı olgulardır. İkinci emir etkisi durdurulsa da talep kanıtta kalır.

**Takip başarısız olursa?** Arayüz takip durumunu ve backend'in genel hükmünü ayrı gösterir. Kritik takip bulgusu genel FAIL üretebilir. Boş takip listesi veya sınavcı hatası takiplerin geçtiği anlamına gelmez.

**OKX tarafında gerçek olan?** okx-trade-mcp süreci ve araç çağrıları. Hedef yerel sınav borsası; gerçek piyasada emir verilmez. PROVA'nın report_result bildirim aracı ATK aracı değildir.

**Avalanche hazır mı?** A sözleşmenin Fuji'ye yüklendiğini ve bir betik koşusunun kaydını doğruladığını bildiriyor. B manifesti sayfaya bağladı. Bu bilgisayardaki gerçek RPC denemesi 429 hız sınırına takıldı; sayfa bu durumda hata gösterir. Dosya hash eşleşmesi zincir makbuzu yerine geçmez.

**Maliyet kontrolü?** A'nın kodunda varsayılan 3 USD harcama sigortası, model çağrı sınırı ve maliyet takibi var. Ortak 100 USD'nin tamamı bizim değil. A'nın tek koşu tahmini gelecekteki fiyat veya garanti değildir; B bu oturumda ücretli model çağrısı yapmadı.

**Gerçek kullanıcı değeri ve iş modeli?** İlk hedef trading agent geliştiricileri: bir sürümün hatalı finansal araç davranışını kanıtıyla incelemek. Sürüm karşılaştırması ve CI raporu ürün hipotezidir; henüz müşteri/ödeme doğrulaması yok.

**OneDrive hatası ne oldu?** A'nın kayıt düzeltmesi sonrası B, standart veri yolunda 9 gerçek API/ATK kontrolünü geçirdi. Önceki EPERM tekrarlanmadı.

## Puan cetveli

Ürün/gerçek dünya değeri 25, agentic design 20, demo 20, teknik 15, Avalanche 10, OKX 10. Bunlar ağırlıklar; kazanılmış puan değildir. Kanıtı gösterin, her raporun zincir kaydını ayrıca kontrol edin; RPC hatasını başarı saymayın.
