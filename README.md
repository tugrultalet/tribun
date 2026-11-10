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

### Numaralar kaynaktan bağımsızdır

Highlightly'nin lig, takım ve maç numaraları API-Football'unkilerin düz bir dönüşümüdür (`hl = af × 851 + 784`; 1.000'den fazla kayıtta doğrulandı). Sunucu dışarıya her zaman API-Football numaralarını ("ortak numara") verir (`server/lib/ids.js`). Bu yüzden kaynak değişince takip edilen takımlar, gruplar ve tahminler bozulmaz. Dönüşüme uymayan bir numara gelirse çakışmasın diye negatif numarayla işlenir.

Uygulamanın ilk sürümleri Highlightly numaralarını kaydetmişti; uygulama açılışta bunları bir kereliğine ortak numaraya çevirir; yalnızca formüle uyan numaralar çevrilir, zaten ortak olanlar olduğu gibi kalır (`app/src/store.tsx`).

### Kaynak değişimi (Highlightly → API-Football Pro)

Render'da `DATA_PROVIDER` tanımlı değilse sunucu açılışta planı kontrol eder: API-Football hesabı ücretliyse onu, değilse Highlightly'yi seçer. Pro'ya geçince yapılacak tek şey sunucuyu yeniden başlatmak (Render → Manual Deploy). Numaralar ortak olduğu için takipler, gruplar ve tahminler aynen kalır; önbellek kaynak başına ayrı klasörde tutulur, ilk dakikalarda veriler yeni kaynaktan yeniden dolar.

### Canlı yenileme ve istek bütçesi

- Sunucu 15 saniyede bir arka planda canlı ya da 5 dakika içinde başlayacak maç olup olmadığına bakar (`BACKGROUND_REFRESH=0` ile kapatılır). Böyle maç yoksa kaynağa istek gitmez. Uygulamalar kapalıyken de gol bildirimi bu sayede gider. Yalnızca son 24 saatte birinin baktığı takım, lig ve gün listeleri tazelenir.
- Uygulama yalnızca ekran açıkken yeniler. Maç ekranı canlıyken 15 sn, başlamasına 1 saatten az kala 1 dk, daha uzaksa 5 dk aralıkla sorar; bitmiş maçta hiç sormaz.
- Yanıtlar kısa süre önbelleklenebilir (`Cache-Control`): canlı uçlar 10 sn, fikstür/takım 30 sn, puan durumu ve kadro 5 dk.

API-Football Pro günde 7.500 istek verir. Canlı tazeleme tek istekte 20 maça kadar alır ve en çok 15 saniyede bir yapılır: maç olan bir günde 12 saat canlı pencere ≈ 2.900 istek (aynı anda 20'den fazla canlı maç varsa her 20 maç için bir istek daha). Kalan ~4.500 istek; günlük fikstür, puan durumu, takım ve maç detayı önbelleklerinin dolmasına yeter (bunlar saatler/günler boyunca önbellekte kalır). Sunucu kotanın son isteklerini saklı tutar ve kota bitince eldeki veriyi göstermeye devam eder.

## Takımlar ve turnuvalar

- **Kulüpler** liglerine göre listelenir. **Milli takımlar** ayrı sekmededir; adları Türkçeleştirilir (Türkiye başta), kadın ve gençlik takımları listelenmez.
- Bir takımın maçları, **katıldığı bütün yarışmalardan** gelir: lig, UEFA kupaları, ülke kupaları, milli takımlarda turnuvalar, elemeler ve hazırlıklar. Yarışma kataloğunda olmasa da maçın kendi yarışma adı ve logosu gösterilir. Kulüp hazırlık maçları gösterilmez.
- **Takip modeli (her şey takım üzerinden):** Kullanıcı bir **ana takım** (★) seçer; ayrıca milli takım ve sevdiği diğer takımları ekler. Her takım için hangi turnuvaların gösterileceği seçilir (`app/src/follow.ts`, testli): ana takım ve milli takımda hepsi açık; diğer takımlarda yalnızca Avrupa kupaları (Avrupa'da oynamayan takımın tüm maçları). Lig takibi yoktur. Turnuva süzmesi istemcide yapılır; sunucu takımın tüm maçlarını verir, böylece takım fikstürü herkes için tek ortak önbellekten gelir.
- **Ana ekranın tek kuralı:** "takımlarımın seçili turnuvalardaki maçları + gruplarımın tahmin maçları". Grup maçlarının üstünde etiket durur (`Hoppa · 3/5 girdi · tahminin 2–1`, `Hoppa · tahmin bekliyor`). **Tüm ligler** filtresi o günün bütün maçlarını gösterir.
- **Takımlarım:** ana takım ★ en üstte, her takımın altında turnuva çipleri (tek dokunuşla aç/kapa), sola kaydırınca takipten çıkar, başka takımın ★'ı onu ana takım yapar. **Keşfet** sekmesi ligleri, puan durumunu ve fikstürü takip zorunluluğu olmadan gösterir; turnuva sayfasındaki gelişmiş "Tüm maçlarını takip et" seçeneği o turnuvanın yakın maçlarını (takımlardan bağımsız) ana ekrana getirir.
- **Tahmin oyunu:** Her maça (takip edilmese de) Maç sayfasından skor tahmini girilir; maç başına kullanıcı başına **tek tahmin** (`picks` tablosu), tüm gruplar aynı tahmini kullanır. Tam skor 3, doğru sonuç 1 puan; maç başlamadan girilmemiş tahmin sayılmaz, başlayan maçta kilitlenir, başlamamış maçta başkalarının skoru sunucudan çıkmaz. Kişisel puan (toplam, tam skor, isabet) Gruplar sekmesinin üstündedir; biten maçların sonuçları `/api/results` ile alınır (sunucuda önbellekli, tek çağrıda en çok 8 yeni maç sorulur). Mantık: `app/src/game/stats.ts` ve `app/src/groups/standings.ts` (testli).
- **Grup kapsamı** kişisel takipten bağımsızdır: grup kurarken "Bu grupta hangi maçları tahmin edeceksiniz?" sorulur. Bir takımın maçları (kapsamsız mevcut gruplar böyledir) ya da en çok 5 turnuva (`groups.scope = {"type":"leagues","ids":[..]}`). Kapsam mantığı `app/src/groups/scopeRules.ts` (testli).
- Ana ekran sunucuda `/api/mine?teams=..` (en çok 30 takım). Katalogdaki turnuvalar (`server/lib/common.js`) Turnuvalar sekmesinde puan durumu ve fikstürle görülebilir.

### Firebase (bildirim, analiz, çökme raporu, Remote Config) ve geliştirme derlemesi

- **Uygulama:** `@react-native-firebase` (app, analytics, crashlytics, remote-config, messaging). Firebase'e tek erişim `app/src/fb.native.ts`; web önizlemesinde ve Expo Go'da (`app/src/fb.ts`) her şey sessizce kapalıdır, uygulama çökmez. Yapılandırma: `app/GoogleService-Info.plist`, `app/firebase.json` (reklam kimliği toplanmaz), `app.json` (dinamik framework, bildirim izni).
- **Analiz:** `telemetry.ts` olayları ve ekran görüntülemeleri Firebase Analytics'e, hatalar (çökme ekranı dahil) Crashlytics'e gider.
- **Remote Config** (Firebase konsolu → Remote Config): `min_version` (altındaki sürümler güncelleme ekranı görür), `store_url`, `announcement` ve `maintenance` (ana ekranda bant), `feature_group_chat` (`false` ise grup sohbeti gizlenir).
- **Bildirimler:** Kullanıcı Ayarlar'dan ya da ana ekrandaki karttan açar; telefon ana takımın konusuna (`team_<numara>`) abone olur. Sunucu canlı yenilemede maç başlangıcı, gol ve maç sonunu yakalayıp konuya gönderir (aynı olay bir kez). Bildirime dokununca maç açılır. Sunucuda Firebase hizmet hesabı gerekir: `FIREBASE_SERVICE_ACCOUNT` (base64 JSON) ya da yerelde `FIREBASE_SERVICE_ACCOUNT_FILE`; dosya asla repoya girmez.
- **Geliştirme derlemesi:** Firebase yerel kod istediği için Expo Go yerine bir kez kurulan geliştirme derlemesi kullanılır (`app/eas.json`):
  1. `npm install -g eas-cli` ve `eas login`
  2. `cd app && eas device:create` (telefonu Apple'a tanıtır)
  3. `eas build --profile development --platform ios` (bulutta derlenir; bitince QR ile telefona kurulur)
  4. Sonrası eskisi gibi: `EXPO_PUBLIC_API_URL=http://<mac-ip>:8787 npx expo start --dev-client`

### Mağaza şartları ve destek

- **Hesabımı sil** (Ayarlar): takma ad, üyelikler, mesajlar ve tahminler kalıcı silinir; kurulan grup başka üye varsa en eski üyeye devredilir (`delete_account`). App Store, hesap açılan uygulamalarda bunu zorunlu tutar.
- **Gizlilik ve KVKK**: sunucuda `/gizlilik` (App Store'a gizlilik politikası adresi olarak bu verilir; `CONTACT_EMAIL` ile iletişim e-postası eklenebilir). Metin yayından önce hukuki olarak gözden geçirilmeli.
- **Geri bildirim**: uygulama içinden, e-posta gerekmeden (`send_feedback`, saatte 5); Supabase'de `feedback` tablosunda okunur.
- **Çökme ekranı** (ErrorBoundary) ve **analiz olayları** (`app/src/telemetry.ts`: ilk açılış, tahmin, grup, davet, ekran görüntüleme). Şimdilik yalnızca geliştirmede konsola yazar; Firebase eklenince bu dosya doldurulacak.
- **Değerlendirme isteği**: 5. tahminden sonra bir kez (`expo-store-review`).

### Güvenlik ve kota koruması

- **Sunucu:** IP başına istek sınırı (dakikada 120). Uygulamaya numaralar yalnızca sunucunun kendi yanıtlarından ulaştığı için bilinmeyen takım/maç numarası için kaynağa gitmek bütçeye bağlıdır (IP başına saatte 20, genel 60); kaynakta olmayan maç 6 saat tekrar sorulmaz; tarih bugünden en çok ±30 gün; günlük kotanın son 10 isteği canlı skor yenilemesine ayrılır (diğer durumlarda kayıtlı veri gösterilir). Bellek önbelleği sınırlı, diskte 45 günden eski dosyalar silinir. Yanıtlar gzip'lenir; beklenmeyen hataların ayrıntısı istemciye gönderilmez; davet sayfası CSP ve çerçeveleme engeliyle sunulur. Ayarlar: `server/.env.example`.
- **Veritabanı:** tablolara doğrudan erişim kapalı, her işlem cihaz sırrını doğrulayan fonksiyonlardan geçer. Hız sınırları: takma ad (IP başına saatte 10), grup kurma (IP başına saatte 10), kodla katılma (profil başına 10 dakikada 10, IP başına 30; yanlış kodlar da sayılır), mesaj (dakikada 20), tahmin (dakikada 120).
- **Uygulama:** cihaz sırrı iOS Keychain'de (`expo-secure-store`), AsyncStorage'da değil. Yenilemeler uygulama arka plandayken durur; ana ekran canlı ya da yakın maç yoksa 5 dakikada bir yenilenir; sohbet sessizken 12 sn'de bir sorulur.

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

### Puanlama (veritabanında)

Sunucu dakikada bir, tahmin girilmiş ve henüz puanlanmamış maçların saatini, durumunu ve skorunu Supabase'e yazar (`server_sync_matches`, yalnızca service role). Maç bitince puanlar veritabanında hesaplanıp kalıcı deftere (`points`) yazılır; skor sonradan düzeltilirse yeniden puanlanır. Tahmin kilidi de veritabanı saatiyle: maçın saati sunucudan geldiyse o geçerlidir.

- Tam skor 3, doğru sonuç 1.
- **Sürpriz bonusu +2:** doğru 1/X/2'yi topluluğun %25'inden azı seçtiyse (başlama anındaki tahminlerle).
- **Joker:** haftada (Pzt–Paz, Türkiye saati) bir maç; puan ×2 (bonus dahil), maç başlayınca kilitlenir.
- **Seri rozetleri:** üst üste 3/5/10 doğru sonuç (puan vermez).
- **Topluluk yüzdesi:** tahmin girene ya da maç başlayana kadar gizli; Tribün geneli en az 20 tahminle gösterilir.

Render'da `SUPABASE_SERVICE_ROLE_KEY` tanımlı olmalı (açılışta "Puanlama: açık" yazar). Anahtar repoya girmez.

### Kilit ekranı canlı skor (Live Activity) ve widget

- **Widget hedefi** `app/targets/widgets` (`com.sportvisor.tribun.widgets`, `@bacons/apple-targets`):
  - Ana ekran widget'ı: ana takımın sıradaki/canlı maçı ve "Kanka grubunda 2." bilgisi.
  - Maç Live Activity'si: kilit ekranı ve Dynamic Island.
  - Uygulama widget verisini App Group'a (`group.com.sportvisor.tribun`) yazıyor.
- **Uygulama:**
  - Live Activity'yi yerel modül `app/modules/tribun-live` başlatıyor (iOS 18+).
  - Maç ekranında "Kilit ekranında takip et" düğmesi var.
  - Ayarlar'daki anahtar açıksa ana takımın maçı başlarken Live Activity kendiliğinden açılıyor.
- **Sunucu:**
  - Maç başına bir APNs **yayın kanalı** açıyor (`/api/live/:id/channel`); skor ya da durum değişince kanala güncelleme gidiyor (gol: hemen, dakika: en çok dakikada bir).
  - Maç bitince aktivite 1 saat sonra kapanıyor, kanal 2 saat sonra siliniyor.
  - Kanal numaraları Supabase'de (`live_channels`).

Render ortam değişkenleri (anahtar repoya girmez):

| Değişken | Değer |
|---|---|
| `APNS_KEY` | `.p8` dosyasının base64 hali (ya da yerelde `APNS_KEY_FILE=~/.tribun/AuthKey_LRY59WK5A8.p8`) |
| `APNS_KEY_ID` | `LRY59WK5A8` |
| `APNS_TEAM_ID` | `M93BM8ZSQH` |
| `APNS_ENV` | `development` (geliştirme derlemesi) · `production` (TestFlight / App Store) |

## Yayıncı bilgisi

Maç kartında ve maç sayfasında görünen "Yayın: …" bilgisi `server/index.js` içindeki lig tablosundaki `tv` alanından gelir. Türkiye'de yayın hakları lig bazında satıldığı için elle tutulur ve her sezon başında güncellenmelidir. Maç bazında tam kanal bilgisi yoktur.

## Sunucu uçları

Ana sayfa (`/`) tanıtım sayfasıdır: `server/public/index.html`. `APP_STORE_URL` tanımlıysa indirme düğmeleri o adrese gider. Sunucu durumu: `/api/health`.

`/api/meta`, `/api/mine?teams=..` (ana ekran: takımların tüm maçları; turnuva süzmesi istemcide), `/api/national` (milli takımlar), `/api/fixtures?date=YYYY-AA-GG[&leagues=..&teams=..]`, `/api/match/:id`, `/api/match/:id/lineups`, `/api/standings/:lig`, `/api/league/:lig/fixtures`, `/api/league/:lig/teams`, `/api/team/:id`, `/api/team/:id/squad`

## Henüz yok

Gol bildirimi ve kilit ekranında canlı skor (iOS Live Activity). Sunucudan anlık bildirim, Apple geliştirici hesabı ve geliştirme derlemesi (EAS) gerektirir.
