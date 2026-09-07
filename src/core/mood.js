/* Настроение приложения.
 *
 * Подстраивается ТОН, а не сложность. Сложность человек двигает сам,
 * и трогать её без спроса значит решать за него. Тон — другое дело:
 * в одиннадцать вечера яркая заливка и конфетти читаются как давление,
 * даже если человек рад.
 *
 * Чистый модуль: время приходит параметром, состояние только читается.
 */

export const MOODS = {
  morning: {
    id: 'morning', name: 'Разгон',
    chain: ['sprint', 'build', 'ether'],
    soundGain: 1.0, confetti: true, dark: null,
    line: 'Утро. Пара минут — и день уже не пустой.',
  },
  day: {
    id: 'day', name: 'Обычный',
    chain: ['sprint', 'build', 'phrase'],
    soundGain: 1.0, confetti: true, dark: null,
    line: '',
  },
  evening: {
    id: 'evening', name: 'Тихий',
    chain: ['ether', 'build', 'phrase'],
    soundGain: 0.6, confetti: false, dark: true,
    line: 'Вечер. Можно просто послушать, как это звучит.',
  },
  night: {
    id: 'night', name: 'Ночной',
    chain: ['ether', 'stream'],
    soundGain: 0.45, confetti: false, dark: true, noNewWords: true, hideNumbers: true,
    line: 'Поздно. Давай просто посмотрим.',
  },
};

/** Настроение по времени суток. Ручной выбор человека главнее. */
export function moodFor(date = new Date(), manual = null) {
  if (manual && MOODS[manual]) return MOODS[manual];
  const h = date.getHours();
  if (h >= 23 || h < 5) return MOODS.night;
  if (h >= 18) return MOODS.evening;
  if (h < 11) return MOODS.morning;
  return MOODS.day;
}

/* Ручной выбор состояния. «Тяжело» меняет СОСТАВ занятия, а не планку:
   человеку не сообщают, что ему что-то упростили. */
export const MANUAL = [
  { id: 'easy',   icon: '☕️', title: 'Тяжело',     sub: 'спокойно и без новых слов' },
  { id: 'normal', icon: '🙂', title: 'Как обычно',  sub: 'ничего не меняем' },
  { id: 'brisk',  icon: '⚡️', title: 'Бодро',      sub: 'быстрее и плотнее' },
];

export function applyManual(mood, choice) {
  if (choice === 'easy') return { ...mood, noNewWords: true, confetti: false, soundGain: mood.soundGain * 0.7 };
  if (choice === 'brisk') return { ...mood, chain: ['sprint', 'build', 'stream'], soundGain: 1 };
  return mood;
}
