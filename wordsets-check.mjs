/* Подборки слов не должны оставлять человека без занятия.
 *
 * Настоящий случай: слова, которые человек уже знает, лежат в еде и
 * городе — с них начинают все, — а он выбирает «Для айти». Пересечения
 * нет, режимы на знакомых словах остаются без материала, и снаружи это
 * выглядит так, будто кнопка «начать» сломана.
 *
 * Проверяем каждую подборку в каждом режиме на каждой сложности.
 * Запуск: node wordsets-check.mjs
 */
import { readFileSync } from 'node:fs';
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(readFileSync(String(u).replace(/^\.\//, ''), 'utf8')) });

const { loadContent, poolForChallenge } = await import('./src/data/content.js');
const { allowedSources, selectByChallenge } = await import('./src/domain/challenge.js');
const { buildSession, newRecord, maintenance } = await import('./src/domain/srs.js');
const { emptyState } = await import('./src/core/storage.js');
const { THEMES, SIZES, narrowPool, allRecords, MIN_POOL, setTitle } = await import('./src/domain/wordsets.js');

const content = await loadContent();
const mergeUnique = (a, b) => { const seen = new Set(a.map(x => x.id)); return a.concat(b.filter(x => !seen.has(x.id))); };

/* Человек, который позанимался пару недель: знакомые слова взяты
   подряд с начала колоды, то есть про еду и город. Ровно так и
   выглядит любой, кто дошёл до настроек. */
function person(count = 45) {
  const s = emptyState();
  s.flags.onboarded = true;
  s.day += 14;
  s.streak = { current: 5, best: 7, lastDay: s.day, freezes: 1, pausedDays: 0 };
  for (const w of content.deck1.slice(0, count)) {
    s.srs.deck1[w.id] = { box: 3, ok: 6, bad: 1, streak: 3, lastDay: s.day - 1, dueDay: s.day };
  }
  for (const w of content.deck2.slice(0, 20)) {
    s.srs.deck2[w.id] = { box: 3, ok: 6, bad: 1, streak: 3, lastDay: s.day - 1, dueDay: s.day };
  }
  return s;
}

const SETS = [null];
for (const th of Object.keys(THEMES)) {
  SETS.push({ themes: [th], size: null });
  for (const n of SIZES) SETS.push({ themes: [th], size: n });
}
for (const n of SIZES) SETS.push({ themes: [], size: n });
SETS.push({ themes: ['travel', 'work'], size: 100 });
SETS.push({ themes: Object.keys(THEMES), size: 50 });
SETS.push({ theme: 'it', size: 50 });          // старая форма из сохранённых настроек

const MODES = ['build', 'sprint', 'ether'];
const problems = [];
let widenedCount = 0;

for (const set of SETS) {
  for (const mode of MODES) {
    for (const index of [0, 6, 12, 18, 24, 30]) {
      const s0 = person();
      s0.settings.wordSet = set;
      s0.challenge.index = index;
      const tag = `${JSON.stringify(set)} · ${mode} · сложность ${index}`;
      try {
        const full = poolForChallenge(content, allowedSources(index));
        const { pool: base, widened } = narrowPool(full, content, set, allRecords(s0),
          mode === 'build' ? 0 : MIN_POOL);
        if (widened) widenedCount++;

        const withRecs = base.map(w => ({
          id: w.id, word: w,
          rec: (s0.srs[w.deck === 'core' ? 'deck2' : 'deck1'] || {})[w.id] || newRecord(),
        }));
        const banded = selectByChallenge(withRecs, index);
        const pool = mergeUnique(withRecs.filter(p => p.rec.box >= 1 && p.rec.dueDay <= s0.day), banded);

        let items = buildSession(pool, {
          day: s0.day, mode,
          size: mode === 'sprint' ? 30 : 18,
          newBudget: 10,
          gapDays: 0,
        });
        if (items.length < 8) items = items.concat(maintenance(withRecs, 8 - items.length, s0.day, items));
        if (items.length && items.length < 8) items = items.concat(items.map(x => ({ ...x, secondPass: true })));

        if (!items.length) problems.push(`ТУПИК: ${tag} | пул ${base.length}`);
      } catch (e) {
        problems.push(`ПАДЕНИЕ: ${tag} → ${e.message}`);
      }
    }
  }
}

/* Подпись подборки должна быть ключом словаря, а не склеенной строкой:
   склеенная нигде не найдётся и на всех языках останется русской. */
for (const set of SETS) {
  const r = setTitle(set);
  if (!r || typeof r.key !== 'string') problems.push(`подпись не ключ: ${JSON.stringify(set)}`);
  else if (/\d/.test(r.key.replace(/\{v\d\}/g, ''))) problems.push(`число вклеено в ключ: ${r.key}`);
}

console.log(`сочетаний проверено: ${SETS.length * MODES.length * 6}`);
console.log(`подборка расширялась до общей базы: ${widenedCount} раз`);
if (problems.length) {
  console.log('\nПРОБЛЕМЫ:');
  for (const p of problems.slice(0, 25)) console.log(' -', p);
  if (problems.length > 25) console.log(` ... и ещё ${problems.length - 25}`);
} else console.log('\nЛЮБАЯ ПОДБОРКА ДАЁТ ЗАНЯТИЕ В ЛЮБОМ РЕЖИМЕ');
process.exit(problems.length ? 1 : 0);
