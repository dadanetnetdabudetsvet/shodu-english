/* Сведение всех колод в одну базу.
 *
 * Колоды собирались параллельно, поэтому пересекаются. Приоритет
 * фиксированный и осмысленный: чем ближе слово к русскому, тем раньше
 * оно должно попасться человеку, поэтому когнаты выигрывают у общей
 * лексики, а действия у предметов.
 *
 * Дубли снимаются строго по написанию: два разных ответа на одно
 * английское слово сделали бы задание «выбери перевод» неразрешимым.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const w = read('data/words.json');
const core = read('data/core-words.json');
const cog2 = read('data/deck3-cognates.json');
const acts = read('data/deck4-actions.json');
const nouns = read('data/deck5-nouns.json');
const topup = read('data/deck6-topup.json');

const sources = [
  { deck: 'cognates',  items: w.words,           priority: 1 },
  { deck: 'core',      items: core.words,        priority: 2 },
  { deck: 'traps',     items: w.false_friends,   priority: 3 },
  { deck: 'cognates2', items: cog2.words,        priority: 4 },
  { deck: 'actions',   items: acts.words,        priority: 5 },
  { deck: 'nouns',     items: nouns.words,       priority: 6 },
  { deck: 'topup',     items: topup.words,       priority: 7 },
];

const seen = new Map();
const dropped = [];
const merged = [];

for (const src of sources) {
  for (const item of src.items) {
    const key = String(item.en).toLowerCase().trim();
    if (seen.has(key)) {
      dropped.push({ en: item.en, kept: seen.get(key), dropped: src.deck });
      continue;
    }
    seen.set(key, src.deck);
    merged.push({ ...item, deck: src.deck });
  }
}

const byDeck = {};
for (const m of merged) byDeck[m.deck] = (byDeck[m.deck] || 0) + 1;

console.log('исходно записей:', sources.reduce((a, s) => a + s.items.length, 0));
console.log('после снятия дублей:', merged.length);
console.log('снято дублей:', dropped.length);
console.log('по колодам:', JSON.stringify(byDeck));
const byPair = {};
for (const d of dropped) { const k = `${d.dropped} → уже в ${d.kept}`; byPair[k] = (byPair[k] || 0) + 1; }
console.log('пересечения:', JSON.stringify(byPair, null, 1));
console.log('примеры снятых:', dropped.slice(0, 12).map(d => d.en).join(', '));

writeFileSync('data/deck-index.json', JSON.stringify({
  version: 1,
  total: merged.length,
  decks: byDeck,
  duplicatesRemoved: dropped.length,
  order: sources.map(s => s.deck),
}, null, 1));
console.log('\nсводка записана в data/deck-index.json');
