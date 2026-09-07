/* Ключи соответствий.
 *
 * Самая сильная механика продукта и единственная, которая делает первую
 * цель буквально. Двести узнанных слов — это двести отдельных случаев.
 * Один ключ — это правило, применимое к словам, которых приложение
 * человеку не показывало.
 *
 * Момент, ради которого всё сделано: человеку показывают слово, которого
 * он здесь не видел, и он его понимает. После этого фраза «я знаю
 * английский» перестаёт быть авансом.
 *
 * Спецификация описывала эту механику с самого начала, а в состоянии
 * лежало пустое поле `keys`, которое ничего не хранило.
 *
 * Чистый модуль: ни DOM, ни хранилища.
 */

export const KEYS = [
  { id: 'tion', icon: '🔑', title: '-tion → -ция',
    match: (w) => /tion$/i.test(w.en),
    line: 'Английское -tion в русском всегда превращается в -ция.' },
  { id: 'sion', icon: '🔑', title: '-sion → -сия',
    match: (w) => /sion$/i.test(w.en),
    line: 'Хвост -sion в русском становится -сия.' },
  { id: 'ist', icon: '🔑', title: '-ist → -ист',
    match: (w) => /ist$/i.test(w.en) && w.en.length > 4,
    line: 'Кто делает дело: -ist по-русски всегда -ист.' },
  { id: 'ism', icon: '🔑', title: '-ism → -изм',
    match: (w) => /ism$/i.test(w.en),
    line: 'Название взгляда или течения: -ism даёт -изм.' },
  { id: 'ty', icon: '🔑', title: '-ty → -тет и -ость',
    match: (w) => /ity$/i.test(w.en),
    line: 'Хвост -ity превращается в -тет или в -ость.' },
  { id: 'ph', icon: '🔑', title: 'ph → ф',
    match: (w) => /ph/i.test(w.en),
    line: 'Сочетание ph в английском читается как ф. Всегда.' },
  { id: 'c_k', icon: '🔑', title: 'c → к',
    match: (w) => /^c[aoulr]/i.test(w.en),
    line: 'Буква c перед a, o, u и согласной звучит как к.' },
  { id: 'al', icon: '🔑', title: '-al → -альный',
    match: (w) => /al$/i.test(w.en) && w.en.length > 5,
    line: 'Прилагательные на -al в русском становятся -альными.' },
];

/** Сколько слов в базе подпадает под ключ. Число берётся из данных. */
export function keyCoverage(key, content) {
  return content.all.filter(w => w.en && key.match(w)).length;
}

/**
 * Ключ открывается после трёх верных ответов на слова его модели.
 * Порог именно три: одно совпадение — случайность, два — совпадение,
 * три — уже замеченная закономерность.
 */
export const KEY_THRESHOLD = 3;

export function evaluateKeys(state, content, isKnown) {
  const opened = state.keys || {};
  const fresh = [];
  for (const key of KEYS) {
    if (opened[key.id]) continue;
    let hits = 0;
    for (const deck of ['deck1', 'deck2']) {
      for (const [id, rec] of Object.entries(state.srs[deck] || {})) {
        if ((rec.ok || 0) < 1) continue;
        const w = content.byId.get(id);
        if (w && w.en && key.match(w)) hits++;
        if (hits >= KEY_THRESHOLD) break;
      }
      if (hits >= KEY_THRESHOLD) break;
    }
    if (hits >= KEY_THRESHOLD) fresh.push(key);
  }
  return fresh;
}

/**
 * Слово, которое человек ещё не видел, но уже должен понять по ключу.
 * Это и есть проверка ключа: доказательство, что открылось правило,
 * а не отдельные слова.
 */
export function unseenByKey(key, state, content) {
  const seen = new Set([
    ...Object.keys(state.srs.deck1 || {}),
    ...Object.keys(state.srs.deck2 || {}),
  ]);
  /* Двойники сюда не годятся: на них человек как раз ошибётся, и вместо
     доказательства получится ловушка ровно в тот момент, когда мы
     обещаем, что он всё понял. */
  const pool = content.all.filter(w => w.en && key.match(w) && !seen.has(w.id) && !w.falseFriend);
  if (!pool.length) return null;
  return pool[Math.abs(state.day * 7919) % pool.length];
}
