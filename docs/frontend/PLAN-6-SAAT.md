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
- Aynı bilgisayarda iki ayrı Git işlemi yapılmaz. Ortak başlangıç A tarafından hazırlanır; ayrı checkout/branch düzenini A kurar. B bu teslimde Git başlatmadı veya kök ayarı değiştirmedi.
- Entegrasyonda aynı bilgisayarda `server` ve `web` çalışır. İki bilgisayarın localhost’u birbirine bağlanmaz.

## Model API bütçesi

100 USD kredinin tamamı takıma ait değil. Yaklaşık üçe bölünürse pay 33,33 USD olur; kullanıcı daha az da olabileceğini bildirdi. Bu nedenle 33,33 USD harcanabilir bakiye kabul edilmiyor. Çalışma hedefi toplam **20 USD**; A kullanılabilir takım payını teyit ettiğinde gerekirse aşağı çeker.

| Kullanım | Planlanan pay |
| --- | --- |
| Geliştirme ve ilk gerçek entegrasyon | 12 USD |
| Son demo/prova | 5 USD |
| Hata ve tekrar payı | 3 USD |
| Toplam çalışma hedefi | 20 USD |

Bu dağılım tahmindir, uygulanmış bir harcama limiti değildir. Sağlayıcı/model ve fiyatları bilinmediği için kaç çağrıya veya tokene yeteceği henüz hesaplanmadı. Arayüz geliştirmesi fixture ile devam eder. Gerçek model çağrılarını A yürütür; aynı fixture üzerinde gereksiz tam sınav tekrarları yerine önce tek T03 senaryosu doğrulanır. A backend’de çağrı/token sınırı, sınırlı retry ve harcama takibi hazırlamalı; ortak hesabın toplam bakiyesi takımın kendi kalan bütçesi sanılmamalı.

## Teslim önceliği

Çalışan ilk gerçek senaryo, altılı sentetik başarı ekranından değerlidir. Altı testin tamamı hazır olmadan ilk entegrasyon yapılır; karne eksik kapsamı gösterir. Fuji dosya kaydının bütünlüğünü kanıtlar; test hükmünün veya gerçek harcamanın doğruluğunu tek başına kanıtlamaz.

Güncel durum: A'nın 54ac467 backend'i bu checkout'ta gerçek ATK MCP ile doğrulandı. Yalnız T03 ve betik adaylar çalışıyor. B'nin gerçek API ekran akışı tamamlandı. OneDrive veri yazımı sorunu için geçici dataDir ile test yapıldı; ayrıntı STATUS.md ve contract-questions.md'de. 19.00 teslimine kadar öncelik birleştirme ve bu dürüst kapsamla demo provası.
