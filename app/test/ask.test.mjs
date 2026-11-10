import { askMessage, claimCodeFrom } from '../src/game/ask.ts';
import assert from 'node:assert/strict';
assert.equal(askMessage({ home: 'Türkiye', away: 'Belçika', pick: { h: 1, a: 1 }, token: 'ABCDEFGH' }), 'Türkiye - Belçika maçı 1-1 biter dedim. Senin skor tahminin ne?\nhttps://tribunapp.io/t/ABCDEFGH');
assert.equal(askMessage({ home: 'GS', away: 'FB', pick: null, token: 'ABCDEFGH' }), 'GS - FB maçı için tahminimi yaptım. Senin skor tahminin ne?\nhttps://tribunapp.io/t/ABCDEFGH');
assert.equal(claimCodeFrom('kod: tribun-ab2cd3ef'), 'AB2CD3EF');
assert.equal(claimCodeFrom('TRIBUN-AB1CD3EF'), null, '1 kodda yok');
assert.equal(claimCodeFrom(null), null);
console.log('ok');
