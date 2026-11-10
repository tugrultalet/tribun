import { askMessage, claimCodeFrom } from '../src/game/ask.ts';
import assert from 'node:assert/strict';
assert.equal(askMessage({ home: 'Türkiye', away: 'Belçika', pick: { h: 1, a: 1 }, token: 'ABCDEFGH', v: 'k3x9' }), 'https://tribunapp.io/t/ABCDEFGH?s=k3x9');
assert.match(askMessage({ home: 'GS', away: 'FB', pick: null, token: 'ABCDEFGH' }), /^https:\/\/tribunapp\.io\/t\/ABCDEFGH\?s=[0-9a-z]+$/, 'her paylaşımda farklı ek');
assert.equal(claimCodeFrom('kod: tribun-ab2cd3ef'), 'AB2CD3EF');
assert.equal(claimCodeFrom('TRIBUN-AB1CD3EF'), null, '1 kodda yok');
assert.equal(claimCodeFrom(null), null);
console.log('ok');
