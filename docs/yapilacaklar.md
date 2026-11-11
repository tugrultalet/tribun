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
