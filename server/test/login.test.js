import test from 'node:test';
import assert from 'node:assert/strict';
import { loginPage, validHash } from '../lib/login.js';

test('giriş sayfası: geçerli özetle uygulama bağlantısı, geçersizde uyarı ve kaçış', () => {
  const h = 'pkce_0123456789abcdef0123456789abcdef';
  assert.ok(validHash(h));
  assert.match(loginPage({ hash: h }), new RegExp(`tribun://giris\\?h=${h}`));
  assert.ok(!validHash('"><script>'));
  const bad = loginPage({ hash: '"><script>x</script>' });
  assert.match(bad, /Bağlantı geçersiz/); assert.doesNotMatch(bad, /<script>/);
});
