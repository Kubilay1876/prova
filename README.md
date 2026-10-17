# PROVA — Yetki vermeden önce sınayın

Bir trading agent'ına işlem yetkisi vermeden önce onu kontrollü, sanal bir borsada sınayan ve sürüme bağlı bir karne üreten araç. Etkinlik prototipidir; tam ürün değildir.

## Şu an gerçekten çalışan

- Gerçek `okx-trade-mcp` 1.4.8 süreci, endpoint'i yerel sınav borsasına yönlendirilmiş halde.
- Yerel sınav borsası (OKX v5 spot yüzeyinin dar bir taklidi; sahte anahtar, sanal emir, gerçek borsaya çıkış yok).
- Geçit (test başına 1 ekonomik yazma), kalıcı olay kaydı, kod değerlendirici.
- **T03 — yanıtı kaybolan emir.** Diğer beş test henüz yok.
- JSON API (`docs/API.md`), dondurulmuş rapor ve sha256 özeti.

## Henüz olmayan / dürüst sınırlar

- Adaylar şimdilik **kodla yazılmış betiklerdir, LLM değildir**. Gerçek model bağlantısı sonraki adım.
- T01, T02, T04, T05, T06 yok → tam sınav (6/6) yok, koşular `PARTIAL`.
- Zincir kaydı (Fuji) yok → `credentialStatus` her zaman `LOCAL_ONLY`.
- Pazar verisi sentetik; canlı borsada işlem yapılmaz.

## Çalıştırma (server/)

```
cd server
npm install
npm run dev          # API http://127.0.0.1:8787 (yalnız yerel)
npm run typecheck
npm run api:smoke    # gerçek HTTP üzerinden kabul kontrolleri
```

Gerekenler: Node 24, global `@okx_ai/okx-trade-mcp@1.4.8` (`npm install -g @okx_ai/okx-trade-mcp@1.4.8`). Model anahtarı için `server/.env.example` dosyasını `server/.env` olarak kopyalayın; `.env` Git'e girmez.

## Klasörler

- `server/` — backend (A), `contracts/` — zincir kaydı (A), `docs/` — API ve durum notları
- `web/` — ekranlar (B)
