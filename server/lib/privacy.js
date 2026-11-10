// Gizlilik politikası ve KVKK aydınlatma metni (App Store "Privacy Policy URL" için de bu adres verilir: /gizlilik).
// Not: Bu metin uygulamanın gerçekte topladığı verilere göre hazırlandı; yayından önce hukuki olarak gözden geçirilmeli.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function privacyPage({ contact, updated = '2026-11-14' } = {}) {
  const reach = contact && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact)
    ? `<a href="mailto:${esc(contact)}">${esc(contact)}</a> adresinden ya da uygulamada Ayarlar → Geri bildirim gönder bölümünden`
    : 'uygulamada Ayarlar → Geri bildirim gönder bölümünden';
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gizlilik Politikası ve KVKK Aydınlatma Metni · Tribün</title><meta name="robots" content="index">
<style>:root{color-scheme:dark}body{margin:0;font:16px/1.6 -apple-system,system-ui,sans-serif;background:#0b1030;color:#e8eaf6}
main{max-width:720px;margin:0 auto;padding:28px 20px 60px}h1{font-size:26px;line-height:1.25}h2{font-size:18px;margin-top:28px}
a{color:#a6b4ff}li{margin:4px 0}.muted{color:#9aa0c3;font-size:14px}</style></head><body><main>
<h1>Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>
<p class="muted">Son güncelleme: ${esc(updated)}</p>
<p>Tribün; futbol maçlarını takip etmeni, arkadaşlarınla grup kurup skor tahmini yapmanı sağlayan bir uygulamadır. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hangi verileri neden işlediğimizi açıklar.</p>

<h2>Hangi verileri işliyoruz?</h2>
<ul>
<li><b>Takma ad:</b> Gruplarda ve tahminlerde görünen, kendi seçtiğin ad. Gerçek ad, e-posta ya da telefon numarası istemiyoruz.</li>
<li><b>Cihaz kimliği:</b> Uygulama ilk kez grup özelliğini kullandığında cihazında rastgele bir anahtar üretir ve telefonun güvenli deposunda (iOS Keychain) saklar. Sunucuda bu anahtarın yalnızca geri döndürülemeyen özeti (SHA-256) tutulur.</li>
<li><b>Grup verileri:</b> Kurduğun ve katıldığın gruplar, grup sohbetine yazdığın mesajlar, maçlara girdiğin skor tahminleri.</li>
<li><b>Takip tercihleri:</b> Takip ettiğin takımlar ve turnuvalar yalnızca telefonunda saklanır; sunucuya maç listesi istenirken takım numaraları gönderilir.</li>
<li><b>Geri bildirim:</b> Uygulama içinden gönderdiğin mesaj ile uygulama sürümü ve platform bilgisi.</li>
<li><b>Teknik kayıtlar:</b> Kötüye kullanımı önlemek için istek yapan IP adresi geçici olarak (en çok 1 gün) hız sınırı amacıyla tutulur; sunucu günlükleri hata ayıklama için kısa süre saklanır.</li>
<li><b>Analiz ve çökme raporları (eklendiğinde):</b> Uygulamanın nasıl kullanıldığına dair anonim olay verileri ve uygulama çöktüğünde teknik hata raporu. Reklam kimliği (IDFA) toplanmaz.</li>
</ul>

<h2>Neden işliyoruz? (amaç ve hukuki sebep)</h2>
<ul>
<li>Uygulamanın temel işlevlerini (gruplar, sohbet, tahmin ve puan) sunmak: sözleşmenin ifası (KVKK m.5/2-c).</li>
<li>Güvenlik, kötüye kullanımın ve spam'in önlenmesi: meşru menfaat (KVKK m.5/2-f).</li>
<li>Uygulamayı geliştirmek, hataları gidermek: meşru menfaat (KVKK m.5/2-f).</li>
</ul>

<h2>Verileri kimlerle paylaşıyoruz?</h2>
<p>Verilerini satmıyor, reklam amacıyla paylaşmıyoruz. Hizmeti sunmak için şu altyapı sağlayıcılarını kullanıyoruz; veriler yurt dışındaki sunucularında barındırılabilir:</p>
<ul>
<li><b>Supabase</b>: grup, sohbet ve tahmin veritabanı.</li>
<li><b>Render</b>: maç verisi sunucusu.</li>
<li><b>Highlightly / API-Football</b>: maç verisi kaynakları (bunlara kişisel verin gönderilmez).</li>
<li><b>Google Firebase</b> (eklendiğinde): bildirimler, analiz ve çökme raporları.</li>
</ul>

<h2>Ne kadar süre saklıyoruz?</h2>
<p>Hesabını silene kadar grup ve tahmin verilerin saklanır. IP kayıtları en çok 1 gün tutulur.</p>

<h2>Haklarınız ve hesabın silinmesi</h2>
<p>KVKK m.11 uyarınca verilerinin işlenip işlenmediğini öğrenme, düzeltilmesini ya da silinmesini isteme ve itiraz etme hakların vardır. <b>Hesabını ve tüm verilerini uygulamada Ayarlar → Hesabımı sil ile istediğin an silebilirsin</b>; silme işlemi geri alınamaz. Kurduğun bir grupta başka üyeler varsa grup en eski üyeye devredilir.</p>
<p>Taleplerin için ${reach} bize ulaşabilirsin.</p>

<h2>Çocuklar</h2>
<p>Uygulama 13 yaşından küçükler için tasarlanmamıştır.</p>
</main></body></html>`;
}
