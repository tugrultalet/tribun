// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { inScope, isDerby, isDerbyByName, scopeLeagues, scopeTeams } from '../src/groups/scopeRules.ts';
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
// takım kapsamı (1–3 takım): seçilen takımlardan birinin maçı
const teams = { scope: { type: 'teams', ids: [645, 611] }, team: { id: 645 } };
assert.deepEqual(scopeTeams(teams), [645, 611]); assert.deepEqual(scopeTeams(legacy), [645]); assert.equal(scopeTeams(leagues), null);
assert.ok(inScope(teams, F(203, 611, 9)) && inScope(teams, F(2, 9, 645)) && !inScope(teams, F(203, 1, 2)));
// derbi: dört büyük arasında ya da grubun iki takımı karşılaşınca
assert.ok(isDerby(F(203, 645, 611)) && isDerby(F(203, 549, 998)) && !isDerby(F(203, 645, 9)));
const ars = { scope: { type: 'teams', ids: [42, 50] }, team: { id: 42 } };
assert.ok(isDerby(F(39, 42, 50), ars) && !isDerby(F(39, 42, 50)) && !isDerby(F(39, 42, 9), ars));
assert.ok(isDerbyByName('Galatasaray', 'Fenerbahçe') && !isDerbyByName('Galatasaray', 'Amed') && !isDerbyByName(null, 'Fenerbahçe'));
console.log('ok');
