// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { dedupeTeams, teamKey } from '../src/follow.ts';
import assert from 'node:assert/strict';
const T = (id, name, kind) => ({ id, name, logo: '', ...(kind ? { kind } : {}) });
// Ekran görüntüsündeki durum: liste iki kez eklenmiş ama numaralar farklı
const dup = [T(645, 'Galatasaray'), T(777, 'Türkiye', 'national'), T(-5, 'Galatasaray'), T(-9, 'Türkiye', 'national')];
let r = dedupeTeams(dup, 645);
assert.deepEqual(r.teams.map((t) => t.id), [645, 777]); assert.equal(r.main, 645);
// ana takım silinen kopyaya işaret ediyorsa kalan kayda yönlenir; ana takım kaydı korunur
r = dedupeTeams(dup, -5);
assert.deepEqual(r.teams.map((t) => t.id), [-5, 777].sort((a, b) => dup.findIndex((x) => x.id === a) - dup.findIndex((x) => x.id === b)));
assert.equal(r.main, -5);
// kopya yoksa değişmez; kulüp ve milli takım aynı adda olsa da ayrı sayılır; büyük/küçük harf ve boşluk önemsiz
assert.deepEqual(dedupeTeams([T(1, 'Türkiye'), T(2, 'Türkiye', 'national')], 1).teams.length, 2);
assert.equal(teamKey(T(1, ' GALATASARAY ')), teamKey(T(2, 'galatasaray')));
assert.deepEqual(dedupeTeams([], undefined), { teams: [], main: undefined });
console.log('ok');
import { findByName } from '../src/follow.ts';
assert.equal(findByName([{ id: 1, name: 'Galatasaray' }, { id: 2, name: 'Fenerbahçe' }], ' galatasaray ')?.id, 1);
assert.equal(findByName([{ id: 1, name: 'Galatasaray' }], 'Beşiktaş'), undefined);
console.log('ok2');
