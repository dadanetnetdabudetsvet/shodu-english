/* Сложность: шкала 0–30, которой человек управляет голосом
 * после занятия или вручную в настройках.
 *
 * Чистый модуль. Про DOM и хранилище не знает.
 *
 * Главное решение: сложность не влияет ни на награды, ни на стрик, ни на
 * жизни. Иначе она превратится в способ фармить XP на низкой сложности,
 * и выбор будет диктоваться выгодой, а не пользой. По той же причине она
 * не показывается как уровень игрока: уровень отражает пройденный путь,
 * сложность — текущую настройку, и при смешении низкая сложность начнёт
 * читаться как низкий статус.
 */

export const MIN_INDEX = 0;
export const MAX_INDEX = 30;
export const DEFAULT_INDEX = 8;
export const MAX_CHANGE_PER_DAY = 3;
export const MANUAL_HOLD_DAYS = 3;
export const BAND_WIDTH = 0.34;
export const BAND_MIN_ITEMS = 12;

export const TIERS = [
  { from: 0,  to: 5,  name: 'Самое своё', desc: 'Только самые знакомые слова, выбор из двух вариантов.' },
  { from: 6,  to: 12, name: 'Спокойно', desc: 'Знакомые слова, узнавание и выбор из четырёх.' },
  { from: 13, to: 19, name: 'Ровно',  desc: 'Добавляются сборка из букв и аудирование.' },
  { from: 20, to: 25, name: 'Плотно',   desc: 'Добавляются ручной ввод и ударения.' },
  { from: 26, to: 30, name: 'Во весь рост',    desc: 'Ложные друзья, служебные слова, ввод преобладает.' },
];

export function tierOf(index) {
  return TIERS.find(t => index >= t.from && index <= t.to) || TIERS[0];
}

export function clampIndex(v) {
  return Math.max(MIN_INDEX, Math.min(MAX_INDEX, Math.round(v)));
}

/* ── сложность слова ───────────────────────────────────────────── */

/**
 * Композитная сложность от 0 до 1.
 * Личная доля ошибок весит столько же, сколько формальная близость
 * к русскому: продукт обещает подстраиваться под конкретного человека.
 */
export function difficulty(word, rec) {
  const tierNorm = ((word.tier || 1) - 1) / 3;

  // Сглаживание Лапласа: у нового слова нет истории, поэтому оно
  // наследует ожидание от своего тира, а не считается лёгким.
  const prior = 0.12 + 0.16 * tierNorm;
  const PRIOR_WEIGHT = 4;
  const seen = (rec?.ok || 0) + (rec?.fail || 0);
  const personal = ((rec?.fail || 0) + prior * PRIOR_WEIGHT) / (seen + PRIOR_WEIGHT);

  const form = Math.min(1,
      (word.stressShift ? 0.4 : 0)
    + (word.syllableDrop ? 0.3 : 0)
    + (word.spellingTrap ? 0.2 : 0)
    + (word.falseFriend ? 0.5 : 0));

  return 0.40 * tierNorm + 0.40 * personal + 0.20 * form;
}

/* ── подбор по планке ──────────────────────────────────────────── */

/**
 * Сложность задаёт не порог, а полосу в распределении сложности.
 * Полоса, а не порог, потому что занятие целиком из слов одной
 * трудности утомляет: внутри полосы всегда есть и то, что даётся
 * сразу, и то, что требует усилия.
 *
 * @param {Array} pool [{ id, word, rec }]
 */
export function selectByChallenge(pool, index) {
  if (!pool.length) return [];
  const ranked = pool
    .map(p => ({ ...p, d: difficulty(p.word, p.rec) }))
    .sort((a, b) => a.d - b.d);

  const center = index / MAX_INDEX;
  let width = BAND_WIDTH;
  let band = pickBand(ranked, center, width);

  // Если в полосе мало слов, она расширяется, а не сдвигается:
  // сдвиг сломал бы обещание планки, расширение только смягчает его.
  while (band.length < Math.min(BAND_MIN_ITEMS, ranked.length) && width < 1) {
    width += 0.12;
    band = pickBand(ranked, center, width);
  }
  return band;
}

function pickBand(ranked, center, width) {
  const n = ranked.length;
  const lo = Math.max(0, Math.floor((center - width / 2) * n));
  const hi = Math.min(n, Math.ceil((center + width / 2) * n));
  return ranked.slice(lo, Math.max(lo + 1, hi));
}

/* ── изменение планки ──────────────────────────────────────────── */

export const VOTE_DELTA = { easy: +2, normal: 0, hard: -2 };

/* Длина занятия. Отдельная ручка от сложности: одному тяжело от
 * трудных слов, другому — от того, что занятие не кончается. Смешивать
 * их значит чинить не то.
 *
 * Голос после занятия двигает обе, но длину мягче: заметить лишние два
 * задания легче, чем более трудное слово, и резкий скачок читается как
 * наказание за честный ответ.
 */
/* Обычные границы ручки. Абсолютные шире: «Сходу Всё» открывает
   от пяти до сорока, и зажим ниже не должен это срезать. */
export const SIZE_MIN = 8;
export const SIZE_MAX = 30;
export const SIZE_HARD_MIN = 5;
export const SIZE_HARD_MAX = 40;
export const SIZE_DEFAULT = 18;
export const SIZE_VOTE_DELTA = { easy: +2, normal: 0, hard: -3 };

