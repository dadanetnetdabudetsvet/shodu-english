/* Медали. Двенадцать штук, все достижимые на текущем объёме контента.
 *
 * Условия проверены против реального словаря: 200 когнатов, 120
 * служебных слов, 30 ложных друзей. Медали за тысячу слов и подобные
 * убраны: показывать закрытую награду с недостижимым условием значит
 * сообщать человеку о его недостаточности, что запрещено правилами.
 *
 * «Разбор» обязателен: это единственная медаль, делающая ошибку
 * валютой достижения. «Феникс» тоже: это единственная награда за
 * возвращение после провала.
 */

export const MEDALS = [
  { id: 'first_word', icon: '🌱', name: 'Первое слово', hint: 'Один верный ответ', gems: 10,
    check: (c) => c.answersCorrect >= 1 },
  { id: 'debut', icon: '🎬', name: 'Дебют', hint: 'Первое занятие целиком', gems: 20,
    check: (c) => c.sessions >= 1 },
  { id: 'five', icon: '🖐', name: 'Пятёрка', hint: 'Пять слов в копилке', gems: 20,
    check: (c) => c.known >= 5 },
  { id: 'three_days', icon: '🔥', name: 'Три дня', hint: 'Три дня подряд', gems: 30,
    check: (c) => c.streakBest >= 3 },
  { id: 'week', icon: '📅', name: 'Неделя', hint: 'Семь дней подряд', gems: 60,
    check: (c) => c.streakBest >= 7 },
  { id: 'rhythm', icon: '🧘', name: 'Ритм', hint: 'Четыре дня из семи', gems: 40,
    check: (c) => c.weekBest >= 4 },
  { id: 'fifty', icon: '📗', name: 'Полсотни', hint: 'Пятьдесят слов знаю', gems: 50,
    check: (c) => c.known >= 50 },
  { id: 'two_hundred', icon: '📚', name: 'Двести', hint: 'Двести слов знаю', gems: 150,
    check: (c) => c.known >= 200 },
  { id: 'clean', icon: '🎯', name: 'Чистое занятие', hint: 'Занятие без единой ошибки', gems: 40,
    check: (c) => c.cleanSessions >= 1 },
  // Ошибка как валюта достижения.
  { id: 'review', icon: '🛠', name: 'Разбор', hint: 'Пятьдесят исправленных ошибок', gems: 80,
    check: (c) => c.corrected >= 50 },
  { id: 'traps', icon: '🪤', name: 'Не попался', hint: 'Десять ложных друзей выучено', gems: 60,
    check: (c) => c.trapsKnown >= 10 },
  { id: 'first_friend', icon: '🤝', name: 'Первый друг', hint: 'Позвать и зачесть одного друга', gems: 50,
    check: (c) => c.friends >= 1 },
  { id: 'company', icon: '🎪', name: 'Компания', hint: 'Трое друзей рядом', gems: 100,
    check: (c) => c.friends >= 3 },
  // Награда за возвращение после провала.
  { id: 'phoenix', icon: '🎭', name: 'Феникс', hint: 'Вернуться после долгого перерыва', gems: 150,
    secret: true, check: (c) => c.returnedAfter >= 30 },
];

/** Проверить и выдать новые медали. Чистая функция. */
export function evaluateMedals(counters, earned = {}) {
  const fresh = [];
  for (const m of MEDALS) {
    if (earned[m.id]) continue;
    if (m.check(counters)) fresh.push(m);
  }
  return fresh;
}

/** Следующая ступень: подпись «до медали столько-то» работает сильнее самой медали. */
export function nextMedal(counters, earned = {}) {
  return MEDALS.find(m => !earned[m.id] && !m.secret) || null;
}
