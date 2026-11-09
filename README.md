# Tribün

Sadece takip ettiğin takımların ve liglerin maçları: fikstür, canlı skor, kadro ve puan durumu.

- `server/` — veri kaynağının (Highlightly) anahtarını tutan, yanıtları sadeleştirip önbelleğe alan küçük Node sunucusu (bağımlılık yok).
- `app/` — Expo (React Native) mobil uygulaması. Önce iOS, aynı kodla Android.

Anahtar yalnızca sunucuda durur; uygulama veri kaynağına doğrudan gitmez.

## Çalıştırma

Sunucu (Node 20.12+):

```bash
cd server
cp .env.example .env   # HIGHLIGHTLY_KEY değerini yaz
npm start
```

Uygulama:

```bash
cd app
npm install
EXPO_PUBLIC_API_URL=http://BILGISAYARIN-YEREL-IP:8787 npx expo start
```

Telefonda Expo Go ile QR kodu okut. Telefon ve bilgisayar aynı Wi-Fi'da olmalı. Tarayıcıda denemek için `npx expo start --web` (bu durumda adres `http://localhost:8787` olabilir).

## Veri kaynağı

Veriler [Highlightly Football API](https://highlightly.net/documentation/football/)'den gelir. Ücretsiz plan günde 100 istek verir; sunucu bunu korumak için:

- Her ligin sezon fikstürünü bir kez çekip (lig başına 2–4 istek) günde bir yeniler; günlük maç listeleri buradan süzülür.
- Yalnızca başlamış ama sonuçlanmamış maçı olan lig ve gün için taze veri ister (ücretsiz planda 3 dakikada bir, ücretli planda dakikada bir (Highlightly maç verisini dakikada bir yeniler); `LIVE_TTL` ile değiştirilebilir).
- "Takiplerim" görünümünde yalnızca takip edilen ligler ve takımlar için istek yapar.

Kaynağın kısıtları: lige göre takım listesi ve takım kadrosu ucu yok. Takım listesi puan durumundan, kadro takımın son maçının ilk 11'i ve yedeklerinden türetilir. Puan durumunda form ve Avrupa/küme düşme bölgeleri gelmez.

## Gruplar, tahminler ve sohbet

Arkadaş grupları Supabase'de durur (proje: `tribun`, şema: `supabase/migrations/`). Uygulama veritabanına doğrudan, `app/src/config.ts` içindeki "publishable" anahtarla bağlanır; bu anahtar uygulamada durmak üzere tasarlanmıştır.

- Tablolarda RLS açıktır ve hiçbir politika yoktur; her işlem `SECURITY DEFINER` fonksiyonlarından geçer (`register`, `create_group`, `join_group`, `set_prediction`, `send_message` …).
- Kimlik, cihazda üretilen rastgele bir sırdır; veritabanında yalnızca SHA-256 özeti tutulur. Giriş, şifre ya da e-posta yoktur. Uygulama silinirse kimlik kaybolur.
- Tahmin, veritabanı saatine göre maç başlamadan önce girildiyse geçerlidir. Bu kontrolü ve puanlamayı (tam skor 3, doğru sonuç 1) uygulama, maç verisine bakarak yapar; veritabanı maç saatlerini bilmez.
- Sohbet anlık bağlantı kullanmaz; açıkken 4 saniyede bir yeni mesaj sorar.

Bilinen sınırlar: başlamamış maçta başkalarının tahminini gizleyen şey arayüzdür (API'yi doğrudan çağıran bir grup üyesi görebilir); bildirim yoktur; herkese açık yorum yoktur.

## Yayıncı bilgisi

Maç kartında ve maç sayfasında görünen "Yayın: …" bilgisi `server/index.js` içindeki lig tablosundaki `tv` alanından gelir. Türkiye'de yayın hakları lig bazında satıldığı için elle tutulur ve her sezon başında güncellenmelidir. Maç bazında tam kanal bilgisi yoktur.

## Sunucu uçları

`/api/meta`, `/api/mine?teams=..` (ana ekran: takip edilen takımların maçları), `/api/fixtures?date=YYYY-AA-GG[&leagues=..&teams=..]`, `/api/match/:id`, `/api/match/:id/lineups`, `/api/standings/:lig`, `/api/league/:lig/fixtures`, `/api/league/:lig/teams`, `/api/team/:id`, `/api/team/:id/squad`

## Henüz yok

Gol bildirimi ve kilit ekranında canlı skor (iOS Live Activity). Sunucudan anlık bildirim, Apple geliştirici hesabı ve geliştirme derlemesi (EAS) gerektirir.
