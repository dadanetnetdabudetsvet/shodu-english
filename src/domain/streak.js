/* Стрик, ритм недели и жизни.
 *
 * Правило Р2: проиграть за один день невозможно.
 * Стрик не обнуляется раньше семи подряд пропущенных дней. Ноль на
 * счётчике не показывается никогда. Заморозка при угрозе стрику
 * выдаётся бесплатно и безусловно, независимо от баланса.
 *
 * Главная метрика на экране — не стрик, а ритм недели: четыре дня
 * из семи. Стрик стоит рядом мельче.
 */

export const GRACE_DAYS = 7;          // после скольких пропусков мягкий рестарт
export const WEEK_TARGET = 4;         // порог ритма недели: 4 из 7
export const FREEZE_EARN_EVERY = 7;   // бесплатная заморозка за каждые 7 активных дней
export const MAX_FREEZES = 2;

/**
 * Пересчёт стрика при заходе в приложение.
 * @param {object} st { current, best, lastDay, freezes, pausedDays }
 * @param {number} day текущий учебный день
 * @returns {{ streak: object, events: Array }}
 */
export function refreshStreak(st, day) {
  const events = [];
  const s = { ...st };
  if (s.lastDay == null) return { streak: s, events };

  const gap = day - s.lastDay;
  if (gap <= 0) return { streak: s, events };
  if (gap === 1) return { streak: s, events };   // вчера занимались, всё цело

  const missed = gap - 1;

  // Заморозки тратятся по одной за пропущенный день, но с уведомлением,
  // а не молча: молчаливая трата валюты запрещена правилом Р6.
  let covered = 0;
  while (covered < missed && s.freezes > 0) { s.freezes--; covered++; }
  if (covered > 0) {
    // Закрытые заморозкой дни считаются прожитыми, иначе следующий
    // заход увидит тот же разрыв и спишет заморозку повторно.
    s.lastDay += covered;
    events.push({ type: 'freezeUsed', count: covered });
  }

  const uncovered = missed - covered;
  if (uncovered <= 0) return { streak: s, events };

  if (uncovered < GRACE_DAYS) {
    // Пауза: стрик не растёт, но и не горит.
    s.pausedDays = uncovered;
    events.push({ type: 'paused', days: uncovered });
    return { streak: s, events };
  }

  // Мягкий рестарт. Лучший результат остаётся навсегда.
  s.best = Math.max(s.best || 0, s.current || 0);
  s.current = 0;
  s.pausedDays = 0;
  events.push({ type: 'softRestart', best: s.best });
  return { streak: s, events };
}

/** Засчитать день после завершённого занятия. */
export function completeDay(st, day) {
  const s = { ...st };
  const events = [];
  if (s.lastDay === day) return { streak: s, events };   // уже засчитан

  const continued = s.lastDay != null && (day - s.lastDay === 1 || s.pausedDays > 0);
  s.current = continued ? (s.current || 0) + 1 : 1;
  s.pausedDays = 0;
  s.lastDay = day;
  s.best = Math.max(s.best || 0, s.current);

  if (s.current % FREEZE_EARN_EVERY === 0 && s.freezes < MAX_FREEZES) {
    s.freezes++;
    events.push({ type: 'freezeEarned', total: s.freezes });
  }
  events.push({ type: 'dayCounted', streak: s.current });
  return { streak: s, events };
}

/**
 * Заморозка при угрозе стрику выдаётся бесплатно и безусловно.
 * Дефект A17: прежнее правило «только при балансе меньше 150»
 * наказывало ровно за то поведение, которое продукт поощряет.
 */
export function grantEmergencyFreeze(st) {
  if (st.freezes >= MAX_FREEZES) return st;
  return { ...st, freezes: st.freezes + 1 };
}

/** Ритм недели: массив из семи состояний, последний элемент — сегодня. */
export function weekRhythm(days, today) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = today - i;
    const rec = days[d];
    out.push({
      day: d,
      done: !!(rec && rec.sessions > 0),
      isToday: i === 0,
    });
  }
  return out;
}

export function weekDone(days, today) {
  return weekRhythm(days, today).filter(d => d.done).length;
}

export function weekGoalMet(days, today) {
  return weekDone(days, today) >= WEEK_TARGET;
}

/* ── жизни ─────────────────────────────────────────────────────── */

export const MAX_LIVES = 2;
export const LIFE_REGEN_HOURS = 4;
export const KNOWN_THRESHOLD_FOR_LIFE = 3;   // сколько верных до того, как слово начнёт стоить жизни

/**
 * Теряется ли жизнь на этом ответе.
 * Жизни работают только в режиме сборки. В спринте и эфире их нет вовсе.
 * Новое слово никогда не стоит жизни: первый раз это знакомство.
 */
export function costsLife({ mode, rec, usedHint, typoOnly }) {
  if (mode !== 'build') return false;
  if (usedHint || typoOnly) return false;
  return (rec.ok || 0) >= KNOWN_THRESHOLD_FOR_LIFE;
}

export function loseLife(lives, nowMs) {
  if (lives.count <= 0) return lives;
  return { ...lives, count: lives.count - 1, lostAt: nowMs };
}

/** Восстановление по времени: одна жизнь в четыре часа, полностью в 04:00. */
export function regenLives(lives, nowMs, dayChanged) {
  if (dayChanged) return { ...lives, count: MAX_LIVES, lostAt: null };
  if (lives.count >= MAX_LIVES || !lives.lostAt) return lives;
  const hours = (nowMs - lives.lostAt) / 3600000;
  const gained = Math.floor(hours / LIFE_REGEN_HOURS);
  if (gained <= 0) return lives;
  const count = Math.min(MAX_LIVES, lives.count + gained);
  return { ...lives, count, lostAt: count >= MAX_LIVES ? null : nowMs };
}

/** Мягкий режим: не блокировка, а смена типа заданий и множитель очков. */
export function isSoftMode(lives) {
  return lives.count <= 0;
}

/** Щит: ставит вторую жизнь на паузу на сутки. Это и есть «остановить жизнь». */
export function activateShield(lives, nowMs) {
  return { ...lives, shieldUntil: nowMs + 86400000 };
}

export function shieldActive(lives, nowMs) {
  return !!lives.shieldUntil && lives.shieldUntil > nowMs;
}
