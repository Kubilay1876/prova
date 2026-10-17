# Altı saatlik A/B uygulama planı

17 Ekim 2026. Teslim 19.00. Saatler başlangıç anına göre göreli; kalan süreye göre sıkıştırılır. B uygulaması bu çalışma klasöründe sıfırdan yazıldı; eski prototip kopyalanmadı.

| Süre | A: backend/agent | B: frontend | Birlikte kabul ölçütü |
| --- | --- | --- | --- |
| 0:00–0:45 | API v1, health, aday/test listeleri, tek kayıp-yanıt senaryosu | Bağımsız web iskeleti, şemaya uygun etiketli fixture | Aynı API sözleşmesi, ayrı dosya sahiplikleri |
| 0:45–1:30 | İlk gerçek LLM/ATK koşusu, olaylar, ilk rapor | Aday → akış → bulgu → kanıt → karne | Arayüzden gerçek koşu başlatıp aynı runId ile rapor indir |
| 1:30–2:30 | Kural ve kalan davranış testleri | Ağ/boş/kısmi/iptal halleri, geçmiş, karşılaştırma | Yenilemede aynı koşuyu aç; eksik test PASS sayılmaz |
| 2:30–3:30 | İlk gerçek rapor sonrası dar Fuji kayıt/okuma, manifest ve ABI | Dosya doğrulayıcıyı sabit manifestle bağla; ürün anlatımı | Tam rapor baytları izinli olaya eşleşsin; değişmiş dosya doğrulanmasın |
| 3:30–4:00 | Sonuç/kanıt/rapor tutarlılığı | Dar ekran ve gerçek API akış düzeltmeleri | Uçtan uca tek güvenilir demo |
| 4:00–6:00 | Entegrasyon hatası ve demo provası | Entegrasyon hatası ve demo provası | Yeni ekran/özellik eklemek yerine çalışan teslimi sabitle |

## Kesin iş sınırı

- A: `server/`, `contracts/`, `docs/API.md`, `docs/backend/`, kök README/Git dosyaları.
- B: `web/`, `docs/frontend/`; kendi package ve lock dosyası.
- Aynı bilgisayarda iki ayrı Git işlemi yapılmaz. Ortak başlangıç A tarafından hazırlanır; ayrı checkout/branch düzenini A kurar. B özel depoyu ayrı klasöre klonladı; b-web dalında GitHub noreply kimliğiyle commit/push yapıyor.
- Entegrasyonda aynı bilgisayarda `server` ve `web` çalışır. İki bilgisayarın localhost’u birbirine bağlanmaz.

## Model API bütçesi

100 USD kredinin tamamı takıma ait değil. Yaklaşık üçe bölünürse pay 33,33 USD olur; kullanıcı daha az da olabileceğini bildirdi. Bu nedenle 33,33 USD harcanabilir bakiye kabul edilmiyor. Çalışma hedefi toplam **20 USD**; A kullanılabilir takım payını teyit ettiğinde gerekirse aşağı çeker.

| Kullanım | Planlanan pay |
| --- | --- |
| Geliştirme ve ilk gerçek entegrasyon | 12 USD |
| Son demo/prova | 5 USD |
| Hata ve tekrar payı | 3 USD |
| Toplam çalışma hedefi | 20 USD |

Bu dağılım tahmindir, uygulanmış bir harcama limiti değildir. Güncel sağlayıcı Anthropic/Claude; bu eski planlama dağılımı backend harcama limitini yükseltme talimatı değildir. Arayüz geliştirmesi fixture ile devam eder. Gerçek model çağrılarını A yürütür; aynı fixture üzerinde gereksiz tam sınav tekrarları yerine önce tek T03 senaryosu doğrulanır. A güncel backend’de çağrı sınırı ve varsayılan 3 USD harcama sigortası ekledi; ortak hesabın toplam bakiyesi takımın kendi kalan bütçesi sanılmamalı.

## Teslim önceliği

Çalışan ilk gerçek senaryo, altılı sentetik başarı ekranından değerlidir. Altı testin tamamı hazır olmadan ilk entegrasyon yapılır; karne eksik kapsamı gösterir. Fuji dosya kaydının bütünlüğünü kanıtlar; test hükmünün veya gerçek harcamanın doğruluğunu tek başına kanıtlamaz.

Güncel durum: A'nın b2219dc backend'i altı zorunlu test, gerçek Claude ve sınavcı takiplerini içeriyor. B bu alanları ekrana bağladı; 7 yeni HTTP deneme kontrolü ve standart OneDrive yolunda 9 gerçek ATK/betik kontrolü geçti. Ücretli Claude çağrısı B tarafından tekrarlanmadı. Fuji manifesti 31804ce ile geldi ve doğrulayıcıya bağlandı. Gerçek RPC denemesinde 429 hız sınırı görüldü; sunum öncesi erişim ve kayıtlı rapor tekrar kontrol edilmeli. Öncelik b-web'i birleştirmek ve A'nın gerçek tamamlanmış koşusuyla demo provası.
