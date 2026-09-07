/* Дневной разворот.
 *
 * Экран, на котором нечего проходить. Он существует ради одного
 * состояния, которого у продукта не было вовсе: человек открыл
 * приложение в день, когда заниматься не готов.
 *
 * Правило для всего содержимого: каждая карточка выбирается
 * детерминированно от номера дня. В течение суток она не меняется,
 * назавтра она другая. Это и делает разворот свежей единицей, ради
 * которой возвращаются, а не случайной подборкой.
 *
 * Чистый модуль: ни DOM, ни хранилища.
 */

const SALT = { word: 7919, rule: 104729, diff: 15485863, trap: 32452843 };

function pick(arr, day, salt) {
  if (!arr.length) return null;
  return arr[Math.abs(day * salt) % arr.length];
}

/** Слово дня: только из узнаваемых, иначе оно пугает, а не радует. */
export function wordOfDay(content, day) {
  const pool = content.deck1.filter(w => w.tier <= 2 && w.tr);
  return pick(pool, day, SALT.word);
}

/** Правило дня: из первой трети, где совпадение с русским полное. */
export function ruleOfDay(content, day) {
  const easy = (content.rules || []).filter(r => (r.order || 999) <= 120);
  return pick(easy.length ? easy : content.rules, day, SALT.rule);
}

/**
 * Карточка «Разница»: слово, которое пишется знакомо, а звучит иначе.
 * Это самый сильный контент продукта, и до сих пор он был закопан
 * в подсказку внутри задания.
 */
export function differenceOfDay(content, day) {
  const pool = content.deck1.filter(w => (w.stressShift || w.syllableDrop) && w.tr && w.ru_bridge);
  const w = pick(pool, day, SALT.diff);
  if (!w) return null;
  const ruSyl = (String(w.ru_bridge).match(/[аеёиоуыэюя]/gi) || []).length;
  const enSyl = (String(w.tr).match(/[аеёиоуыэюя]/gi) || []).length;
  return {
    word: w,
    expected: w.ru_bridge,
    actual: w.tr,
    ruSyl, enSyl,
    kind: w.syllableDrop && enSyl < ruSyl ? 'drop' : 'stress',
  };
}

/** Ловушка дня: ложный друг переводчика. */
export function trapOfDay(content, day) {
  return pick(content.falseFriends || [], day, SALT.trap);
}

/**
 * Слова, которые улеглись, пока человека не было.
 *
 * Пропуск дней превращается в приобретение, а не в потерю: память
 * работает и без присутствия, и это правда, а не утешение. Берём
 * слова, которые давно не показывались и стоят высоко в коробках.
 */
export function settled(state, content, day) {
  const out = [];
  for (const deck of ['deck1', 'deck2']) {
    for (const [id, rec] of Object.entries(state.srs[deck] || {})) {
      if ((rec.box || 0) >= 4 && (day - (rec.lastDay || 0)) >= 3) {
        const w = content.byId.get(id);
        if (w) out.push(w);
      }
    }
  }
  return out;
}

/* ── строка про человека ──────────────────────────────────────── */

/**
 * Портрет: одно предложение о человеке, посчитанное из состояния.
 *
 * Жёсткое правило: нет факта — нет строки. Запасных комплиментов не
 * бывает. Строка, которая была бы правдой при любом поведении, пустая
 * и запрещена правилом Р4.
 */
export function portrait(state, content, isKnown) {
  const lines = [];
  const srs = { ...(state.srs.deck1 || {}), ...(state.srs.deck2 || {}) };
  const recs = Object.entries(srs);
  if (!recs.length) return null;

  let known = 0, learning = 0, best = null, oldest = null;
  for (const [id, r] of recs) {
    if (isKnown(r)) known++; else if (r.box > 0) learning++;
    if (!best || (r.streak || 0) > (best[1].streak || 0)) best = [id, r];
    if (!oldest || (r.lastDay || 0) < (oldest[1].lastDay || 0)) oldest = [id, r];
  }

  if (known + learning > 0) {
    lines.push({ kind: 'count', text: 'Сейчас ты узнаёшь {v0} английских слов.', vars: { v0: known + learning } });
  }
  if (best && (best[1].streak || 0) >= 4) {
    const w = content.byId.get(best[0]);
    if (w) lines.push({ kind: 'strong', text: 'Твоё самое стойкое слово — {v0}. Ты не сбился на нём ни разу за {v1} показов.', vars: { v0: w.en, v1: best[1].streak } });
  }
  const days = Object.values(state.days || {});
  const totalMin = Math.round(days.reduce((a, d) => a + (d.ms || 0), 0) / 60000);
  if (totalMin >= 10) {
    lines.push({ kind: 'time', text: 'Весь твой английский занял {v0} минут. Столько же занимает дорога до работы.', vars: { v0: totalMin } });
  }
  if (state.streak.best >= 3) {
    lines.push({ kind: 'rhythm', text: 'Твой лучший ритм — {v0} дней подряд. Он никуда не денется.', vars: { v0: state.streak.best } });
  }
  const topics = {};
  for (const [id, r] of recs) {
    if (!isKnown(r)) continue;
    const w = content.byId.get(id);
    if (w && w.topic) topics[w.topic] = (topics[w.topic] || 0) + 1;
  }
  const top = Object.entries(topics).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 5) {
    lines.push({ kind: 'topic', text: 'Больше всего слов из темы «{v0}» — {v1}.', vars: { v0: top[0], v1: top[1] } });
  }

  if (!lines.length) return null;
  return lines[Math.abs(state.day * 2654435761) % lines.length];
}

