/* Дневные челленджи и рекомендованные действия.
 *
 * Чистый модуль: про DOM и хранилище не знает.
 *
 * Три правила, которые здесь соблюдаются буквально:
 *  — невыполнение не имеет последствий, ничего не сгорает и не отнимается;
 *  — прогресс считается из уже собранных данных, а не назначается;
 *  — один из трёх челленджей дня всегда выполним любым режимом, иначе
 *    он превращается в предписание, чем именно заниматься.
 */

export const QUEST_POOL = [
  { id: 'warmup',   icon: '🔥', title: 'Разогрев',            need: 1,  gems: 10, unit: 'sessions',  any: true,
    hint: 'Один заход, любой' },
  { id: 'hundred',  icon: '💯', title: 'Сотня',                need: 100, gems: 15, unit: 'xp',      any: true,
    hint: 'Сто очков за день' },
  { id: 'twohund',  icon: '🚀', title: 'Двести',               need: 200, gems: 25, unit: 'xp',      any: true,
    hint: 'Двести очков за день' },
  { id: 'evening',  icon: '🌙', title: 'Вернуться вечером',    need: 2,  gems: 25, unit: 'sessions', any: true,
    hint: 'Два захода за день' },
  { id: 'fiveMin',  icon: '⏱', title: 'Пять минут',           need: 5,  gems: 15, unit: 'minutes',  any: true,
    hint: 'Пять минут за день' },
  { id: 'fifteen',  icon: '🕒', title: 'Пятнадцать минут',     need: 15, gems: 30, unit: 'minutes',  any: true,
    hint: 'Пятнадцать минут за день' },
  { id: 'clean',    icon: '🎯', title: 'Чисто',                need: 1,  gems: 20, unit: 'clean',    any: true,
    hint: 'Занятие, где всё сошлось' },
  { id: 'tenNew',   icon: '🌱', title: 'Десять новых',         need: 10, gems: 20, unit: 'newWords',
    hint: 'Десять новых слов' },
  { id: 'listen',   icon: '🎧', title: 'На слух',              need: 1,  gems: 20, unit: 'mode:ether',
    hint: 'Одно занятие в режиме «На слух»' },
  { id: 'build',    icon: '🧱', title: 'Своими руками',        need: 1,  gems: 25, unit: 'mode:phrase',
    hint: 'Собрать одну фразу' },
  { id: 'read',     icon: '👁', title: 'Скорочтение',          need: 1,  gems: 20, unit: 'mode:stream',
    hint: 'Один заход в «Поток»' },
  { id: 'blitz',    icon: '⚡', title: 'Молния',               need: 1,  gems: 15, unit: 'mode:sprint',
    hint: 'Один блиц' },
  { id: 'streak5',  icon: '🎲', title: 'Пять подряд',          need: 5,  gems: 10, unit: 'combo',
    hint: 'Пять верных ответов подряд' },
  { id: 'rules',    icon: '💡', title: 'Прочесть одно совпадение',    need: 1,  gems: 15, unit: 'rules',
    hint: 'Дочитать одно совпадение' },
  { id: 'goal',     icon: '🏁', title: 'Мера дня',         need: 1,  gems: 20, unit: 'goal',     any: true,
    hint: 'Дойти до меры дня' },
];

/** Три челленджа на день, одинаковые в течение суток и разные по дням. */
export function questsForDay(day, goalWords = 10) {
  const any = QUEST_POOL.filter(q => q.any);
  const rest = QUEST_POOL.filter(q => !q.any);
  const pick = (arr, salt) => arr[(Math.abs(day * 7919 + salt * 104729)) % arr.length];

  const first = pick(any, 1);                       // всегда выполним любым режимом
  let second = pick(rest, 2);
  let third = pick(rest, 3);
  if (third.id === second.id) third = rest[(rest.indexOf(third) + 1) % rest.length];

  return [first, second, third].map(q => ({ ...q, need: scaleNeed(q, goalWords) }));
}

/* Пороги привязаны к дневной цели человека, а не к абстрактной норме:
   иначе тот, кто выбрал пять слов в день, никогда не увидит выполненный
   челлендж, а тот, кто выбрал двадцать, закроет их не заметив. */
