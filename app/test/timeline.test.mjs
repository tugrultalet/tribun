// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { systemMessages, mergeTimeline } from '../src/chat/timeline.ts';
import assert from 'node:assert/strict';
const f = { id: 1, ts: 1_000_000, st: 'ft', short: 'FT', min: 90, s: [2, 1], h: { id: 1, name: 'Galatasaray' }, a: { id: 2, name: 'Fenerbahçe' } };
const ev = [{ min: 64, extra: null, side: 'h', k: 'goal', p: 'Barış Alper Yılmaz', x: null }, { min: 12, extra: null, side: 'a', k: 'goal', p: 'Dzeko', x: null }, { min: 40, extra: null, side: 'h', k: 'goal', p: 'Icardi', x: null }, { min: 70, extra: null, side: 'a', k: 'r', p: 'X', x: null }, { min: 80, extra: null, side: 'a', k: 'goal', p: 'Y', x: 'Kendi kalesine' }];
const s = systemMessages(f, ev, 1e12);
console.log(s.map((m) => m.text).join('\n'));
assert.equal(s[0].text, "⚽ 12' Dzeko · GS 0–1 FB");
assert.ok(s.some((m) => m.text.startsWith('⏸') && m.text.endsWith('GS 1–1 FB')));
assert.ok(s.at(-1).text.startsWith('🏁 Maç sonu · GS 2–1 FB'));
const m = mergeTimeline([{ id: 5, created_at: new Date(f.ts * 1000 + 65 * 60000).toISOString() }], s);
assert.equal(m.filter((x) => x.kind === 'chat').length, 1);
assert.ok(m.every((x, i) => i === 0 || m[i - 1].at <= x.at));
console.log('ok');
const s2 = systemMessages(f, ev, 1e12, 'Tam skoru bilen: Ahmet (+3). Haftanın lideri: Mehmet.');
assert.equal(s2.at(-1).text, '🎯 Tam skoru bilen: Ahmet (+3). Haftanın lideri: Mehmet.'); assert.ok(s2.at(-1).at > s2.at(-2).at);
console.log('ok2');
