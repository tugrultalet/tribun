// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { competitionsOf, defaultSelection, followedFixtures, selectionOf } from '../src/follow.ts';
import assert from 'node:assert/strict';
const T = (id) => ({ id, name: 'T' + id, logo: '' });
const F = (id, lg, h, a) => ({ id, lg, lgName: 'L' + lg, lgLogo: null, h: T(h), a: T(a) });
const euro = new Set([2, 3, 848]);
// GS (645): lig 203, kupa 206, CL 2 ; RM (541): La Liga 140, CL 2 ; TR (777 milli): hazırlık 10, eleme 32
const fx = [F(1, 203, 645, 1), F(2, 206, 2, 645), F(3, 2, 645, 541), F(4, 140, 541, 9), F(5, 140, 9, 541), F(6, 10, 777, 5), F(7, 32, 6, 777), F(8, 203, 40, 41)];
assert.deepEqual(competitionsOf(645, fx).map((c) => c.id), [203, 206, 2]);
const gs = T(645), rm = T(541), tr = { ...T(777), kind: 'national' };
// ana takım: tümü; diğer takım: yalnızca Avrupa kupası; milli takım: tümü
assert.deepEqual(defaultSelection(gs, true, [203, 206, 2], euro), [203, 206, 2]);
assert.deepEqual(defaultSelection(rm, false, [140, 2], euro), [2]);
assert.deepEqual(defaultSelection(T(9), false, [140], euro), [140], 'Avrupa\'da oynamayan takım: tüm maçlar');
assert.deepEqual(defaultSelection(tr, false, [10, 32], euro), [10, 32]);
// kullanıcı seçimi varsayılanı ezer
assert.deepEqual(selectionOf({ ...rm, sel: [140] }, false, [140, 2], euro), [140]);
// ana ekran: GS(ana) + RM(diğer) + TR(milli)
const ids = followedFixtures(fx, [gs, rm, tr], 645, euro).map((f) => f.id);
assert.deepEqual(ids, [1, 2, 3, 6, 7], 'GS hepsi, RM yalnızca CL (3), La Liga maçları (4,5) yok, TR hepsi, alakasız maç (8) yok');
// bir maç iki takıp edilen takımı ilgilendirse de bir kez gelir
assert.equal(followedFixtures(fx, [gs, rm], 645, euro).filter((f) => f.id === 3).length, 1);
// kullanıcı RM'nin La Liga'sını da açarsa
assert.ok(followedFixtures(fx, [gs, { ...rm, sel: [140, 2] }], 645, euro).some((f) => f.id === 4));
console.log('ok');
