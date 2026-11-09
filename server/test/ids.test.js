import test from 'node:test';
import assert from 'node:assert/strict';
import { fromCommon, toCommon } from '../lib/ids.js';
import { isSeniorMen, nationalName } from '../lib/national.js';

test('bilinen Highlightly numaraları API-Football numaralarına çevrilir ve geri döner', () => {
  const known = [[173537, 203], [520745, 611], [662011, 777], [549679, 645], [1348375393, 1584459]]; // Süper Lig, Fenerbahçe, Türkiye, Galatasaray, bir maç
  for (const [hl, af] of known) {
    assert.equal(toCommon(hl), af);
    assert.equal(fromCommon(af), hl);
  }
});

test('formüle uymayan numara çakışmasın diye negatif olur ve geri çevrilebilir', () => {
  assert.equal(toCommon(1000), -1000);
  assert.equal(fromCommon(-1000), 1000);
});

test('milli takım adları Türkçeleşir', () => {
  assert.equal(nationalName('Turkey'), 'Türkiye');
  assert.equal(nationalName('Germany'), 'Almanya');
  assert.equal(nationalName('Czech-Republic'), 'Çekya');
  assert.equal(nationalName('England'), 'İngiltere');
  assert.equal(nationalName('Uzbekistan'), 'Özbekistan');
});

test('kadın, gençlik ve olimpiyat takımları elenir', () => {
  assert.equal(isSeniorMen('Turkey'), true);
  assert.equal(isSeniorMen('Germany Women'), false);
  assert.equal(isSeniorMen('Turkey U21'), false);
  assert.equal(isSeniorMen('Brazil Olympic'), false);
});
