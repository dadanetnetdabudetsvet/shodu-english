import fs from 'node:fs';
import A from './content-a.mjs';
import B from './content-b.mjs';
import C from './content-c.mjs';
import D from './content-d.mjs';
import E from './content-e.mjs';
import F from './content-f.mjs';
import G from './content-g.mjs';
import H from './content-h.mjs';
import FIX from './content-fix.mjs';
import FIX2 from './content-fix2.mjs';
import FIX3, { IDEAS, WORDING } from './content-fix3.mjs';

// Источник — замороженный снимок версии 3; результат пишется в data/rules.json.
// Так пересборка идемпотентна и не зависит от текущего состояния данных.
const SRC = '/Users/admin/Documents/shodu-english/tools/rules.v3.json';
const DST = '/Users/admin/Documents/shodu-english/data/rules.json';
const content = [...A, ...B, ...C, ...D, ...E, ...F, ...G, ...H];
for (const [id, patch] of Object.entries({ ...{} , ...FIX })) {
  const target = content.find(c => c.id === id);
  if (!target) throw new Error('fix for unknown id: ' + id);
  Object.assign(target, patch);
}
for (const [id, idea] of Object.entries(IDEAS)) {
  const t = content.find(c => c.id === id);
  if (!t) throw new Error('idea fix for unknown id: ' + id);
  t.i = idea;
}
for (const F of [FIX2, FIX3, WORDING]) for (const [id, patch] of Object.entries(F)) {
  const target = content.find(c => c.id === id);
  if (!target) throw new Error('fix for unknown id: ' + id);
  Object.assign(target, patch);
}

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const byId = new Map(src.rules.map(r => [r.id, r]));
const seen = new Set();
for (const c of content) {
  if (!byId.has(c.id)) throw new Error('unknown id in content: ' + c.id);
  if (seen.has(c.id)) throw new Error('duplicate id in content: ' + c.id);
  seen.add(c.id);
}
if (seen.size !== src.rules.length) {
  const missing = src.rules.map(r => r.id).filter(id => !seen.has(id));
  throw new Error('missing ids (' + missing.length + '): ' + missing.join(','));
}

const LEVEL_RANK = { a1: 0, a2: 1, b1: 2, b2: 3 };

const merged = content.map(c => {
  const o = byId.get(c.id);
  return {
    id: o.id,
    order: 0,
    sameness: c.s,
    level: o.level,
    topic: o.topic,
    title: c.t,
    idea: c.i ?? o.idea,
    ru_parallel: c.p,
    en_example: c.e1,
    ru_example: c.r1,
    en_example2: c.e2,
    ru_example2: c.r2,
    gotcha: c.g === undefined ? o.gotcha : c.g,
    difficulty: o.difficulty,
    why_easy: c.w ?? o.why_easy,
    _origOrder: o.order,
  };
});

// Sort: sameness desc, then usefulness (level, difficulty, original editorial order).
merged.sort((a, b) =>
  b.sameness - a.sameness ||
  LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
  a.difficulty - b.difficulty ||
  a._origOrder - b._origOrder
);
merged.forEach((r, i) => { r.order = i + 1; delete r._origOrder; });

const out = { version: 4, rules: merged };
fs.writeFileSync(DST, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('written', merged.length, 'rules, version 4');
const dist = {};
for (const r of merged) dist[r.sameness] = (dist[r.sameness] || 0) + 1;
console.log('sameness distribution', dist);
