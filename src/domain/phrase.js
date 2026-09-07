/* Режим «Фраза»: сборка предложения из плиток.
 *
 * Чистый модуль, про DOM не знает.
 *
 * Контент берётся из уже написанных примеров: у каждого слова есть
 * ex_en и ex_ru, вычитанные вручную. Спецификация планировала писать
 * двести фраз заново, не заметив, что они уже лежат в данных.
 *
 * Главное отличие режима от остальных: между началом и концом задания
 * не одно решение, а четыре-семь, и все обратимы. Это черновик, а не
 * ответ, поэтому здесь нет жизней и нет наказания за перестановку.
 */

const WORD_RE = /[A-Za-z']+/g;

/** Разбор примера на плитки с сохранением пунктуации. */
export function tokenize(sentence) {
  const out = [];
  let last = 0;
  for (const m of String(sentence).matchAll(WORD_RE)) {
    if (m.index > last) {
      const tail = sentence.slice(last, m.index).trim();
      if (tail && out.length) out[out.length - 1].after = tail;
    }
    out.push({ text: m[0], after: '' });
    last = m.index + m[0].length;
  }
  const tail = sentence.slice(last).trim();
  if (tail && out.length) out[out.length - 1].after = tail;
  return out;
}

/**
 * Собрать задание вокруг целевого слова.
 * @param {object} target слово с ex_en и ex_ru
 * @param {Array} pool все доступные слова, для дистракторов
 * @param {object} opts { distractors, rnd }
 */
export function buildPhraseTask(target, pool, opts = {}) {
  const { distractors = 2, rnd = Math.random, minWords = 3, maxWords = 8 } = opts;
  if (!target.ex_en || !target.ex_ru) return null;

  const answer = tokenize(target.ex_en);
  if (answer.length < minWords || answer.length > maxWords) return null;

  const used = new Set(answer.map(t => t.text.toLowerCase()));
  const extras = [];
  const candidates = pool
    .filter(w => w.en && !used.has(String(w.en).toLowerCase()))
    .filter(w => Math.abs(String(w.en).length - target.en.length) <= 4);

  for (let i = 0; i < distractors && candidates.length; i++) {
    const pick = candidates.splice(Math.floor(rnd() * candidates.length), 1)[0];
    if (!pick) break;
    extras.push({ text: pick.en, after: '', distractor: true });
    used.add(String(pick.en).toLowerCase());
  }

  const bank = shuffle(answer.map((t, i) => ({ ...t, slot: i })).concat(extras), rnd);

  return {
    id: target.id,
    targetId: target.id,
    ru: target.ex_ru,
    en: target.ex_en,
    answer: answer.map(t => t.text),
    bank,
    slots: answer.length,
    lesson: target.hint || '',
  };
}

/** Какие плитки стоят не на своём месте. Верные не трогаем. */
export function checkPlacement(placed, answer) {
  const wrong = [];
  for (let i = 0; i < answer.length; i++) {
    const got = placed[i];
    if (!got || got.text.toLowerCase() !== answer[i].toLowerCase()) wrong.push(i);
  }
  return { ok: wrong.length === 0, wrong, right: answer.length - wrong.length };
}

/* Очки: медленный режим платит меньше в минуту, иначе он превратится
   в способ фармить. */
export const PHRASE_XP = { clean: 8, oneFix: 6, hinted: 5, typedTile: 2, flawless: 10 };

/**
 * Настройки режима по сложности. Раньше «Фраза» не зависела от неё
 * вовсе: на нулевой и на тридцатой сложности задание было одинаковым.
 *
 * Главная ручка — подсказка длины. Пунктирные гнёзда показывают, из
 * скольких слов состоит ответ, и это самая сильная опора в режиме.
 * На высокой сложности она исчезает.
 */
export function phraseOptions(index) {
  return {
    distractors: index >= 22 ? 3 : index >= 15 ? 2 : 1,
    minWords: index >= 21 ? 4 : 3,
    maxWords: index >= 21 ? 8 : index >= 14 ? 6 : 5,
    showSlots: index < 26,
    typedShare: index >= 15 ? 1 : 0,     // сколько плиток набирается руками
  };
}

export function phraseXp({ attempt, hinted, typed }) {
  if (hinted) return PHRASE_XP.hinted;
  let xp = attempt <= 1 ? PHRASE_XP.clean : PHRASE_XP.oneFix;
  if (typed) xp += PHRASE_XP.typedTile;
  return xp;
}

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