export function clampSize(v) {
  return Math.max(SIZE_HARD_MIN, Math.min(SIZE_HARD_MAX, Math.round(v)));
}

export function sizeLabel(n) {
  if (n <= 11) return 'короткое';
  if (n <= 16) return 'спокойное';
  if (n <= 22) return 'обычное';
  return 'длинное';
}

/** Примерная длительность занятия: человеку нужно время, а не число. */
export function sizeMinutes(n) {
  return Math.max(1, Math.round(n * 0.16));
}

export const VOTE_REPLY = {
  easy: 'Поднимаю сложность. Следующее занятие будет поинтереснее.',
  normal: 'Оставляю как есть.',
  hard: 'Подберу слова поспокойнее.',
};

/**
 * Применить голос человека. Голос главнее автоматики.
 * @param {object} ch состояние планки
 * @param {'easy'|'normal'|'hard'} vote
 * @param {number} day номер учебного дня
 */
export function applyVote(ch, vote, day) {
  const delta = VOTE_DELTA[vote] ?? 0;
  const next = applyDelta(ch, delta, day);
  // Длина занятия двигается тем же голосом, но мягче и только если
  // человек не задал её вручную.
  if (!ch.sizeManual) {
    next.size = clampSize((ch.size ?? SIZE_DEFAULT) + (SIZE_VOTE_DELTA[vote] ?? 0));
  }
  next.votes = [...(ch.votes || []), { day, vote }].slice(-20);
  return next;
}

/** Ручная установка длины. Автоматика после неё молчит трое суток. */
export function setSize(ch, size, day) {
  return {
    ...ch,
    size: clampSize(size),
    sizeManual: true,
    sizeManualUntil: day + MANUAL_HOLD_DAYS,
  };
}

/**
 * Автоматическая подстройка. Работает только когда голоса нет
 * и только на один шаг.
 * @param {object} stats { answered, correctFirstTry, medianAnswerMs }
 */
export function autoAdjust(ch, stats, day) {
  if (!ch.autoAdjust) return ch;
  if (ch.manual && ch.manualUntil != null && day < ch.manualUntil) return ch;
  if (!stats.answered) return ch;

  const share = stats.correctFirstTry / stats.answered;
  let delta = 0;
  if (share >= 0.92 && stats.medianAnswerMs < 2200) delta = +1;
  else if (share <= 0.55) delta = -1;
  if (!delta) return ch;

  // После понижения сложность не поднимается автоматически в течение суток:
  // человеку, которому было тяжело, не поднимают нагрузку через полчаса.
  if (delta > 0 && ch.loweredDay != null && day - ch.loweredDay < 1) return ch;

  return applyDelta(ch, delta, day);
}

function applyDelta(ch, delta, day) {
  const sameDay = ch.lastChangeDay === day;
  const used = sameDay ? (ch.changedToday || 0) : 0;
  const room = MAX_CHANGE_PER_DAY - used;
  if (room <= 0 || delta === 0) {
    return { ...ch, lastChangeDay: day, changedToday: used };
  }
  const applied = Math.sign(delta) * Math.min(Math.abs(delta), room);
  const index = clampIndex((ch.index ?? DEFAULT_INDEX) + applied);
  return {
    ...ch,
    index,
    lastChangeDay: day,
    changedToday: used + Math.abs(applied),
    loweredDay: applied < 0 ? day : ch.loweredDay ?? null,
  };
}

/** Ручная установка из настроек. Автоматика молчит три дня. */
export function setManual(ch, index, day) {
  return {
    ...ch,
    index: clampIndex(index),
    manual: true,
    manualUntil: day + MANUAL_HOLD_DAYS,
    lastChangeDay: day,
    changedToday: 0,
  };
}

/** Какие типы заданий разрешает текущая сложность. */
export function allowedExerciseTypes(index) {
  const types = ['choice2'];
  // reverse4 — это вспоминание с русского на английский, то есть настоящее
  // воспроизведение. Раньше он открывался только с планки 10, из-за чего
  // на стартовой планке 8 не было ни одного продуктивного задания и
  // счётчик знакомых слов не двигался никогда.
  if (index >= 3) types.push('choice4', 'pair', 'trueFalse', 'reverse4');
  if (index >= 10) types.push('missingLetter', 'audioChoice');
  if (index >= 13) types.push('letters', 'phrase', 'stress');
  if (index >= 20) types.push('type');
  if (index >= 24) types.push('audioType');
  return types;
}

/** Какие источники контента подключены на этой планке. */
/**
 * Какие источники контента подключены на этой сложности.
 *
 * Пересчитано под базу в тысячу слов. Раньше пятьсот слов из общих
 * колод открывались только на сложности 22, до которой автоматика
 * доводит месяцами: человек упирался в потолок из трёхсот пятидесяти
 * слов и получал предложение поднять сложность вручную.
 */
export function allowedSources(index) {
  const src = ['deck1'];                 // самые узнаваемые когнаты
  if (index >= 10) src.push('tier34');   // дальние когнаты
  if (index >= 12) src.push('deck2');    // служебные слова, без них нет фраз
  if (index >= 14) src.push('general');  // глаголы, признаки, обычные существительные
  if (index >= 18) src.push('falseFriends');
  return src;
}

