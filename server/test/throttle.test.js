import test from 'node:test';
import assert from 'node:assert/strict';
import { Throttle } from '../lib/throttle.js';

test('pencere dolunca bekler ve hiçbir pencerede limiti aşmaz', async () => {
  const t = new Throttle(3, 300);
  const stamps = [];
  for (let i = 0; i < 7; i++) { await t.wait(); stamps.push(Date.now()); }
  for (let i = 0; i + 3 < stamps.length; i++) {
    assert.ok(stamps[i + 3] - stamps[i] >= 295, `${i}. ile ${i + 3}. istek aynı pencerede: ${stamps[i + 3] - stamps[i]} ms`);
  }
});

test('limit altındayken beklemez', async () => {
  const t = new Throttle(5, 1000);
  const start = Date.now();
  for (let i = 0; i < 5; i++) await t.wait();
  assert.ok(Date.now() - start < 100);
});

test('setLimit yeni limiti uygular', async () => {
  const t = new Throttle(10, 300);
  t.setLimit(1);
  const start = Date.now();
  await t.wait();
  await t.wait();
  assert.ok(Date.now() - start >= 295);
});
