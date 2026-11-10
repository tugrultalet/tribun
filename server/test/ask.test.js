import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askPage, askText, validAskToken } from '../lib/ask.js';
import { pushMessage, sendPushes } from '../lib/push.js';

const info = { match_id: 1, sender: 'Tuğrul', home: 'GS', away: 'FB', kickoff: new Date(Date.now() + 86400000).toISOString(), pick: { h: 2, a: 1 }, group: 'Kanka' };

test('askText: kart başlığı gönderenin ağzından', () => {
  assert.equal(askText(info), 'GS - FB maçı 2-1 biter dedim. Senin skor tahminin ne?');
});

test('askPage: önizleme, form ve kaçış', () => {
  const html = askPage({ token: 'abcdefgh', info: { ...info, sender: '<b>x</b>' }, supabaseUrl: 'https://s', supabaseKey: 'k' });
  assert.match(html, /og:title" content="GS - FB maçı 2-1 biter dedim\. Senin skor tahminin ne\?"/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;, GS - FB maçı 2-1 biter dedi\. Senin skor tahminin ne\?/);
  assert.match(html, /id="f"/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /Kanka/);
});

test('askPage: başlamış maçta form yok; bilinmeyen bağlantı', () => {
  assert.doesNotMatch(askPage({ token: 'ABCDEFGH', info: { ...info, kickoff: new Date(Date.now() - 1000).toISOString() } }), /id="f"/);
  assert.match(askPage({ token: 'ABCDEFGH', info: null }), /Bağlantı bulunamadı/);
});

test('validAskToken', () => {
  assert.ok(validAskToken('ABCDEFGH'));
  assert.ok(!validAskToken('ABCDEFG1')); // 1 kodda yok
  assert.ok(!validAskToken('ABC'));
});

test('sendPushes: gönderir, ölü anahtarları siler', async () => {
  const calls = [];
  const supa = { rpc: async (fn, a) => { calls.push([fn, a]); return fn === 'server_take_pushes' ? [{ token: 't1', title: 'T', body: 'B', match_id: 5 }, { token: 't2', title: 'T', body: 'B', match_id: 5 }] : null; } };
  const fcm = { send: async (m) => { if (m.token === 't2') throw Object.assign(new Error('x'), { status: 404, code: 'UNREGISTERED' }); } };
  assert.deepEqual(await sendPushes(supa, fcm), { sent: 1, dropped: 1 });
  assert.deepEqual(calls[1], ['server_drop_tokens', { p_tokens: ['t2'] }]);
  assert.deepEqual(pushMessage({ token: 'a', title: 'T', body: 'B', match_id: 9 }).data, { matchId: '9' });
});
