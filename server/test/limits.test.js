import test from 'node:test';
import assert from 'node:assert/strict';
import { Buckets, Windows, clientIp, dateInWindow } from '../lib/limits.js';

test('kova: patlama kadar geçer, sonra dakikalık hızla dolar', () => {
  let t = 0;
  const b = new Buckets({ rate: 60, burst: 3, now: () => t });
  assert.deepEqual([b.take('a'), b.take('a'), b.take('a'), b.take('a')], [true, true, true, false]);
  assert.equal(b.take('b'), true, 'başka anahtar etkilenmez');
  t += 1000; // 1 sn = 1 jeton
  assert.equal(b.take('a'), true);
  assert.equal(b.take('a'), false);
  t += 11 * 60000; b.sweep(); assert.equal(b.map.size, 0);
});

test('pencere: süre içinde en çok max olay', () => {
  let t = 0;
  const w = new Windows({ max: 2, windowMs: 1000, now: () => t });
  assert.deepEqual([w.hit('x'), w.hit('x'), w.hit('x')], [true, true, false]);
  t = 1001; assert.equal(w.hit('x'), true);
});

test('IP: X-Forwarded-For son değeri (vekilin eklediği), yoksa bağlantı adresi', () => {
  assert.equal(clientIp({ 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }, '10.0.0.1'), '9.9.9.9');
  assert.equal(clientIp({ 'x-forwarded-for': 'uydurma, 5.5.5.5' }, 'x'), '5.5.5.5');
  assert.equal(clientIp({}, '10.0.0.1'), '10.0.0.1');
  assert.equal(clientIp({}, undefined), 'unknown');
});

test('tarih: gerçek tarih ve pencere içinde', () => {
  assert.ok(dateInWindow('2026-11-10', '2026-11-10', 30));
  assert.ok(dateInWindow('2026-12-10', '2026-11-10', 30));
  assert.ok(!dateInWindow('2026-12-11', '2026-11-10', 30));
  assert.ok(!dateInWindow('2026-99-99', '2026-11-10', 30));
  assert.ok(!dateInWindow('2026-02-30', '2026-02-10', 30), 'olmayan gün');
  assert.ok(!dateInWindow('20261110', '2026-11-10', 30));
});
