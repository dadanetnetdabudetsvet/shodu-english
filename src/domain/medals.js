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
  { id: 'first_word', icon: '🌱', name: 'Первое своё', hint: 'Один верный ответ', gems: 10,
    check: (c) => c.answersCorrect >= 1 },
  { id: 'debut', icon: '🎬', name: 'Первый заход', hint: 'Первый заход до конца', gems: 20,
    check: (c) => c.sessions >= 1 },
  { id: 'five', icon: '🖐', name: 'Первая горсть', hint: 'Пять слов читаешь без перевода', gems: 20,
    check: (c) => c.known >= 5 },
  { id: 'three_days', icon: '🔥', name: 'Три дня', hint: 'Три дня подряд', gems: 30,
    check: (c) => c.streakBest >= 3 },
  { id: 'week', icon: '📅', name: 'Неделя', hint: 'Семь дней подряд', gems: 60,
    check: (c) => c.streakBest >= 7 },
  { id: 'rhythm', icon: '🧘', name: 'Ритм', hint: 'Четыре дня из семи', gems: 40,
    check: (c) => c.weekBest >= 4 },
  { id: 'fifty', icon: '📗', name: 'Полсотни', hint: 'Полсотни слов без перевода', gems: 50,
    check: (c) => c.known >= 50 },
  { id: 'two_hundred', icon: '📚', name: 'Двести', hint: 'Двести слов читаешь как русские', gems: 150,
    check: (c) => c.known >= 200 },
  { id: 'clean', icon: '🎯', name: 'Без единой заминки', hint: 'Стопка, где ты не запнулся ни разу', gems: 40,
    check: (c) => c.cleanSessions >= 1 },
  // Ошибка как валюта достижения.
  { id: 'review', icon: '🛠', name: 'Упрямые слова', hint: 'Пятьдесят слов, которые сначала не дались', gems: 80,
    check: (c) => c.corrected >= 50 },
  { id: 'traps', icon: '🪤', name: 'Вижу двойников', hint: 'Десять двойников теперь узнаёшь', gems: 60,
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

/* Следующая ступень: подпись «до медали столько-то» работает сильнее
 * самой медали. Берём БЛИЖАЙШУЮ к выполнению, а не первую по порядку:
 * иначе человек с двадцатидневным ритмом месяцами видит «Пятёрка — пять
 * слов в копилке» и перестаёт замечать блок целиком. */
export function nextMedal(counters, earned = {}) {
  const open = MEDALS.filter(m => !earned[m.id] && !m.secret);
  if (!open.length) return null;
  const scored = open.map(m => ({ m, p: progressOf(m, counters) }));
  scored.sort((a, b) => b.p - a.p);
  return scored[0].m;
}

/** Грубая доля выполнения: нужна только для выбора ближайшей медали. */
function progressOf(medal, c) {
  const probe = { ...c };
  const fields = ['answersCorrect', 'sessions', 'known', 'streakBest', 'weekBest',
                  'cleanSessions', 'corrected', 'trapsKnown', 'friends', 'returnedAfter'];
  let best = 0;
  for (const f of fields) {
    const have = probe[f] || 0;
    if (!have) continue;
    // Подбираем минимальный порог, при котором условие выполняется.
    let lo = 1, hi = Math.max(2, have * 40), need = null;
    for (let i = 0; i < 22; i++) {
      const mid = Math.ceil((lo + hi) / 2);
      if (medal.check({ ...probe, [f]: mid }) && !medal.check({ ...probe, [f]: 0 })) { need = mid; hi = mid - 1; }
      else lo = mid + 1;
      if (lo > hi) break;
    }
    if (need) best = Math.max(best, Math.min(1, have / need));
  }
  return best;
}

/** Медали, которые имеет смысл показывать: близкие, а не любые. */
export function visibleMedals(counters, earned = {}) {
  return MEDALS.filter(m => earned[m.id] || (!m.secret && progressOf(m, counters) >= 0.25));
}
