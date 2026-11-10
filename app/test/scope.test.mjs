// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { inScope, scopeLeagues } from '../src/groups/scopeRules.ts';
import assert from 'node:assert/strict';
const F = (lg, h, a) => ({ id: 1, lg, h: { id: h }, a: { id: a } });
const legacy = { scope: null, team: { id: 645 } };
const undef = { team: { id: 645 } };
const leagues = { scope: { type: 'leagues', ids: [203, 2] }, team: { id: 0 } };
assert.equal(scopeLeagues(legacy), null); assert.equal(scopeLeagues(undef), null); assert.deepEqual(scopeLeagues(leagues), [203, 2]);
// mevcut gruplar (kapsamsız): grubun takımının maçları, hangi turnuva olursa olsun
assert.ok(inScope(legacy, F(2, 645, 9)) && inScope(legacy, F(203, 9, 645)) && !inScope(legacy, F(203, 1, 2)));
assert.ok(inScope(undef, F(2, 645, 9)), 'scope alanı hiç gelmese de eski davranış');
// turnuva kapsamı: takımdan bağımsız, yalnızca seçili turnuvalar
assert.ok(inScope(leagues, F(203, 1, 2)) && inScope(leagues, F(2, 3, 4)) && !inScope(leagues, F(140, 1, 2)));
console.log('ok');
