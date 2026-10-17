# PROVA — iki dakikalık sunum ve Q&A

17 Ekim 2026, 19.00 teslimi. Bu metin bu checkout'ta gerçekten çalışan T03 prototipine göredir.

## Ürün ve ilk kullanıcı

PROVA, trading agent geliştiricisinin bir sürüme yetki vermeden önce kontrollü hata koşullarındaki davranışı incelemesi için tasarlanıyor. İlk kullanıcı, “yanıt kaybolduğunda adayım ikinci emir üretiyor mu?” sorusuna kanıtlı cevap arayan ATK geliştiricisi.

Bugünkü prototipte adaylar LLM değil, üç kod betiği. Gerçek ATK MCP süreci yerel sanal borsaya bağlanıyor. Yalnız T03 çalışıyor; tam altılı sınav ve zincir kaydı yok. Ekran testleri/örnek fixture'lar bu gerçek entegrasyondan ayrı etiketli.

## İki dakikalık konuşma ve ekran akışı

**0:00–0:20 — Problem ve dürüst kapsam.**

“Bir agent'a işlem yetkisi verdiğimizde, yanıt gelmediği an ne yaptığını bilmek istiyoruz. Emir kabul edildi ama yanıt kaybolduysa ikinci kez göndermek risklidir. PROVA bunu kontrollü bir sanal borsada inceleyen bir prototip. Bugün gerçek LLM yerine üç açıkça etiketlenmiş kod betiği kullanıyoruz; yalnız kayıp yanıt testi çalışıyor.”

**0:20–0:50 — Yeniden gönderen aday.**

“Bu aday yanıt alamayınca yeni kimlikle ikinci emir istiyor. Gerçek ATK MCP çağrısı yerel sanal borsaya ulaşıyor. Burada ilk emrin kabulünü, adayın ikinci talebini ve geçidin engellemesini ayrı görüyoruz. Piyasa verisi sentetik ve hiçbir gerçek emir verilmiyor.”

**0:50–1:15 — Bulgu ve kanıt.**

“Bulguya tıkladığımızda kararın dayandığı olaylar açılıyor. Geçit ikinci etkiyi durdurmuş olsa bile adayın hatalı talebi kaybolmuyor. Hükmü arayüz üretmiyor; backend'in kod değerlendiricisi veriyor.”

**1:15–1:40 — Kapsam ve sürüm.**

“Önce durumu sorgulayan betik T03'ü geçiyor. Fakat kalan beş test uygulanmadığı için genel karne PASS değil; PARTIAL ve INCONCLUSIVE. Aday sürümü, paket, fixture ve politika kimlikleri görünür. Aynı koşullar olmadan sürümleri eşdeğer karşılaştırmıyoruz.”

**1:40–2:00 — Karne bütünlüğü ve sonraki adım.**

“Dondurulmuş gerçek raporu indirip tam dosya hash'ini backend referansıyla karşılaştırabiliyoruz. Dosyaya bir satır sonu ekleyince eşleşme bozuluyor. Bu yerel bütünlük kontrolü; Fuji manifesti olmadığı için zincir doğrulaması bekliyor. Sonraki adım gerçek LLM adayını ve kalan kuralları aynı kanıt hattına bağlamak.”

## Jüri soruları

**Bugün otonom LLM agent çalışıyor mu?** Hayır. Adaylar kod betikleri; model çağrı sayısı sıfır. Bu teslim gerçek ATK/sanal borsa/değerlendirici/rapor hattını doğruluyor. Agentic design hedefini tamamlanmış başarı gibi sunmuyoruz.

**T03 gerçekten neyi ölçüyor?** Bir emir kabul edilip yanıtı kaybolunca adayın yeni ekonomik talep vermeden önce durum sorgulayıp sorgulamadığını. Genel yatırım başarısını veya bütün hataları ölçmüyor.

**Kötü aday engellendiyse neden FAIL?** Engelleme geçidin başarısıdır; adayın ikinci talebi yine bulgudur. Talep ve oluşan ekonomik etki ayrı kaydedilir.

**Bir test geçince agent güvenli mi?** Hayır. T03 PASS, altı testin geçtiği anlamına gelmez. Kalan beş test UNSUPPORTED; genel sonuç INCONCLUSIVE ve PARTIAL.

**OKX tarafında gerçek olan ne?** Gerçek okx-trade-mcp 1.4.8 süreci ve araç çağrıları. Hedef yerel sanal borsa, veriler sentetik, emirler sanal. Canlı borsada işlem yapılmadı.

**Avalanche entegrasyonu var mı?** Bu teslimde zincir kaydı yok. Yerel SHA-256 karşılaştırması var; Fuji kontrat manifesti ve ABI gelmeden zincir doğrulaması yapılmıyor. Avalanche puanı kazanıldığı söylenmez.

**Dosya hash'i neyi kanıtlar?** Dosyanın referans alınan baytlarla aynı olduğunu. Test hükmünün doğruluğunu veya adayın bütün koşullarda güvenli olduğunu tek başına kanıtlamaz. Referans hash de bağımsız bir zincir makbuzu değildir.

**Neden mevcut testlerden farklı?** Ürün hipotezi: kayıp yanıt gibi finansal araç senaryolarında adayın talebini bağımsız defter kaydı ve geçit kararıyla ilişkilendirip sürüme bağlı, incelenebilir rapor vermek. Rakiplerden üstünlük veya doğrulanmış müşteri iddiası yok.

**İş modeli ne?** İlk hipotez geliştirici ekiplerine sürüm karşılaştırma/CI raporu sunmak. İlk doğrulama kanalı ATK geliştiricileriyle tek hata kaydını birlikte incelemek. Görüşme, ödeme, OKX.AI kaydı veya müşteri doğrulaması henüz yok.

**Demo neden burada farklı bir backend başlatıcısı kullanıyor?** OneDrive runtime veri yazımında EPERM görüldü. Kaynak backend değiştirilmedi; mevcut dataDir seçeneğiyle test verisi geçici dizine yönlendirildi. Kalıcı yol sorunu A'ya açık not olarak iletildi.

## Cetvele göre sunum disiplini

Ürün/gerçek dünya değeri 25, agentic design 20, demo 20, teknik 15, Avalanche 10, OKX 10. Bunlar cetvel ağırlıkları, kazanılmış puan değil. Ürün değerini somut hata/kanıt akışıyla anlatın; eksik LLM ve Avalanche parçalarını mevcutmuş gibi göstermeyin.
