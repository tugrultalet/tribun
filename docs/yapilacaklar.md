# Yapılacaklar

Yayına kadar bekleyen işler. Bitenler PR'larıyla birlikte silinir.

## Yayın öncesi (zorunlu)
- **Yükleme sonrası bağlantı (Branch ya da benzeri):** Davet bağlantılarına (`/a/KOD`, `/t/KOD`, `/j/KOD`) dokunup App Store'dan
  indiren kişi, uygulamayı ilk açtığında bağlantıyı ve kodu kendiliğinden bulsun. Şu an pano (`TRIBUN-A-KOD`, `TRIBUN-KOD`),
  aynı internet bağlantısından eşleştirme ve elle "Davet kodu gir" ile kapatılıyor; Branch kesin çözüm. Anahtarlar yalnızca
  sunucu/derleme ortamında tutulur, repoya girmez.
- **Mesajlaşmada şikayet et / engelle:** App Store kuralı (kullanıcı içeriği olan her yer: maç odaları, açık lig duyuruları).
- **Apple ile girişte hesap silinince token iptali:** Apple, "Sign in with Apple" kullanan hesap silinince REST API ile iznin
  geri alınmasını istiyor.
- **Yeni derleme (EAS):** Live Activity çoklu maç ve logolar, `/giris` ve `/a/*` Universal Link'leri (AASA), 6 kutulu kod alanı vb.

## Sonra
- Google ile giriş (iOS istemci numarası gerekiyor).
- Arkadaş profilinde "ortak maçlarda sen 7 – 4 Ahmet" karşılaştırması.
- Widget seti.
- Deneme verisini silme: `supabase/seed/demo_cleanup.sql`.

## Kullanıcı notları (12 Kasım, sonra ele alınacak)
- **Oranlar:** Bahis oynatmıyoruz ama kimin kazanma ihtimalinin yüksek olduğunu çok ince, küçük, göze sokmadan göstermek faydalı. Apple açısından sorun olmayacak şekilde (bahis sitesine bağlantı yok, "bahis" kelimesi yerine "ihtimal").
- **Live Activity 8 saat sınırı:** Sınır etkinlik başına mı, kişi/uygulama başına mı netleştirilecek. Plan: bildirimleri ve otomatik açılmayı tek ya da iki takımın maçıyla sınırlamak (aynı anda 3 maç olmaz).
- **Bildirimler:** incelikli şekilde yeniden düzenlenecek (takım başına seçenekler, çift bildirim yok).
- **Widget'ta takım logoları çıkmıyor:** düzeltilecek (kullanıcı ekran görüntüsü atabilir).
- **Widget setleri eksik:** küçük ve ince şerit var; geniş (uzun kalın şerit) widget yok, eklenecek.
- **Tahmin paylaşım kartı:** tahmin küçük gösterilsin; asıl mesaj anlaşılır dille güçlü yanımız olan reklamsız maç takibi.
- **Web bacağı:** paylaşım bağlantısından uygulamayı indirmeden web'de tahmin + "kilit ekranında reklamsız takip et" tanıtımı.
- **App Store öne çıkarılma başvurusu:** App Store Connect'teki öne çıkarma formu; yayından 2–3 hafta önce. Live Activity ve reklamsızlık vurgulanacak.
- **ASO:** başlık ve alt başlıkta "reklamsız canlı skor", "kilit ekranında canlı maç", "Süper Lig".
