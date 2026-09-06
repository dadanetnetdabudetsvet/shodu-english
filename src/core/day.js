/* Работа с «учебным днём».
 *
 * День заканчивается в 04:00 по локальному времени, а не в полночь:
 * занятие в час ночи должно засчитываться за вчера, иначе человек,
 * который учится перед сном, теряет стрик за собственную аккуратность.
 *
 * Внутри состояния день хранится целым числом — количеством дней от эпохи.
 * Это втрое компактнее миллисекунд в экспорте и не ломается при
 * сравнении дат из разных часовых поясов.
 */

export const DAY_ROLLOVER_HOUR = 4;
const MS_DAY = 86400000;

/** Номер учебного дня для отметки времени. */
export function dayNumber(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(d.getHours() - DAY_ROLLOVER_HOUR);
  // Собираем локальную полночь и делим, чтобы не поймать сдвиг зоны.
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / MS_DAY - local.getTimezoneOffset() / 1440);
}

export function today() { return dayNumber(Date.now()); }

/** Обратно в дату: используется только для подписей на графике. */
export function dayToDate(n) {
  const guess = new Date(n * MS_DAY);
  return new Date(guess.getFullYear(), guess.getMonth(), guess.getDate());
}

/** Сколько миллисекунд осталось до конца учебного дня. */
export function msUntilRollover(ts = Date.now()) {
  const d = new Date(ts);
  const next = new Date(d);
  next.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
  if (next <= d) next.setDate(next.getDate() + 1);
  return next - d;
}

/**
 * Смена часового пояса не должна ни сжигать стрик, ни задваивать день.
 * Правило: если новый номер дня меньше сохранённого, мы улетели назад
 * во времени — держим сохранённый. Прыжок вперёд больше чем на один день
 * при перелёте невозможен, поэтому такой прыжок считаем настоящим.
 */
export function reconcileDay(storedDay, computed = today()) {
  if (storedDay == null) return computed;
  return computed < storedDay ? storedDay : computed;
}

/** Название дня недели для графика: 0 — понедельник. */
export function weekdayIndex(n) {
  const d = dayToDate(n);
  return (d.getDay() + 6) % 7;
}

/* Сокращения дней недели берём у платформы: свой список пришлось бы
   переводить на двадцать языков, а Intl уже знает их все. */
export function weekdayShort(index, lang) {
  const base = new Date(Date.UTC(2024, 0, 1));   // понедельник
  base.setUTCDate(base.getUTCDate() + index);
  try {
    return new Intl.DateTimeFormat(lang || undefined, { weekday: 'short', timeZone: 'UTC' })
      .format(base).replace(/\.$/, '');
  } catch {
    return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][index] || '';
  }
}
