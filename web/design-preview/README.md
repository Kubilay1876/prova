# PROVA görsel düzenleme — 17 Ekim 2026

Uygulama değişikliği yalnız `web/src/styles.css` içindedir. JSX, metinler, API,
hüküm, kanıt, fixture ve dosya/zincir doğrulama mantığı değiştirilmedi.

## Ekran görüntüleri

Tam sayfa görüntüleridir; GitHub'da dosyayı açıp özgün boyutuyla inceleyin.

| Ekran | 1440 px | 1280 px | 390 px |
| --- | --- | --- | --- |
| Adayı bağla | [Görsel](connect-1440.jpg) | [Görsel](connect-1280.jpg) | [Görsel](connect-390.jpg) |
| Sınavı izle / kanıt | [Görsel](exam-1440.jpg) | [Görsel](exam-1280.jpg) | [Görsel](exam-390.jpg) |
| Karneyi incele | [Görsel](report-1440.jpg) | [Görsel](report-1280.jpg) | [Görsel](report-390.jpg) |
| Karneyi doğrula | [Görsel](verify-1440.jpg) | [Görsel](verify-1280.jpg) | [Görsel](verify-390.jpg) |

İstenen `run_mvcdy9q8nm83`, B bilgisayarının API'sinde 404 döndü. Görsellerde
bu nedenle mevcut `run_mvcd5803e6cs` kullanıldı: betik aday, sentetik piyasa,
sanal emir, T03 ihlali, beş desteklenmeyen test, PARTIAL ve LOCAL_ONLY.
Görseller gerçek Claude veya canlı zincir doğrulaması kanıtı değildir.
Bu çalışma sırasında ücretli model çağrısı veya zincire yazma yapılmadı.

Mevcut olay açıklama anahtarları Türkçedir (Aday talebi / Sanal defter / Geçit
kararı); actor/kind değerlerini çeviren bir eşleme bu dalda yoktur. Metinler
değiştirilmediği için ham CANDIDATE / GATE / EXCHANGE vb. değerler korunur.

## Kontrol

- `pnpm.cmd typecheck`, `pnpm.cmd test` (10 test), `pnpm.cmd build`: geçti.
- Mevcut tarayıcı testleri: genel akış 16, takip testleri 7, doğrulayıcı 5: geçti.
  Bu üç paket sentetik API/RPC veya açıkça etiketlenmiş UI Demo kullanır.
- Gerçek yerel API'deki mevcut kayıtla dört ekran, 12 genişlikte ölçüldü:
  320, 360, 390, 700, 701, 768, 960, 1024, 1200, 1280, 1440, 1920 px.
  48 ölçümde sayfa yatay taşması ve 14 px altı görünür metin bulunmadı.
- 1440 ve 1280 px'te sınavın üç sütunu, 390 px'te alt alta düzen korundu.
  Tablolar gerektiğinde kendi kutularında yatay kayar.
- Tarayıcıda görünen metinlerin hesaplanan renkleri ölçüldü: normal metin
  en az 4.5:1, büyük metin en az 3:1. Odak halkaları ve klavye ile kanıt
  açma mevcut tarayıcı testlerinde kontrol edildi.

| Kullanım | Ön / arka renk | Kontrast |
| --- | --- | --- |
| Ana düğme | `#FFFFFF` / `#C92F33` | 5.33:1 |
| Ana metin | `#121417` / `#FCFCFB` | 17.97:1 |
| İkincil metin | `#4A4F57` / `#FCFCFB` | 8.03:1 |
| Geçti | `#1B7548` / `#E7F4EC` | 5.03:1 |
| İhlal | `#B42318` / `#FDECEA` | 5.75:1 |
| Belirsiz | `#8A5A00` / `#FFF3D6` | 5.37:1 |
| Desteklenmiyor | `#4A4F57` / `#EEEFF1` | 7.17:1 |
| Koyu başlık | `#F2F2F0` / `#111214` | 16.72:1 |

Marka kırmızısı `#E84142` logo, menü çizgisi ve dekoratif vurgularda kalır;
durum rozetlerinde kullanılmaz. Renklerin tamamı `:root` değişkenlerindedir.
