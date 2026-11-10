import { possessive } from '../src/game/turkish.ts';
import assert from 'node:assert/strict';
assert.deepEqual([1, 2, 3, 4, 5, 6, 9, 10, 12, 20, 40, 100].map(possessive), ["1'i", "2'si", "3'ü", "4'ü", "5'i", "6'sı", "9'u", "10'u", "12'si", "20'si", "40'ı", "100'ü"]);
console.log('ok');
