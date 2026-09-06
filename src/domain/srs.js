/* Алгоритм повторений: коробки Лейтнера с фаст-треком.
 *
 * Чистый модуль: не знает про DOM, про хранилище и про время суток.
 * Всё время приходит параметром. Это проверяется грепом на document,
 * window и localStorage.
 *
 * Здесь исправлены девять дефектов, найденных техническим аудитом:
 *  B1 шестая коробка была чёрной дырой: слово, дошедшее до неё, не
 *     попадало в повторение никогда, а функция добора не существовала;
 *  B2 ошибка на новом слове поднимала его в первую коробку, что прямо
 *     противоречит правилу «первый раз не считается»;
 *  B3 повтор ошибочного слова внутри сессии не был реализован, хотя это
 *     самое заметное обещание продукта;
 *  B4 не было дневного бюджета новых слов;
 *  B6 быстрый режим оставлял ноль слотов под повторение;
 *  B7 сортировка по сроку морила голодом слабые слова, а при возврате
 *     после паузы не было потолка долга;
 *  B8 счётчик проблемности не сбрасывался и не имел паузы между показами;
 *  B9 срок хранился в миллисекундах вместо номера учебного дня.
 */

/* Интервалы в днях по коробкам. Нулевая — новое слово, первая — внутри
 * той же сессии, дальше настоящие дни. Шестая больше не терминальная:
 * слово из неё возвращается раз в 35 дней, иначе колода умирает. */
export const BOX_DAYS = [0, 0, 1, 3, 7, 16, 35];
export const MAX_BOX = 6;

export const FAST_MS = 2000;
export const COGNATE_SKIP = 3;
export const LEECH_FAILS = 4;
export const LEECH_REST_DAYS = 2;
export const JITTER = 0.30;

export const ITEMS_PER_SESSION = 20;
export const NEW_PER_SESSION = 6;
export const NEW_PER_DAY = 8;          // дневной бюджет, дефект B4
export const MAX_DUE_DEBT = 24;        // потолок долга после паузы, дефект B7
export const SESSION_RETRY_GAP = 3;    // через сколько заданий вернуть ошибку

/* Состояние одного слова. Хранится плоским массивом, здесь — вид объекта. */
export function newRecord() {
  return {
    box: 0, dueDay: 0, seen: 0, ok: 0, fail: 0,
    streak: 0, failRow: 0, leech: false, lastMs: 0,
    lastDay: 0, prodOk: 0,   // prodOk: верные ответы в продуктивных типах
  };
}

/* ── оценка ответа ─────────────────────────────────────────────── */

/**
 * Правила подъёма и отката.
 * @param {object} rec     состояние слова, мутируется
 * @param {boolean} correct
 * @param {number} elapsedMs время ответа
 * @param {object} opts    { day, mode, exerciseType, boxBefore, isCognate }
 */
export function grade(rec, correct, elapsedMs, opts) {
  const { day, mode, exerciseType } = opts;
  rec.seen++;
  rec.lastMs = elapsedMs;
  rec.lastDay = day;

  const productive = isProductive(exerciseType);

  if (correct) {
    rec.ok++;
    rec.streak++;
    rec.failRow = 0;
    if (productive) rec.prodOk++;

    const fast = elapsedMs < FAST_MS;
    const boxBefore = rec.box;

    if (rec.box === 0) {
      // Фаст-трек когната только по продуктивному ответу.
      // Дефект A2: быстрый выбор из двух — это 50% угадывания,
      // и раздел про механики сам назвал такой сигнал бессодержательным.
      rec.box = (opts.isCognate && fast && productive) ? COGNATE_SKIP : 1;
    } else if (fast && rec.streak >= 2 && productive) {
      rec.box = Math.min(rec.box + 2, MAX_BOX);
    } else {
      rec.box = Math.min(rec.box + 1, MAX_BOX);
    }

    // В спринте выбор из двух вариантов не может двигать слово
    // больше чем на одну ступень.
    if (mode === 'sprint') rec.box = Math.min(rec.box, boxBefore + 1);

  } else {
    rec.fail++;
    rec.streak = 0;
    rec.failRow++;

    if (rec.box === 0) {
      // Дефект B2. Первый раз не считается: слово остаётся новым.
      rec.box = 0;
    } else {
      rec.box = (rec.failRow >= 2) ? 1 : Math.max(1, rec.box - 1);
    }

    // Дефект B8: скользящее окно вместо накопительного счётчика.
    if (rec.failRow >= 2 && recentFailRate(rec) > 0.5 && rec.fail >= LEECH_FAILS) {
      rec.leech = true;
    }
  }

  if (rec.leech && rec.streak >= 2) rec.leech = false;

  rec.dueDay = day + intervalDays(rec.box);
  return rec;
}

function recentFailRate(rec) {
  const total = rec.ok + rec.fail;
  return total === 0 ? 0 : rec.fail / total;
}

/** Интервал с разбросом, чтобы слова не слипались в один день. */
export function intervalDays(box, rnd = Math.random) {
  const base = BOX_DAYS[Math.min(box, MAX_BOX)];
  if (base === 0) return 0;
  return Math.max(1, Math.round(base * (1 - JITTER / 2 + rnd() * JITTER)));
}

/** Продуктивные типы: требуют воспроизведения, а не узнавания. */
export function isProductive(type) {
  return ['type', 'letters', 'audioType', 'stress', 'audioChoice', 'phrase', 'reverse4'].includes(type);
}