function scaleNeed(q, goalWords) {
  const k = goalWords / 10;
  if (q.unit === 'xp') return Math.max(40, Math.round(q.need * k / 10) * 10);
  if (q.unit === 'newWords') return Math.max(3, Math.round(q.need * k));
  if (q.unit === 'minutes') return Math.max(3, Math.round(q.need * k));
  return q.need;
}

/** Текущее значение челленджа по данным дня. Ничего не выдумывает. */
export function questProgress(quest, day) {
  if (!day) return 0;
  const u = quest.unit;
  if (u === 'sessions') return day.sessions || 0;
  if (u === 'xp') return day.xp || 0;
  if (u === 'minutes') return Math.floor((day.ms || 0) / 60000);
  if (u === 'newWords') return day.words || 0;
  if (u === 'clean') return day.cleanSessions || 0;
  if (u === 'combo') return day.bestCombo || 0;
  if (u === 'rules') return day.rulesRead || 0;
  if (u === 'goal') return day.goalPaid ? 1 : 0;
  if (u.startsWith('mode:')) return (day.modes && day.modes[u.slice(5)]) || 0;
  return 0;
}

export function questDone(quest, day) {
  return questProgress(quest, day) >= quest.need;
}

/* ── рекомендованные действия ─────────────────────────────────── */

/* Двадцать вещей, которые в приложении можно сделать. Это не задания
   и не обязанности: ничего не сгорает, наград за них нет, они просто
   показывают, что здесь вообще есть. */
/* Двадцать вещей, которые в приложении можно сделать.
 *
 * За часть из них дают алмазы — один раз и только за настоящее
 * действие, а не за открытие экрана. Это не задания и не долг:
 * невыполненное ничего не отнимает и никогда не подсвечивается
 * красным.
 *
 * Поле `done` считает выполнение из состояния там, где это возможно.
 * Где нельзя посчитать честно, отметка ставится по факту перехода.
 */
