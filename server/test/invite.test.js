import test from 'node:test';
import assert from 'node:assert/strict';
import { invitePage, validCode } from '../lib/invite.js';

test('geçerli kod: 6 karakter, karışan harf/rakam yok', () => {
  assert.ok(validCode('ABC234')); assert.ok(validCode('abc234'));
  for (const bad of ['ABC23', 'ABC2345', 'ABCI23', 'ABC0O1', '', null, 'ABC 23']) assert.equal(validCode(bad), false, String(bad));
});
test('sayfa: grup adı ve kod yer alır, HTML kaçışlanır', () => {
  const html = invitePage({ code: 'abc234', name: '<img src=x onerror=alert(1)>"Tayfa"', storeUrl: null });
  assert.ok(html.includes('ABC234')); assert.ok(html.includes('tribun://join/ABC234'));
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('yakında App Store'));
});
test('sayfa: yalnızca https mağaza bağlantısı kabul edilir', () => {
  assert.ok(invitePage({ code: 'ABC234', storeUrl: 'https://apps.apple.com/app/x' }).includes('apps.apple.com'));
  assert.ok(!invitePage({ code: 'ABC234', storeUrl: 'javascript:alert(1)' }).includes('javascript:'));
});

import { privacyPage } from '../lib/privacy.js';
test('gizlilik sayfası: hesap silme anlatılır, e-posta yalnızca geçerliyse ve kaçışlı gösterilir', () => {
  assert.ok(privacyPage({}).includes('Hesabımı sil'));
  assert.ok(privacyPage({ contact: 'destek@ornek.com' }).includes('mailto:destek@ornek.com'));
  assert.ok(!privacyPage({ contact: '<script>@x.y' }).includes('<script>'));
});
