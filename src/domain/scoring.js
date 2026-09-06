/* Начисление очков и алмазов.
 *
 * Единственный источник истины для XP — таблица режимов. Канон «10 очков
 * за верный ответ» из мотивационного раздела удалён: он расходился с
 * режимами в два с половиной раза и ломал калибровку уровней.
 *
 * Дневная цель измеряется в СЛОВАХ. Не в очках, не в минутах, не в
 * сессиях. Очки и минуты показываются как следствие, а не как цель.
 */

/* ── XP за ответ ───────────────────────────────────────────────── */

export const MODE_XP = {
  sprint: { correct: 2, streakBonus: 5, streakEvery: 5, record: 20 },
  build:  { firstTry: 8, secondTry: 4 },
  ether:  { firstListen: 4, laterListen: 2, aloud: 6, cleanBonus: 10 },
};

/** Очки за один ответ. Ошибка не отнимает никогда. */
export function answerXp(mode, ctx) {
  if (mode === 'sprint') {
    if (!ctx.correct) return 0;
    let xp = MODE_XP.sprint.correct;
    if (ctx.comboAfter > 0 && ctx.comboAfter % MODE_XP.sprint.streakEvery === 0) {
      xp += MODE_XP.sprint.streakBonus;
    }
    return xp;
  }
  if (mode === 'build') {
    if (!ctx.correct) return 0;
    return ctx.attempt <= 1 ? MODE_XP.build.firstTry : MODE_XP.build.secondTry;
  }
  if (mode === 'ether') {
    if (!ctx.correct) return 0;
    if (ctx.exerciseType === 'aloud') return MODE_XP.ether.aloud;
    return ctx.listens <= 1 ? MODE_XP.ether.firstListen : MODE_XP.ether.laterListen;
  }
  return 0;
}

/* ── бонусы за сессию ──────────────────────────────────────────── */

export const SESSION_BONUS = {
  completed: 20,
  flawless: 10,
  firstOfDay: 10,
  secondOfDay: 15,
  thirdPlusOfDay: 5,
  review: 25,          // сессия «Разбор»
};

export function sessionBonusXp({ mode, completed, mistakes, sessionsToday, isReview, newRecord }) {
  let xp = 0;
  if (!completed) return 0;                     // прогресс частичный сохраняется, бонус нет
  xp += SESSION_BONUS.completed;
  if (mistakes === 0) xp += SESSION_BONUS.flawless;
  if (mode === 'ether' && mistakes === 0) xp += MODE_XP.ether.cleanBonus;
  if (mode === 'sprint' && newRecord) xp += MODE_XP.sprint.record;
  if (isReview) xp += SESSION_BONUS.review;

  const n = sessionsToday;                      // считая текущую
  if (n === 1) xp += SESSION_BONUS.firstOfDay;
  else if (n === 2) xp += SESSION_BONUS.secondOfDay;
  else xp += SESSION_BONUS.thirdPlusOfDay;

  return xp;
}

/** Мягкий режим при нуле жизней: множитель, но не блокировка. */
export const SOFT_MODE_XP_FACTOR = 0.75;

/* ── алмазы ────────────────────────────────────────────────────── */

export const GEMS = {
  dailyGoal: 20,
  questSmall: 10,
  questMid: 15,
  questBig: 25,
  levelUp: 25,
  softCapPerDay: 120,
};

export const STREAK_MILESTONES = [
  { day: 3,   gems: 30,  freezes: 0 },
  { day: 7,   gems: 50,  freezes: 1 },
  { day: 14,  gems: 80,  freezes: 0 },
  { day: 30,  gems: 150, freezes: 2 },
  { day: 60,  gems: 250, freezes: 0 },
  { day: 100, gems: 500, freezes: 1 },
];

export function milestoneFor(streakDay) {
  const exact = STREAK_MILESTONES.find(m => m.day === streakDay);
  if (exact) return exact;
  // Дальше каждые сто дней. Принцип: чем длиннее стрик, тем больше
  // бесплатной защиты, иначе тревога растёт вместе с ценностью.
  if (streakDay > 100 && streakDay % 100 === 0) return { day: streakDay, gems: 500, freezes: 1 };
  return null;
}

/* ── уровни ────────────────────────────────────────────────────── */

/* Пороги пересчитаны под реальные очки режимов. Типовая сессия даёт
 * 60–100 очков, дневная связка из трёх режимов около 180–220.
 * Первый уровень берётся в первый же день, десятый примерно за месяц.
 * После тридцатого шаг плоский: отказ от экспоненты и есть отсутствие стены. */
export function levelStep(level) {
  if (level <= 9) return Math.round((60 + 40 * Math.pow(level, 1.35)) / 10) * 10;
  return Math.min(900 + 30 * (level - 10), 1500);
}

export function levelThresholds(count = 60) {
  const out = [0];
  let total = 0;
  for (let l = 1; l <= count; l++) { total += levelStep(l); out.push(total); }
  return out;
}

const THRESHOLDS = levelThresholds(80);

export function levelForXp(xp) {
  let l = 1;
  while (l < THRESHOLDS.length - 1 && xp >= THRESHOLDS[l]) l++;
  return l;
}

export function levelProgress(xp) {
  const level = levelForXp(xp);
  const from = THRESHOLDS[level - 1];
  const to = THRESHOLDS[level];
  return { level, from, to, inLevel: xp - from, needed: to - from, ratio: (xp - from) / (to - from) };
}

/* Грейды. Только первые четыре: остальные обещали бы то, чего контент
 * пока не даёт. Они появятся вместе со словарём. */
export const GRADES = [
  { from: 1, to: 2,  name: 'Начало',      line: 'Вы уже внутри' },
  { from: 3, to: 4,  name: 'Узнающий',    line: 'Слова перестают быть чужими' },
  { from: 5, to: 7,  name: 'Читающий',    line: 'Текст перестал быть шумом' },
  { from: 8, to: 10, name: 'Понимающий',  line: 'Смысл приходит раньше перевода' },
];

export function gradeForLevel(level) {
  return GRADES.find(g => level >= g.from && level <= g.to) || GRADES[GRADES.length - 1];
}