export const ACTIVITIES = [
  { id: 'a01', icon: '📘', title: 'Стопка слов', sub: 'новые слова и повторение', route: 'session/build',
    gems: 15, done: (s) => Object.values(s.days || {}).some(d => (d.modes || {}).build) },
  { id: 'a02', icon: '⚡', title: 'Блиц на скорость', sub: 'шестьдесят секунд', route: 'session/sprint',
    gems: 15, done: (s) => Object.values(s.days || {}).some(d => (d.modes || {}).sprint) },
  { id: 'a03', icon: '🎧', title: 'Заход на слух', sub: 'слова без написания', route: 'session/ether',
    gems: 20, done: (s) => Object.values(s.days || {}).some(d => (d.modes || {}).ether) },
  { id: 'a04', icon: '🧱', title: 'Собрать фразу', sub: 'слова превращаются в речь', route: 'phrase',
    gems: 25, done: (s) => Object.values(s.days || {}).some(d => (d.modes || {}).phrase) },
  { id: 'a05', icon: '👁', title: 'Поймать чужое слово', sub: 'слова идут сами', route: 'stream',
    gems: 25, done: (s) => Object.values(s.days || {}).some(d => (d.modes || {}).stream) },
  { id: 'a06', icon: '📏', title: 'Пересчитать себя', sub: 'та же проверка, что в первый день', route: 'recheck',
    gems: 40, done: (s) => (s.rechecks || []).length > 0 },
  { id: 'a07', icon: '🔑', title: 'Открыть первый ключ', sub: 'правило вместо слова', route: 'session/build',
    gems: 30, done: (s) => Object.keys(s.keys || {}).length > 0 },
  { id: 'a08', icon: '🙂', title: 'Выбрать себе облик', sub: 'аватар и имя', route: 'profile',
    gems: 15, done: (s) => !!(s.profile.name || (s.profile.avatar && s.profile.avatar.base !== 'b00')) },
  { id: 'a09', icon: '💎', title: 'Купить что-нибудь в лавке', sub: 'алмазы для этого и нужны', route: 'quests', param: 'shop',
    gems: 20, done: (s) => (s.owned || []).length > 0 },
  { id: 'a10', icon: '📶', title: 'Подвинуть сложность', sub: 'под себя, а не под норму', route: 'profile',
    gems: 15, done: (s) => !!s.challenge.manual },
  { id: 'a11', icon: '💡', title: 'Прочесть одно совпадение', sub: 'там, где всё как у нас', route: 'rules',
    gems: 15, done: (s) => Object.keys(s.rulesRead || {}).length > 0 },
  { id: 'a12', icon: '🪤', title: 'Посмотреть двойников', sub: 'слова с двойным дном', route: 'words', param: 'traps',
    gems: 10, done: null },
  { id: 'a13', icon: '🎁', title: 'Позвать своего', sub: 'каждый друг — день заморозки', route: 'profile',
    gems: 30, done: (s) => ((s.referral || {}).friends || []).length > 0 },
  { id: 'a14', icon: '💾', title: 'Сохранить прогресс', sub: 'страховка одним файлом', route: 'profile',
    gems: 20, done: null },
  { id: 'a15', icon: '📲', title: 'Поставить на домашний экран', sub: 'пошаговая инструкция', route: 'install',
    gems: 25, done: (s) => !!(s.flags || {}).installPromptSeen },
  { id: 'a16', icon: '☀️', title: 'Заглянуть в «Сегодня»', sub: 'слово, двойник и совпадение', route: 'today',
    gems: 10, done: (s) => Object.values(s.days || {}).some(d => d.present) },
  { id: 'a17', icon: '📗', title: 'Посмотреть свой словарь', sub: 'всё, что уже твоё', route: 'words',
    gems: 0, done: null },
  { id: 'a18', icon: '🏅', title: 'Проверить медали', sub: 'что уже открыто', route: 'profile',
    gems: 0, done: null },
  { id: 'a19', icon: '🌍', title: 'Сменить язык', sub: 'девятнадцать на выбор', route: 'profile',
    gems: 0, done: null },
  { id: 'a20', icon: '🔊', title: 'Послушать слово дня', sub: 'одно слово, десять секунд', route: 'today',
    gems: 0, done: null },
];

/** Выполнена ли активность: по состоянию, либо по отметке перехода. */
export function activityDone(a, state) {
  if (a.done) return !!a.done(state);
  return !!(state.activitiesDone || {})[a.id];
}

/**
 * Порядок: сначала невыполненное с наградой, дороже сверху, затем
 * невыполненное без награды, затем сделанное. Сделанное не прячем:
 * список выполненного — это тоже улика.
 */
export function sortedActivities(state) {
  const rank = (a) => {
    const done = activityDone(a, state);
    if (done) return 2;
    return a.gems > 0 ? 0 : 1;
  };
  return ACTIVITIES.slice().sort((x, y) => {
    const rx = rank(x), ry = rank(y);
    if (rx !== ry) return rx - ry;
    if (rx === 0) return y.gems - x.gems;
    return 0;
  });
}

/** Сколько алмазов ещё лежит в невыполненных активностях. */
export function activitiesLeft(state) {
  return ACTIVITIES
    .filter(a => a.gems > 0 && !activityDone(a, state))
    .reduce((sum, a) => sum + a.gems, 0);
}

/* ── месяц ────────────────────────────────────────────────────── */

/** Слов освоено за календарный месяц и сколько дней без пропуска. */
export function monthStats(days, today, dayToDate) {
  const now = dayToDate(today);
  const y = now.getFullYear(), m = now.getMonth();
  let words = 0, active = 0, minutes = 0, longest = 0, run = 0;

  const first = new Date(y, m, 1);
  const startDay = today - Math.round((now - first) / 86400000);
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < daysInMonth; i++) {
    const d = days[startDay + i];
    const done = !!(d && d.sessions > 0);
    if (d) { words += d.words || 0; minutes += Math.round((d.ms || 0) / 60000); }
    if (done) { active++; run++; longest = Math.max(longest, run); }
    else if (startDay + i <= today) run = 0;
  }
  return { words, active, minutes, longest, daysInMonth, passed: today - startDay + 1 };
}
