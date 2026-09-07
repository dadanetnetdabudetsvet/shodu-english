import { t } from '../i18n/index.js';
/* Загрузка и нормализация контента.
 *
 * Загрузчик терпим к версии файла: поля ru_bridge и флаги формы
 * появились во второй версии, и при их отсутствии выводятся сами.
 * Так приложение переживает и починку данных, и откат.
 */

import { wordsFor } from '../domain/wordsets.js';

let cache = null;

export async function loadContent() {
  if (cache) return cache;

  /* Шесть колод собирались отдельно и пересекаются по написанию.
     Приоритет фиксированный: чем ближе слово к русскому, тем раньше оно
     должно попасться человеку. Дубли снимаются строго по написанию —
     два разных ответа на одно английское слово сделали бы задание
     «выбери перевод» неразрешимым. */
  const FILES = [
    ['./data/words.json', 'cognates'],
    ['./data/core-words.json', 'core'],
    ['./data/deck3-cognates.json', 'cognates2'],
    ['./data/deck4-actions.json', 'actions'],
    ['./data/deck5-nouns.json', 'nouns'],
    ['./data/deck6-topup.json', 'topup'],
  ];

  const loaded = await Promise.all(FILES.map(([url, deck]) =>
    fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => ({ deck, j }))));
  const rules = await fetch('./data/rules.json').then(r => r.json()).catch(() => ({ rules: [] }));

  const first = loaded.find(x => x.deck === 'cognates')?.j;
  const rawTraps = (first && first.false_friends) || [];

  const seen = new Set();
  const all = [];
  const push = (item, deck, index) => {
    const key = String(item.en || '').toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    all.push(normalizeWord(item, index, deck));
  };

  // Ложные друзья идут третьими по приоритету: они дороже общей лексики.
  const traps = [];
  for (const [i, t] of rawTraps.entries()) {
    const key = String(t.en || '').toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    traps.push(normalizeFalseFriend(t, i));
  }

  let idx = 0;
  for (const { deck, j } of loaded) {
    if (!j || !j.words) continue;
    if (deck === 'cognates2' || deck === 'actions' || deck === 'nouns' || deck === 'topup') {
      // после ловушек
    }
    for (const item of j.words) push(item, deck, idx++);
  }

  const byDeck = (name) => all.filter(x => x.deck === name);
  const deck1 = byDeck('cognates');
  const deck2 = byDeck('core');
  const extra = all.filter(x => !['cognates', 'core'].includes(x.deck));

  cache = {
    deck1, deck2, extra, falseFriends: traps,
    all: all.concat(traps),
    patterns: (loaded.find(x => x.deck === 'core')?.j?.patterns) || [],
    rules: rules.rules || [],
    byId: new Map([...all, ...traps].map(x => [x.id, x])),
    counts: {
      total: all.length + traps.length,
      cognates: deck1.length, core: deck2.length,
      traps: traps.length, extra: extra.length,
    },
  };
  return cache;
}

/* У новых колод нет поля tier: они не про близость к русскому.
   Выводим его из уровня, чтобы подбор по сложности работал единообразно. */
function tierFromLevel(level, deck) {
  if (deck === 'core') return 1;
  if (level === 'a1') return 3;
  if (level === 'a2') return 4;
  return 5;
}

function normalizeWord(x, index, deck) {
  const tr = x.tr || '';
  return {
    ...x,
    deck,
    index,
    tier: x.tier ?? tierFromLevel(x.level, deck),
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
    hint: x.hint || t('{v1} — это {v2}. А {v0} — другое слово.', { v0: x.looks_like, v1: x.en, v2: x.actual_ru }),
    note: x.note || '',
    ex_en: x.ex_en || '',
    ex_ru: x.ex_ru || '',
    deck: 'falseFriends',
    tier: 4,
    topic: t('ложные друзья'),
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
/* Подборка сужает базу, но не трогает остальную логику: коробки,
   сложность и режимы работают ровно так же. */
export function applyWordSet(pool, content, set) {
  if (!set || (!set.theme && !set.size)) return pool;
  const allowed = wordsFor(content, set);
  if (!allowed) return pool;
  const ids = new Set(allowed.map(w => w.id));
  const narrowed = pool.filter(w => ids.has(w.id));
  // Если подборка вычистила почти всё, лучше вернуть полную базу, чем
  // оставить человека без занятия.
  return narrowed.length >= 8 ? narrowed : pool;
}

export function poolForChallenge(content, sources) {
  // Низкая сложность — только самые узнаваемые когнаты.
  let pool = content.deck1.filter(w => w.tier <= 2);
  if (sources.includes('tier34')) {
    pool = content.deck1.concat(content.extra.filter(w => w.deck === 'cognates2'));
  }
  if (sources.includes('deck2')) pool = pool.concat(content.deck2);
  if (sources.includes('general')) {
    pool = pool.concat(content.extra.filter(w => w.deck !== 'cognates2'));
  }
  if (sources.includes('falseFriends')) pool = pool.concat(content.falseFriends);
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
