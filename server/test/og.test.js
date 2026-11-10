import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSvg, renderPng } from '../lib/og.js';

test('önizleme görseli: Türkçe adlar ve skorla 1200×630 PNG', () => {
  const svg = matchSvg({ home: 'Türkiye', away: 'Belçika', pick: { h: 1, a: 1 }, sender: 'Tuğrul', league: 'UEFA Uluslar Ligi', when: '12 Kas · 20:00' });
  assert.match(svg, /Türkiye/); assert.match(svg, /Tuğrul bu skoru dedi/);
  const png = renderPng(svg);
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
});

test('önizleme görseli: ad kaçışlanır, tahmin gizliyse soru işareti', () => {
  const svg = matchSvg({ home: 'A<b>', away: 'B&C', pick: null, sender: 'x"y' });
  assert.ok(!svg.includes('<b>')); assert.match(svg, /B&amp;C/); assert.match(svg, /tahminini yaptı/); assert.match(svg, />\?</);
});