/* Статус слова двухступенчатый.
 *
 * Раньше «знаю» требовало сразу и коробки, и продуктивного успеха, а на
 * стартовой планке продуктивных заданий не выдавалось вовсе. В итоге
 * приложение ежедневно сообщало человеку, что он не выучил ничего, —
 * ровно противоположное тому, ради чего оно сделано.
 */

/** Знаю: слово трижды подтверждено и отложено минимум на три дня. */
export function isKnown(rec) {
  return rec.box >= COGNATE_SKIP;
}

/** Знаю твёрдо: сверх того есть успех в задании на воспроизведение. */
export function isKnownFirmly(rec) {
  return rec.box >= COGNATE_SKIP && rec.prodOk >= 1;
}

/** Слово в работе: начато, но ещё не известно. */
export function isLearning(rec) {
  return rec.box > 0 && !isKnown(rec);
}

/* ── сборка сессии ─────────────────────────────────────────────── */

/**
 * @param {Array} pool     [{ id, rec, word }] все доступные слова
 * @param {object} opts    { day, mode, size, newBudget, challengeIndex, rnd }
 */
export function buildSession(pool, opts) {
  const {
    day, mode = 'build', size = ITEMS_PER_SESSION,
    newBudget = NEW_PER_DAY, rnd = Math.random,
  } = opts;

  const newAllowed = mode === 'build' ? Math.min(NEW_PER_SESSION, newBudget) : 0;

  // Просроченные, с квотой по коробкам: слабые не должны голодать.
  // Дефект B7: раньше сортировка по сроку отдавала приоритет старшим.
  const due = pool
    .filter(p => p.rec.box >= 1 && p.rec.dueDay <= day && !restingLeech(p.rec, day))
    .sort((a, b) => (a.rec.box - b.rec.box) || (a.rec.dueDay - b.rec.dueDay));

  const capped = due.slice(0, MAX_DUE_DEBT);   // потолок долга после паузы

  const fresh = pool
    .filter(p => p.rec.box === 0)
    .slice(0, newAllowed);

  // Новое слово занимает два слота: показ и две проверки.
  // Дефект B6: раньше при десяти новых слотов оставалось ноль.
  const reviewSlots = Math.max(4, size - fresh.length * 2);
  let queue = interleave(fresh, capped.slice(0, reviewSlots), rnd);

  // Дефект B1: добор определён явно, а не упомянут.
  if (queue.length < 10) {
    queue = queue.concat(maintenance(pool, 10 - queue.length, day, queue));
  }
  return queue;
}

/** Слово-проблема отдыхает между показами. Дефект B8. */
function restingLeech(rec, day) {
  return rec.leech && (day - rec.lastDay) < LEECH_REST_DAYS;
}

/**
 * Добор, когда повторять нечего. Берём самые давно не виденные из старших
 * коробок. Такой показ не штрафует слово: он не считается просрочкой.
 */
export function maintenance(pool, count, day, exclude = []) {
  const used = new Set(exclude.map(x => x.id));
  return pool
    .filter(p => p.rec.box >= 1 && !used.has(p.id))
    .sort((a, b) => (a.rec.lastDay - b.rec.lastDay))
    .slice(0, count)
    .map(p => ({ ...p, maintenance: true }));
}

/**
 * Вплетение нового: пачками по три-четыре, а не по одному.
 * Первая проверка не раньше чем через два элемента и не позже чем через шесть.
 */
export function interleave(fresh, due, rnd = Math.random) {
  const out = [];
  const freshQueue = fresh.slice();
  const dueQueue = due.slice();

  while (freshQueue.length || dueQueue.length) {
    const batch = freshQueue.splice(0, 3);
    for (const f of batch) out.push({ ...f, phase: 'teach' });
    // Проверки новых слов вперемешку с повторениями.
    const checks = batch.map(f => ({ ...f, phase: 'check' }));
    const chunk = dueQueue.splice(0, Math.max(2, Math.min(7, dueQueue.length)));
    const mixed = chunk.concat(checks);
    shuffle(mixed, rnd);
    out.push(...mixed);
    if (!freshQueue.length && dueQueue.length) {
      out.push(...dueQueue.splice(0, dueQueue.length));
    }
  }
  return out;
}

function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ── живая очередь ─────────────────────────────────────────────── */

/**
 * Очередь сессии изменяема: ошибочное слово возвращается через три задания.
 * Дефект B3: раньше очередь строилась один раз и обещание не выполнялось.
 */
export class SessionQueue {
  constructor(items) {
    this.items = items.slice();
    this.pos = 0;
    this.retries = new Set();
    // Знаменатель фиксируется на старте: повтор ошибочного слова не должен
    // отодвигать финиш. Иначе ошибка выглядит как наказание длиной сессии.
    this.plannedTotal = items.length;
  }
  get current() { return this.items[this.pos] || null; }
  get total() { return this.plannedTotal; }
  get realTotal() { return this.items.length; }
  get done() { return this.pos >= this.items.length; }
  get shownIndex() { return Math.min(this.pos + 1, this.plannedTotal); }

  advance() { this.pos++; return this.current; }

  /** Вставить слово на повтор через SESSION_RETRY_GAP заданий. */
  scheduleRetry(item) {
    if (this.retries.has(item.id)) return;   // не больше одного возврата
    this.retries.add(item.id);
    const at = Math.min(this.items.length, this.pos + SESSION_RETRY_GAP + 1);
    this.items.splice(at, 0, { ...item, phase: 'retry' });
  }
}
