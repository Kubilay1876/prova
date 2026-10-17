# A'ya entegrasyon notları

Backend referansı 54ac467, API v1 Uygulama notları okundu. A dosyaları değiştirilmedi.

## Açık — B-01: OneDrive persist rename EPERM

Bu checkout'ta standart server/npm run dev açılıyor ve atkExam VERIFIED oluyor. İlk POST /api/runs sonrasında persist, `.run.json.tmp` dosyasını `.run.json` üzerine yeniden adlandırırken EPERM veriyor. Örnek yerel koşu: run_mvc83o18ap9x. Sonuç ERROR/INCONCLUSIVE, bütün bekleyen testler ERROR. Aynı backend'in api:smoke paketi OS temp dataDir ile geçiyor.

B geçici test başlatıcısı web/tests/serve-backend.ts, mevcut startApp API'sine yalnız dataDir=mkdtemp(tmpdir) vererek gerçek UI entegrasyonunu tamamladı. Yeni endpoint veya backend yazılmadı. A, kalıcı veri yolunu OneDrive dışında yapılandırmayı veya Windows atomik yazma davranışını değerlendirebilir. B bunun için server/ kaynağını değiştirmedi.

## Açık — B-02: Altyapı hatasında yerel yol görünmesi

Yukarıdaki hata RUN_STATUS summary ve rapor limitations içinde tam yerel dosya yolunu gösterdi. Kullanıcıya güvenli hata metni dönme hedefi açısından A event/report hata sanitizasyonunu da değerlendirmeli. B olay kanıtını yeniden yazıp gizlemedi; React metin olarak gösteriyor.

## Açık — B-03: Fuji manifesti

Şu an credentialStatus LOCAL_ONLY ve receipt null. chain-manifest.ts null tutuldu. Salt okuma zincir adaptörünü etkinleştirmek için sabit chainId=43113, contractAddress, recorderAddress, deploymentBlock, izinli HTTPS rpcUrl, abiVersion, tam ABI ve eventName gerekli. Manifest gelmeden zincir doğrulanmış sonucu yok.

## Kapanan sorular

- GET /api/runs tam run nesneleri döndürüyor: desteklendi.
- Scripted adaylar llm NOT_CONFIGURED iken çalışıyor: frontend LLM engeli kaldırıldı; atkExam hazırlığı kullanılıyor.
- Rapor envelope'u candidate.versionHash ve evidence.events: gerçek indirme ile doğrulandı.
- reportHash.value dondurulmuş ham baytların SHA-256'sı: gerçek dosya ile eşleşti. Rapora kendi hash'i eklenmedi.
- T03 PASS, diğerleri UNSUPPORTED iken PARTIAL/INCONCLUSIVE: gerçek arayüz akışında doğrulandı.
- docs/backend/STATUS.md sonundaki eski “endpoint'ler henüz yok” cümlesi önceki bölümlerle çelişiyor; çalışan HTTP API bu oturumda doğrulandı. A belgeyi güncelleyebilir; B değiştirmedi.
