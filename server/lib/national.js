// Milli takım adlarını Türkçeleştirir. Kaynaklar İngilizce ("Turkey", "Germany") verir.
const MANUAL = {
  turkey: 'Türkiye', turkiye: 'Türkiye', england: 'İngiltere', scotland: 'İskoçya', wales: 'Galler', 'northern ireland': 'Kuzey İrlanda',
  'republic of ireland': 'İrlanda', ireland: 'İrlanda', usa: 'ABD', 'united states': 'ABD', 'south korea': 'Güney Kore', 'korea republic': 'Güney Kore',
  'north korea': 'Kuzey Kore', 'czech republic': 'Çekya', czechia: 'Çekya', 'bosnia and herzegovina': 'Bosna-Hersek', 'bosnia': 'Bosna-Hersek',
  'ivory coast': 'Fildişi Sahili', "cote d'ivoire": 'Fildişi Sahili', 'dr congo': 'Kongo DC', 'congo dr': 'Kongo DC', 'north macedonia': 'Kuzey Makedonya',
  'cape verde': 'Yeşil Burun Adaları', 'united arab emirates': 'BAE', 'saudi arabia': 'Suudi Arabistan', 'new zealand': 'Yeni Zelanda',
  'south africa': 'Güney Afrika', 'costa rica': 'Kosta Rika', netherlands: 'Hollanda', 'faroe islands': 'Faroe Adaları', 'san marino': 'San Marino',
};

// ICU'nun bölge adlarından İngilizce → Türkçe eşleme (Almanya, İspanya, İtalya, Brezilya …).
const REVERSE = (() => {
  const map = new Map();
  try {
    const en = new Intl.DisplayNames(['en'], { type: 'region' });
    const tr = new Intl.DisplayNames(['tr'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const e = en.of(code), t = tr.of(code);
        if (e && t && e !== code && t !== code) map.set(e.toLowerCase(), t);
      }
    }
  } catch { /* ICU yoksa yalnızca elle girilenler kullanılır */ }
  return map;
})();

const clean = (name) => String(name || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
export function nationalName(english) {
  const key = clean(english).toLowerCase();
  return MANUAL[key] ?? REVERSE.get(key) ?? clean(english);
}

// Kadın, gençlik ve olimpiyat takımları listeden çıkarılır.
export const isSeniorMen = (name) => !/\bwomen\b|\bU-?\d{2}\b|\bW$|olympic/i.test(String(name || ''));
