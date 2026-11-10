// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { legacyToCommon, toCommon } from '../src/ids.ts';
import assert from 'node:assert/strict';
const hl = (af) => af * 851 + 784;
assert.equal(legacyToCommon(hl(645)), 645, 'Highlightly numarası çevrilir');
assert.equal(legacyToCommon(645), 645, 'zaten ortak numara bozulmaz (önceden -645 oluyordu)');
assert.equal(legacyToCommon(777), 777);
assert.equal(legacyToCommon(legacyToCommon(hl(777))), 777, 'iki kez çalışsa da sonuç aynı');
assert.equal(toCommon(645), -645, 'sunucu eşlemesi aynen (bilinmeyen Highlightly numarası negatif)');
console.log('ok');