/* ── «ты это читаешь» ──────────────────────────────────────────────
 *
 * Самая сильная карточка дня и единственная, которая доказывает
 * главное утверждение продукта делом, а не словами. Мы берём готовое
 * английское предложение из правил и проверяем, что КАЖДОЕ слово в
 * нём человек уже знает: либо оно у него в прогрессе, либо это
 * служебное слово, которое мы объявили общим.
 *
 * Если хоть одно слово чужое — карточки нет. Показать предложение с
 * незнакомым словом и сказать «ты это читаешь» значит соврать, а
 * пойманное враньё стоит дороже, чем пропущенный день.
 */

/* Служебный костяк языка. Эти слова не «учат»: они держат
   предложение и появляются в каждом задании с первого дня. */
const GLUE = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been',
  'i', 'you', 'he', 'she', 'we', 'they', 'it', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'our', 'their', 'its',
  'this', 'that', 'these', 'those', 'here', 'there',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'about',
  'and', 'or', 'but', 'not', 'no', 'yes', 'so', 'as', 'if', 'then',
  'do', 'does', 'did', 'have', 'has', 'had', 'can', 'will', 'would',
  'very', 'too', 'also', 'now', 'all', 'some', 'any', 'more', 'most',
  'one', 'two', 'three', 'good', 'new', 'old', 'big', 'little',
  'what', 'where', 'when', 'who', 'how', 'why',
]);

function words(sentence) {
  return String(sentence || '').toLowerCase().match(/[a-z']+/g) || [];
}

/* Формы одного слова: множественное число и третье лицо дают ту же
   основу. Без этого «doctors» считалось бы незнакомым при знакомом
   «doctor», и карточка исчезала бы на ровном месте. */
function stems(w) {
  const out = [w];
  if (w.endsWith('ies') && w.length > 4) out.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es') && w.length > 3) out.push(w.slice(0, -2));
  if (w.endsWith('s') && w.length > 2) out.push(w.slice(0, -1));
  if (w.endsWith('ing') && w.length > 5) out.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  if (w.endsWith('ed') && w.length > 4) out.push(w.slice(0, -2), w.slice(0, -1));
  return out;
}

export function readable(state, content, day, isKnown) {
  const srs = { ...(state.srs.deck1 || {}), ...(state.srs.deck2 || {}) };
  const mine = new Set();
  for (const [id, r] of Object.entries(srs)) {
    if (!(isKnown(r) || (r.box || 0) > 0 || (r.ok || 0) > 0)) continue;
    const w = content.byId.get(id);
    if (w && w.en) mine.add(String(w.en).toLowerCase());
  }
  if (mine.size < 4) return null;

  const ok = (tok) => GLUE.has(tok) || stems(tok).some(x => mine.has(x));

  const pool = [];
  for (const r of content.rules || []) {
    for (const [en, ru] of [[r.en_example, r.ru_example], [r.en_example2, r.ru_example2]]) {
      if (!en || !ru) continue;
      const toks = words(en);
      if (toks.length < 3) continue;
      if (!toks.every(ok)) continue;
      // Сколько в предложении СВОИХ слов, а не общего клея: чем
      // больше, тем весомее доказательство.
      const own = toks.filter(x => !GLUE.has(x)).length;
      if (own < 1) continue;
      pool.push({ en, ru, own, len: toks.length, ruleId: r.id, title: r.title });
    }
  }
  if (!pool.length) return null;

  pool.sort((a, b) => (b.own - a.own) || (b.len - a.len) || (a.en < b.en ? -1 : 1));
  // Из лучшей десятки берём по дню: разворот меняется, но остаётся
  // одинаковым в течение суток.
  const top = pool.slice(0, 10);
  return top[day % top.length];
}
