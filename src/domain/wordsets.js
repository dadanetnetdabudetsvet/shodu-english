/* Подборки слов.
 *
 * По умолчанию человек идёт по всей базе, и сложность сама решает,
 * какие слова подавать. Но иногда цель конкретная: поездка, переезд,
 * работа. Тогда полезнее сузить базу, чем ждать, пока нужные слова
 * встретятся сами.
 *
 * Подборка меняет только состав пула. Вся остальная логика — коробки,
 * сложность, ритм, режимы — работает ровно так же. Это важно: подборка
 * не отдельный режим и не отдельный курс, а фильтр поверх того же
 * английского.
 *
 * Чистый модуль: ни DOM, ни хранилища.
 */

/* Служебные слова входят в любую подборку. Без артиклей, предлогов и
   форм глагола be нельзя собрать ни одной фразы, а подборка без фраз
   превращается в список для зубрёжки. */
const ALWAYS = 'core';

export const THEMES = {
  travel: {
    id: 'travel', icon: '✈️', title: 'Для поездок',
    sub: 'дорога, город, еда, деньги',
    topics: ['транспорт', 'транспорт и дорога', 'путешествия', 'город', 'город и места',
             'еда', 'еда и напитки', 'деньги', 'время и календарь', 'время', 'одежда'],
  },
  move: {
    id: 'move', icon: '🏠', title: 'Для переезда',
    sub: 'документы, жильё, здоровье, учёба',
    topics: ['работа/офис', 'работа и деньги', 'деньги', 'город и места', 'город',
             'здоровье', 'учёба', 'образование', 'общество', 'семья и люди',
             'дом и вещи', 'человек и тело', 'время и календарь'],
  },
  work: {
    id: 'work', icon: '💼', title: 'Для работы',
    sub: 'офис, деньги, договорённости',
    topics: ['работа/офис', 'работа и деньги', 'деньги', 'технологии',
             'время и календарь', 'время', 'общество', 'действия и события'],
  },
  it: {
    id: 'it', icon: '💻', title: 'Для айти',
    sub: 'техника, наука, работа',
    topics: ['технологии', 'наука', 'работа/офис', 'работа и деньги', 'образование'],
  },
};

export const SIZES = [50, 100, 250, 500];

/**
 * Оценка частотности слова. Точных частотных рангов в данных нет,
 * поэтому собираем их из того, что есть: служебные слова идут первыми,
 * дальше уровень, близость к русскому и порядок внутри колоды.
 *
 * Это приближение, и оно честнее выдуманного числа: слова
 * упорядочиваются по реальной полезности для начинающего.
 */
export function rank(w) {
  let base;
  if (w.deck === 'core') base = 0;
  else if (w.level === 'a1') base = 10;
  else if (w.tier === 1) base = 12;
  else if (w.tier === 2) base = 16;
  else if (w.level === 'a2') base = 22;
  else if (w.tier === 3) base = 26;
  else if (w.level === 'b1') base = 34;
  else if (w.tier === 4) base = 38;
  else base = 44;
  const within = Math.min(9.9, (w.order || w.index || 0) / 30);
  return base + within;
}

/** Все слова базы, упорядоченные по полезности. */
export function ranked(content) {
  return content.all
    .filter(w => !w.falseFriend)
    .slice()
    .sort((a, b) => rank(a) - rank(b));
}

/* Подборок можно держать несколько сразу: человек и переезжает, и
   работает, и это одна жизнь, а не два курса. Несколько подборок
   складываются объединением тем, а не пересечением: пересечение почти
   всегда даёт пустоту и выглядит как поломка.

   Старая форма с одной темой понимается по-прежнему: у людей уже
   сохранены настройки, и терять их из-за смены формата нельзя. */
export function themesOf(set) {
  if (!set) return [];
  if (Array.isArray(set.themes)) return set.themes.filter(id => THEMES[id]);
  return set.theme && THEMES[set.theme] ? [set.theme] : [];
}

export function isEmptySet(set) {
  return !set || (!themesOf(set).length && !set.size);
}

/**
 * Слова подборки.
 * @param {object} content загруженный контент
 * @param {object} set { themes: string[], size: null|50|100|250|500 }
 */
export function wordsFor(content, set) {
  if (isEmptySet(set)) return null;   // вся база

  let pool = ranked(content);
  const picked = themesOf(set);
  if (picked.length) {
    const topics = new Set(picked.flatMap(id => THEMES[id].topics));
    pool = pool.filter(w => w.deck === ALWAYS || topics.has(w.topic));
  }
  if (set.size) {
    const core = pool.filter(w => w.deck === ALWAYS);
    const rest = pool.filter(w => w.deck !== ALWAYS);
    // Служебные слова не занимают место в счёте: человек выбрал
    // «топ пятьдесят слов», а не «пятьдесят слов вместе с артиклями».
    pool = core.slice(0, Math.min(core.length, 40)).concat(rest.slice(0, set.size));
  }
  return pool;
}

/** Сколько слов реально доступно в подборке. */
export function setSize(content, set) {
  const w = wordsFor(content, set);
  return w ? w.filter(x => x.deck !== ALWAYS).length : content.counts.total;
}

/* Название подборки возвращается ключом и подстановками, а не готовой
   строкой. Склеенная здесь строка не нашлась бы в словаре и на всех
   языках показывала бы русский текст. */
export function setTitle(set) {
  const picked = themesOf(set);
  if (isEmptySet(set)) return { key: 'Вся база', vars: {} };
  if (!picked.length) return { key: 'Топ {v0}', vars: { v0: set.size } };
  const name = picked.length === 1
    ? { key: THEMES[picked[0]].title, vars: {} }
    : { key: 'Подборок: {v0}', vars: { v0: picked.length } };
  return set.size ? { ...name, size: set.size } : name;
}

/* ── подборка не должна оставлять человека без занятия ─────────────
 *
 * Подборка — это предпочтение, а не запрет. Узкая тема может не
 * пересечься с тем, что человек уже знает: «Для айти» не имеет ничего
 * общего с едой и городом, с которых все начинают. Режимы, работающие
 * только по знакомым словам, оставались тогда без материала, и снаружи
 * это выглядело так, будто кнопка «начать» сломана.
 *
 * Поэтому подборка применяется, только если внутри неё занятие
 * действительно собирается. Иначе берём общую базу и говорим об этом:
 * молча подменить выбор человека нельзя, это правило Р6.
 *
 * @param needKnown сколько знакомых слов нужно режиму: 0 для «Занятия»,
 *                  которое вводит новые, и 8 для остальных.
 */
export const MIN_POOL = 8;

export function narrowPool(fullPool, content, set, srs, needKnown) {
  if (isEmptySet(set)) return { pool: fullPool, widened: false };

  const allowed = wordsFor(content, set);
  if (!allowed) return { pool: fullPool, widened: false };
  const ids = new Set(allowed.map(w => w.id));
  const pool = fullPool.filter(w => ids.has(w.id));

  if (pool.length < MIN_POOL) return { pool: fullPool, widened: true };
  if (!needKnown) return { pool, widened: false };

  let known = 0;
  for (const w of pool) {
    const r = srs && srs[w.id];
    if (r && (r.box || 0) >= 1 && ++known >= needKnown) return { pool, widened: false };
  }
  return { pool: fullPool, widened: true };
}

/** Записи повторений одной кучей: подборке всё равно, из какой колоды слово. */
export function allRecords(state) {
  return { ...((state.srs || {}).deck1 || {}), ...((state.srs || {}).deck2 || {}) };
}
