import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { landingPage } from '../lib/landing.js';

test('ana sayfa: dosya okunur, gzip aynı içeriği verir', () => {
  const { html, gzip } = landingPage();
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>Tribün<\/title>/);
  assert.equal(zlib.gunzipSync(gzip).toString('utf8'), html);
});

test('ana sayfa: APP_STORE_URL yalnızca https ise düğmelere yazılır', () => {
  const none = landingPage().html;
  assert.equal(none.match(/class="btn pri appstore" href="#"/g).length, 2);
  const withUrl = landingPage({ storeUrl: 'https://apps.apple.com/app/id1?a=1&b=2' }).html;
  assert.equal(withUrl.match(/href="https:\/\/apps\.apple\.com\/app\/id1\?a=1&amp;b=2"/g).length, 2);
  assert.equal(landingPage({ storeUrl: 'javascript:alert(1)' }).html, none);
});
