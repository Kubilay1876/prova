# B — Fuji dosya doğrulayıcı entegrasyonu

Backend manifest referansı: 31804ce. Ağ: Avalanche Fuji (43113). Kontrat: `0xda0a8d5e87f90da24dec7338aa4bcc6af43cea2b`. Yükleme bloğu: 59596297. ABI ve RPC, A'nın public docs/backend/fuji-manifest.json dosyasından alındı. B, A kaynaklarını düzenlemedi.

## İşleyiş

1. /verify backend olmadan açılır. Kullanıcı dosyayı seçer; en fazla 15 MB. Tam indirilen baytlar SHA-256 ile hash'lenir, parse edilip yeniden yazılmaz.
2. İsteğe bağlı referans hash ile yerel karşılaştırma ayrı görünür. Alan boşken de zincir kontrolü yapılır.
3. Sabit RPC'nin chainId'si ve kontratın recorder() adresi kontrol edilir. recordedAt(digest) 0 ise kayıt bulunamadı; sıfır değilse yalnız o blok sorgulanır.
4. Sabit kontrattaki ReportRecorded olayı; dosya hash'i, aday sürümü, suiteHash ve izinli kayıtçıyla eşleşmelidir. İşlem başarılı, aynı kontrata, aynı blok/hash'e ait olmalı ve olay işlem makbuzunun logs listesinde bulunmalıdır.
5. Yeni blok onayı bekleyen kayıt PENDING; yanlış kimlik/makbuz MISMATCH; ulaşım veya hız sınırı ERROR. Bunlar VERIFIED değildir. Dosya içindeki hedef/ABI/txHash ağ hedefi seçmez.

Bu, özel PROVA kayıt sözleşmesidir; ERC-8004 Validation Registry olduğu söylenmez. Kayıt dosyanın sürüm/paket kimliğini bağlar; testin doğru yürütüldüğünü veya adayın genel güvenliğini kanıtlamaz.

## Kontroller ve sınırlar

- TypeScript ve 8 birim testi başarılı. Olumlu tam dosya/olay/makbuz eşleşmesi, satır sonu değişimi, yanlış kayıtçı/sürüm/paket/kontrat/blok, başarısız veya olaysız makbuz, bekleme ve RPC hatası sentetik JSON-RPC ile test edildi.
- 4 yeni tarayıcı senaryosu: dosya yükleme ve pozitif eşleşme; değişen bayt; yanlış kimlik/bekleme/429; 390 px taşma kontrolü. Bu test ekran görüntüleri açıkça UI DEMO/RPC test yanıtları olarak işaretli.
- Gerçek public Fuji denemesi ilk eth_chainId çağrısında HTTP 429 (Cloudflare hız sınırı) döndürdü. Bu bilgisayarda canlı zincir doğrulamasının geçtiği iddia edilmiyor. A'nın zincire kaydettiği özgün rapor baytları da bu checkout'ta yok.
- A'nın STATUS.md kaydı deployment ve betik T03 raporunun zincir kaydını bildirmiştir. Önceki LLM raporları zincir kaydı öncesinde üretildiğinden yerel kalmıştır.
- Yeni ücretli model çağrısı, zincir yazma, cüzdan erişimi veya özel anahtar kullanımı yok.

## Yeniden deneme

Frontend bağımlılıkları kurulu web/ klasöründe:

```powershell
node --experimental-strip-types tests/fuji-read-smoke.mjs
```

Bu komut A'nın bildirdiği 59596316 bloğundaki gerçek kayıt olayını ve makbuzunu okur; özgün rapor dosyası yerine zincirdeki public özet/kimlik çiftini doğrular. Dosyanın kendisini doğrulamak için A'nın indirdiği aynı baytlı raporu /verify ekranında seçin. RPC erişimi gerekiyorsa A ile paylaşın; dosyadan veya hatadan alınmış rastgele endpoint'e otomatik geçiş yok.
