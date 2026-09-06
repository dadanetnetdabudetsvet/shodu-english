/* Загрузка и нормализация контента.
 *
 * Загрузчик терпим к версии файла: поля ru_bridge и флаги формы
 * появились во второй версии, и при их отсутствии выводятся сами.
 * Так приложение переживает и починку данных, и откат.
 */

let cache = null;

export async function loadContent() {
  if (cache) return cache;
  const [w, c, r] = await Promise.all([
    fetch('./data/words.json').then(x => x.json()),
    fetch('./data/core-words.json').then(x => x.json()),
    fetch('./data/rules.json').then(x => x.json()),
  ]);

  const deck1 = w.words.map((x, i) => normalizeWord(x, i, 'deck1'));
  const deck2 = c.words.map((x, i) => normalizeWord(x, i, 'deck2'));
  const falseFriends = (w.false_friends || []).map((x, i) => normalizeFalseFriend(x, i));

  cache = {
    deck1, deck2, falseFriends,
    patterns: c.patterns || [],
    rules: r.rules || [],
    byId: new Map([...deck1, ...deck2, ...falseFriends].map(x => [x.id, x])),
    version: { words: w.version, core: c.version, rules: r.version },
  };
  return cache;
}

function normalizeWord(x, index, deck) {
  const tr = x.tr || '';
  return {
    ...x,
    deck,
    index,
    tier: x.tier ?? 2,
    // Слово-мостик никогда не становится правильным ответом.
    // Правильный ответ — только точный перевод.
    bridge: x.ru_bridge ?? x.ru,
    answer: x.ru,
    stressShift: x.stressShift ?? guessStressShift(x),
    syllableDrop: x.syllableDrop ?? guessSyllableDrop(x, tr),
    spellingTrap: x.spellingTrap ?? guessSpellingTrap(x),
    falseFriend: false,
  };
}

function normalizeFalseFriend(x, i) {
  return {
    id: x.id || `f${String(i + 1).padStart(2, '0')}`,
    en: x.en,
    ru: x.actual_ru,
    answer: x.actual_ru,
    bridge: x.looks_like,
    ipa: x.ipa || '',
    tr: x.tr || '',
    hint: x.hint || `Не «${x.looks_like}». ${x.en} — это ${x.actual_ru}.`,
    note: x.note || '',
    ex_en: x.ex_en || '',
    ex_ru: x.ex_ru || '',
    deck: 'falseFriends',
    tier: 4,
    topic: 'ложные друзья',
    pos: x.pos || 'noun',
    falseFriend: true,
    stressShift: false, syllableDrop: false, spellingTrap: false,
  };
}

/* Эвристики на случай, если флаги ещё не проставлены в данных.
   Они грубые и служат только запасным вариантом. */

function syllablesEn(ipa) {
  return (String(ipa).match(/[aeiouɪʊeəɜɔɑæʌɒiu]/gi) || []).length;
}
function syllablesRu(word) {
  return (String(word).match(/[аеёиоуыэюя]/gi) || []).length;
}
function guessStressShift(x) {
  const m = /[ˈ]/.exec(x.ipa || '');
  if (!m) return false;
  const before = (x.ipa || '').slice(0, m.index);
  const enStress = syllablesEn(before);          // номер ударного слога, с нуля
  const ruStressIdx = (x.tr || '').indexOf('́');
  if (ruStressIdx < 0) return false;
  const ruStress = syllablesRu((x.tr || '').slice(0, ruStressIdx)) - 1;
  return enStress !== ruStress;
}
function guessSyllableDrop(x, tr) {
  const ru = syllablesRu(x.ru_bridge ?? x.ru ?? '');
  const en = syllablesEn(x.ipa || '');
  return ru > 0 && en > 0 && ru - en >= 1;
}
function guessSpellingTrap(x) {
  const en = String(x.en || '').toLowerCase();
  return /ph|(.)\1|ck|que|sc|kn|wr|mb$|le$/.test(en);
}

/* ── выборки ───────────────────────────────────────────────────── */

/** Все слова, доступные при текущей планке. */
export function poolForChallenge(content, sources) {
  let pool = content.deck1.filter(w => w.tier <= 2);
  if (sources.includes('tier34')) pool = content.deck1;
  if (sources.includes('falseFriends')) pool = pool.concat(content.falseFriends);
  if (sources.includes('deck2')) pool = pool.concat(content.deck2);
  return pool;
}

/**
 * Дистракторы подбираются фонетически близкими, а не случайными:
 * «доктор / директор / документ» учит различать, а случайный набор нет.
 */
export function pickDistractors(target, all, count = 3) {
  const same = all.filter(w => w.id !== target.id);
  const scored = same.map(w => ({ w, s: similarity(target.answer, w.answer) }));
  scored.sort((a, b) => b.s - a.s);
  const near = scored.slice(0, Math.max(count * 4, 12));
  shuffle(near);
  return near.slice(0, count).map(x => x.w);
}

function similarity(a = '', b = '') {
  a = a.toLowerCase(); b = b.toLowerCase();
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] === b[i]) s += 1; else break;
  if (a.length && b.length && a[0] === b[0]) s += 1;
  s -= Math.abs(a.length - b.length) * 0.2;
  return s;
}

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Опечатка: расстояние Левенштейна не больше единицы считается верным. */
export function isTypo(input, target) {
  const a = String(input).trim().toLowerCase();
  const b = String(target).trim().toLowerCase();
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
