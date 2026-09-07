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
    lines.push({ kind: 'topic', text: 'Больше всего у тебя слов про {v0} — {v1}.', vars: { v0: top[0], v1: top[1] } });
  }

  if (!lines.length) return null;
  return lines[Math.abs(state.day * 2654435761) % lines.length];
}
