# Tribün

Sadece takip ettiğin takımların ve liglerin maçları: fikstür, canlı skor, kadro ve puan durumu.

- `server/` — veri kaynağının (API-Football ya da Highlightly) anahtarını tutan, yanıtları sadeleştirip önbelleğe alan küçük Node sunucusu (bağımlılık yok).
- `app/` — Expo (React Native) mobil uygulaması. Önce iOS, aynı kodla Android.

Anahtar yalnızca sunucuda durur; uygulama veri kaynağına doğrudan gitmez.

## Çalıştırma

Sunucu (Node 20.12+):

```bash
cd server
cp .env.example .env   # anahtarları yaz (aşağıya bak)
npm start
```

Uygulama:

```bash
cd app
npm install
EXPO_PUBLIC_API_URL=http://BILGISAYARIN-YEREL-IP:8787 npx expo start
```

Telefonda Expo Go ile QR kodu okut. Telefon ve bilgisayar aynı Wi-Fi'da olmalı. Tarayıcıda denemek için `npx expo start --web` (bu durumda adres `http://localhost:8787` olabilir).

## Veri kaynakları

Sunucu iki kaynaktan birini kullanır ve açılışta kendisi seçer:

1. `API_FOOTBALL_KEY` tanımlıysa ve hesap **ücretli plandaysa** [API-Football](https://www.api-football.com/documentation-v3). Ücretsiz planda güncel sezon kapalı olduğundan ücretsiz hesapta bu kaynak seçilmez.
2. Aksi halde [Highlightly](https://highlightly.net/documentation/football/) (`HIGHLIGHTLY_KEY`).

`DATA_PROVIDER=highlightly` ile API-Football anahtarı olsa bile Highlightly zorlanabilir. Seçilen kaynak ve plan açılışta yazdırılır ve `/api/meta` içinde `provider` olarak gelir.

| | API-Football (ücretli) | Highlightly |
|---|---|---|
| Canlı veri yenileme | 15 saniye | dakikada bir (ücretsiz planda sunucu 3 dakikada bir sorar) |
| Canlı maçların güncellenmesi | tek istekte 20 maça kadar, tüm ligler birlikte | lig ve gün başına ayrı istek |
| Maç detayı | olaylar, ilk 11, istatistik tek istekte | ilk 11 ayrı istek |
| Puan durumu | form ve Avrupa/küme düşme bölgeleri var | yok |
| Kadro | tam kadro, yaş ve forma numarası | takımın son maçının ilk 11'i ve yedekleri |
| Takım rengi (ilk 11 sahası) | var | yok |

### API-Football'u güvenli kullanma

API-Football dakikalık istek limitini aşan hesapları askıya alabilir (ücretsiz plan: dakikada 10). Sunucu bunu önlemek için:

- Tüm istekleri tek tek gönderir ve her dakikada limitin iki altında (ör. 10 için 8) kalır; limiti yanıt başlığından öğrenir.
- Hesabın askıya alındığı bildirilirse bir saat boyunca hiç istek göndermez ve Highlightly'ye geçer.
- Günlük kota bitmeden son iki istekte durur.

Anahtarı yalnızca kendi bilgisayarındaki `server/.env` dosyasına yaz. API-Football, bulut sunucuların paylaşımlı IP adreslerinden gelen istekleri engelleyebildiği için anahtarı bulut ya da CI ortamlarında kullanma. Sabit IP'li bir sunucuya taşırken de aynı kural geçerlidir.

### Kaynak değişince

Takım, lig ve maç numaraları kaynağa göre farklıdır. Sunucu başka bir kaynağa geçerse uygulama bunu fark eder ve takip edilen takımları sıfırlayıp ilk açılış ekranını yeniden gösterir. Grupların takım ve maç bilgisi eski kaynağın numaralarıyla kayıtlı kalır, bu yüzden kaynak değişince mevcut gruplar yeniden kurulmalıdır.

### Highlightly ile istek tasarrufu

Ücretsiz plan günde 100 istek verir; sunucu bunu korumak için her ligin sezon fikstürünü bir kez çekip (lig başına 2–4 istek) günde bir yeniler, günlük maç listelerini buradan süzer ve yalnızca başlamış ama sonuçlanmamış maçı olan ligleri tazeler (ücretsiz planda 3 dakikada bir, ücretli planda dakikada bir). `LIVE_TTL` (saniye) ile aralık elle değiştirilebilir.

### Testler

```bash
cd server && npm test
```

İki bağdaştırıcının çevirilerini gerçek API yanıtlarından alınmış küçük örneklerle ve istek sınırlayıcıyı sınar. Hiçbir gerçek API'ye istek göndermez.

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
