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

/**
 * Слова подборки.
 * @param {object} content загруженный контент
 * @param {object} set { theme: null|'travel'|…, size: null|50|100|250|500 }
 */
export function wordsFor(content, set) {
  if (!set || (!set.theme && !set.size)) return null;   // вся база

  let pool = ranked(content);
  if (set.theme && THEMES[set.theme]) {
    const topics = new Set(THEMES[set.theme].topics);
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

/** Человеческое название подборки. */
export function setTitle(set) {
  if (!set || (!set.theme && !set.size)) return 'Вся база';
  const theme = set.theme && THEMES[set.theme] ? THEMES[set.theme].title : 'Топ слов';
  return set.size ? `${theme}: ${set.size}` : theme;
}
