// "Arkadaşına sor" bağlantısı (tribunapp.io/t/KOD): uygulaması olmayan kişi adını yazıp tahmin yapar ve (bağlantı bir
// gruba bağlıysa) gruba katılır. Uygulamayı indirirken geçiş kodu panoya kopyalanır; uygulama ilk açılışta onu okur.
// Sayfa Supabase'in herkese açık (publishable) anahtarıyla yalnızca izinli fonksiyonları çağırır.
const TOKEN = /^[A-HJ-NP-Z2-9]{8}$/;
export const validAskToken = (t) => TOKEN.test(String(t || '').toUpperCase());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TR = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function askText(info) {
  const match = `${info.home}–${info.away}`;
  return info.pick ? `${info.sender} ${match} için ${info.pick.h}–${info.pick.a} dedi. Sen ne diyorsun?` : `${info.sender} ${match} için tahmin yaptı. Sen ne diyorsun?`;
}

export function askPage({ token, info, supabaseUrl, supabaseKey, storeUrl }) {
  const t = esc(String(token).toUpperCase());
  if (!info) {
    return shell('Bağlantı bulunamadı', 'Bu tahmin isteği silinmiş ya da bağlantı hatalı.', '<h1>Bağlantı bulunamadı</h1><p>Bu tahmin isteği silinmiş ya da bağlantı hatalı.</p>', '');
  }
  const title = esc(askText(info));
  const kick = info.kickoff ? Date.parse(info.kickoff) : NaN;
  const closed = Number.isFinite(kick) && kick <= Date.now();
  const when = Number.isFinite(kick) ? esc(TR.format(kick)) : '';
  const store = storeUrl && /^https:\/\//.test(storeUrl) ? esc(storeUrl) : '';
  const group = info.group ? `<p class="small">Tahminin <b>${esc(info.group)}</b> grubunda görünür.</p>` : '';
  const body = `
<p class="eyebrow">Tahmin isteği</p>
<h1>${esc(info.home)} – ${esc(info.away)}</h1>
<p class="small">${when}</p>
<p class="lead">${title}</p>
${closed ? '<p class="lead">Maç başladı, tahminler kapandı.</p>' : `
<form id="f" autocomplete="off">
  <div class="score">
    <div><span>${esc(info.home)}</span><div class="step"><button type="button" data-k="h" data-d="-1">−</button><b id="h">0</b><button type="button" data-k="h" data-d="1">+</button></div></div>
    <div><span>${esc(info.away)}</span><div class="step"><button type="button" data-k="a" data-d="-1">−</button><b id="a">0</b><button type="button" data-k="a" data-d="1">+</button></div></div>
  </div>
  <input id="n" maxlength="30" placeholder="Adın" required>
  ${group}
  <button class="btn" id="go" type="submit">Tahminimi gönder</button>
  <p class="err" id="err"></p>
</form>
<div id="done" hidden>
  <p class="lead">Tahminin kaydedildi ✓</p>
  <p class="small">Maç bitince puanını Tribün uygulamasında görürsün. Uygulamayı indirince tahminin ve grubun otomatik gelir.</p>
  ${store ? `<a class="btn" id="dl" href="${store}">Uygulamayı indir</a>` : '<p class="small">Uygulama yakında App Store\'da.</p>'}
  <p class="small">Geçiş kodun: <b id="code"></b></p>
</div>`}
`;
  const script = closed ? '' : `
<script>
(function(){
  var U=${JSON.stringify(supabaseUrl)},K=${JSON.stringify(supabaseKey)},T=${JSON.stringify(t)};
  var s={h:0,a:0};
  function key(){try{var k=localStorage.getItem('tribun.web');if(k)return k;}catch(e){}
    var r=new Uint8Array(32);crypto.getRandomValues(r);var k2=Array.from(r,function(b){return('0'+b.toString(16)).slice(-2)}).join('');
    try{localStorage.setItem('tribun.web',k2)}catch(e){}return k2;}
  try{var nm=localStorage.getItem('tribun.name');if(nm)document.getElementById('n').value=nm;}catch(e){}
  document.querySelectorAll('.step button').forEach(function(b){b.onclick=function(){var k=b.dataset.k;s[k]=Math.max(0,Math.min(20,s[k]+Number(b.dataset.d)));document.getElementById(k).textContent=s[k];}});
  document.getElementById('f').onsubmit=function(e){e.preventDefault();var n=document.getElementById('n').value.trim(),err=document.getElementById('err'),go=document.getElementById('go');
    if(!n){err.textContent='Adını yaz.';return;}go.disabled=true;go.textContent='Gönderiliyor…';err.textContent='';
    try{localStorage.setItem('tribun.name',n)}catch(e){}
    fetch(U+'/rest/v1/rpc/web_answer',{method:'POST',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json'},
      body:JSON.stringify({p_secret:key(),p_name:n,p_token:T,p_home:s.h,p_away:s.a})})
    .then(function(r){return r.json().then(function(b){if(!r.ok)throw new Error(b&&b.message||'Gönderilemedi.');return b;})})
    .then(function(b){document.getElementById('f').hidden=true;document.getElementById('done').hidden=false;document.getElementById('code').textContent=b.code;
      var dl=document.getElementById('dl');if(dl)dl.onclick=function(){try{navigator.clipboard.writeText('TRIBUN-'+b.code)}catch(e){}};})
    .catch(function(x){err.textContent=x.message;go.disabled=false;go.textContent='Tahminimi gönder';});};
})();
</script>`;
  return shell(title, `${info.home}–${info.away} · Tribün`, body, script);
}

function shell(title, desc, body, script) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Tribün</title>
<meta property="og:title" content="${title}"><meta property="og:description" content="${esc(desc)}"><meta property="og:site_name" content="Tribün">
<meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:-apple-system,system-ui,sans-serif;color:#fff;background:linear-gradient(#9b0a2e,#1a0008 70%,#050005)}
main{width:100%;max-width:380px;text-align:center;padding:26px 20px;border-radius:28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(24px)}
h1{margin:4px 0;font-size:24px;letter-spacing:-.3px}p{margin:8px 0;color:rgba(255,255,255,.75);line-height:1.45}
.eyebrow{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.55)}.lead{color:#fff;font-size:16px}.small{font-size:13px}
.score{display:flex;gap:12px;margin:18px 0}.score>div{flex:1;display:grid;gap:8px}.score span{font-size:13px;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.step{display:flex;align-items:center;justify-content:center;gap:10px}.step b{font-size:30px;min-width:32px;font-variant-numeric:tabular-nums}
.step button{width:40px;height:40px;border-radius:20px;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:22px}
input{width:100%;height:46px;border-radius:14px;border:0;padding:0 14px;font-size:16px;background:rgba(255,255,255,.13);color:#fff;font-family:inherit}
.btn{display:block;margin-top:12px;padding:14px;border-radius:16px;background:#a6b4ff;color:#0b1030;font-weight:700;text-decoration:none;border:0;width:100%;font-size:16px;font-family:inherit}
.btn:disabled{opacity:.6}.err{color:#ff8a84;font-size:13px;min-height:1em}
</style></head><body><main>${body}</main>${script}</body></html>`;
}
