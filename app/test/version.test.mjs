// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { versionLess, pushTopics } from '../src/version.ts';
import assert from 'node:assert/strict';
assert.equal(versionLess('1.0.0', '1.1.0'), true);
assert.equal(versionLess('1.2.10', '1.2.9'), false);
assert.equal(versionLess('1.2.9', '1.2.10'), true);
assert.equal(versionLess('1.0', '1.0.0'), false);
assert.equal(versionLess('1.0.0', '1.0'), false);
assert.equal(versionLess('2.0.0', '1.9.9'), false);
assert.equal(versionLess('1.0.0', ''), false, 'boş en düşük sürüm kimseyi engellemez');
assert.deepEqual(pushTopics({ notify: true, main: 645 }), ['team_645']);
assert.deepEqual(pushTopics({ notify: true, main: -5 }), ['team_-5']);
assert.deepEqual(pushTopics({ notify: false, main: 645 }), []);
assert.deepEqual(pushTopics({ notify: true }), []);
console.log('ok');
