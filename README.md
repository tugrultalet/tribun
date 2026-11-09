# Tribün

Sadece takip ettiğin takımların ve liglerin maçları: fikstür, canlı skor, kadro ve puan durumu.

- `server/` — API-Football anahtarını tutan, yanıtları sadeleştirip önbelleğe alan küçük Node sunucusu (bağımlılık yok).
- `app/` — Expo (React Native) mobil uygulaması. Önce iOS, aynı kodla Android.

Anahtar yalnızca sunucuda durur; uygulama API-Football'a doğrudan gitmez.

## Çalıştırma

Sunucu (Node 20.12+):

```bash
cd server
cp .env.example .env   # API_FOOTBALL_KEY değerini yaz
npm start
```

Uygulama:

```bash
cd app
npm install
EXPO_PUBLIC_API_URL=http://BILGISAYARIN-YEREL-IP:8787 npx expo start
```

Telefonda Expo Go ile QR kodu okut. Telefon ve bilgisayar aynı Wi-Fi'da olmalı. Tarayıcıda denemek için `npx expo start --web` (bu durumda adres `http://localhost:8787` olabilir).

## API planı

Sunucu planı `/status` ile okur ve kendini ayarlar:

| | Free (100 istek/gün) | Ücretli |
|---|---|---|
| Canlı skor yenileme | 10 dakika | 30 saniye |
| Tarihe göre maçlar | dün, bugün, yarın | −7 … +14 gün |
| Puan durumu, takım listesi | izin verilen son sezon (uyarıyla) | güncel sezon |
| Lig ve takım fikstürü | yalnızca üç günlük pencere | tam sezon |

`LIVE_TTL` (saniye) ile yenileme aralığı elle değiştirilebilir.

## Sunucu uçları

`/api/meta`, `/api/fixtures?date=YYYY-AA-GG`, `/api/match/:id`, `/api/standings/:lig`, `/api/league/:lig/fixtures`, `/api/league/:lig/teams`, `/api/team/:id`, `/api/team/:id/squad`

## Henüz yok

Gol bildirimi ve kilit ekranında canlı skor (iOS Live Activity). Sunucudan anlık bildirim, Apple geliştirici hesabı ve geliştirme derlemesi (EAS) gerektirir.
