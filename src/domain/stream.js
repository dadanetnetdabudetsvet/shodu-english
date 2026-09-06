/* Режим «Поток»: чтение на скорость с проверкой подлога.
 *
 * Чистый модуль, про DOM не знает.
 *
 * Тип мышления, которого нет у остальных режимов: не извлечение из
 * памяти, а ВЕРИФИКАЦИЯ. Человеку дают готовую строку и спрашивают,
 * сходится ли она. Он читает, а не вспоминает.
 *
 * Проиграть здесь нельзя буквально: у экрана нет состояния «конец».
 * Не успел строку — она сама показала верное слово и уехала.
 */

import { tokenize } from './phrase.js';

/* Замены, которые дают настоящую работу глазу. Служебные слова
 * подменяются служебными, знаменательные — близкими по теме. */
const FUNCTION_SWAPS = {
  is: ['are', 'was'], are: ['is', 'were'], was: ['is', 'were'], were: ['are', 'was'],
  a: ['an', 'the'], an: ['a', 'the'], the: ['a', 'an'],
  in: ['on', 'at'], on: ['in', 'at'], at: ['in', 'on'], to: ['for', 'at'],
  my: ['your', 'his'], your: ['my', 'her'], his: ['her', 'my'], her: ['his', 'your'],
  have: ['has'], has: ['have'], do: ['does'], does: ['do'],
  this: ['that', 'these'], that: ['this', 'those'], these: ['this', 'those'],
  not: ['no'], no: ['not'], and: ['but', 'or'], but: ['and', 'or'], or: ['and', 'but'],
};

/**
 * Построить строку с одной подменой.
 * @param {object} target слово с примером
 * @param {Array} pool доступные слова для тематической подмены
 */
export function buildStreamLine(target, pool, opts = {}) {
  const { rnd = Math.random, mode = 'auto' } = opts;
  if (!target.ex_en) return null;

  const tokens = tokenize(target.ex_en);
  if (tokens.length < 3) return null;

  const candidates = [];
  tokens.forEach((tok, i) => {
    const low = tok.text.toLowerCase();
    if (FUNCTION_SWAPS[low]) candidates.push({ i, kind: 'function', options: FUNCTION_SWAPS[low] });
    if (low === String(target.en).toLowerCase()) {
      const near = pool
        .filter(w => w.id !== target.id && w.en
          && (target.topic ? w.topic === target.topic : w.deck === target.deck))
        .slice(0, 20)
        .map(w => w.en);
      if (near.length) candidates.push({ i, kind: 'topic', options: near });
    }
  });

  if (!candidates.length) return null;

  const wanted = mode === 'function' ? candidates.filter(c => c.kind === 'function')
    : mode === 'topic' ? candidates.filter(c => c.kind === 'topic')
    : candidates;
  const chosen = (wanted.length ? wanted : candidates)[Math.floor(rnd() * (wanted.length || candidates.length))];

  const replacement = chosen.options[Math.floor(rnd() * chosen.options.length)];
  const original = tokens[chosen.i].text;
  const shown = tokens.map((t, i) => (i === chosen.i
    ? { ...t, text: matchCase(original, replacement) }
    : { ...t }));

  return {
    id: target.id,
    targetId: target.id,
    ru: target.ex_ru || '',
    tokens: shown,
    badIndex: chosen.i,
    correct: original,
    kind: chosen.kind,
  };
}

function matchCase(source, next) {
  if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return next[0].toUpperCase() + next.slice(1);
  }
  return next;
}

/* Темп. Ускорение молча: сообщать человеку, что он замедлился, запрещено. */
export const STREAM = {
  waveSize: 6, waves: 3,
  startMs: 3500, minMs: 1600,
  speedUp: 0.82, easeOff: 0.90,
};

export function nextTempo(currentMs, missedInWave) {
  if (missedInWave === 0) return Math.max(STREAM.minMs, Math.round(currentMs * STREAM.speedUp));
  if (missedInWave <= 2) return Math.max(STREAM.minMs, Math.round(currentMs * STREAM.easeOff));
  return currentMs;                 // замирает, но не падает
}

export const STREAM_XP = { firstTap: 3, secondTap: 2, laterTap: 1, escaped: 1, wave: [2, 3, 4], cleanWave: 2 };

/** Слов в минуту: главное растущее число режима. */
export function wordsPerMinute(wordsRead, ms) {
  if (!ms) return 0;
  return Math.round((wordsRead / ms) * 60000);
}
