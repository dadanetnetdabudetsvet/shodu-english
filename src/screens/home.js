/* Главный экран.
 *
 * Приоритет из правил: главная метрика — ритм недели, а не стрик.
 * Кольцо стоит в строке ресурсов, стрик — цифрой при нём и мельче.
 *
 * Только один элемент на экране выглядит как кнопка.
 */

import { el, en, greeting } from '../ui/dom.js';
import { weekRhythm, weekDone, WEEK_TARGET, isSoftMode } from '../domain/streak.js';
import { countKnown, levelInfo } from '../ui/reducer.js';
import { tierOf } from '../domain/challenge.js';
import { enterCard, fillBar } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';

export function screen(store, content) {
  return {
    mount(root, ctx) {
      store.dispatch({ type: 'DAY_TICK' });
      const s = store.state;
      const wrap = el('div', { class: 'screen' });
      const today = s.days[s.day] || { words: 0, sessions: 0, ms: 0 };
      const goal = s.settings.dailyGoalWords || 10;
      const { known, learning } = countKnown(s);
      const rhythm = weekRhythm(s.days, s.day);
      const doneThisWeek = weekDone(s.days, s.day);
      const lvl = levelInfo(s);

      /* Строка ресурсов: кольцо недели первым, стрик при нём. */
      const res = el('div', { class: 'res card', style: 'padding:var(--sp-3) var(--sp-4)' },
        el('div', { class: 'stack', style: 'gap:4px' },
          el('div', { class: 'rhythm', role: 'img',
                      'aria-label': `Ритм недели: ${doneThisWeek} из 7 дней` },
            rhythm.map(d => el('span', {
              class: 'rhythm__dot' + (d.done ? ' rhythm__dot--done' : '') + (d.isToday ? ' rhythm__dot--today' : ''),
            }))),
          el('div', { class: 'res__cap' },
            doneThisWeek >= WEEK_TARGET ? 'ритм недели набран' : `ритм недели: ${doneThisWeek} из ${WEEK_TARGET}`),
        ),
        el('div', { class: 'grow' }),
        s.streak.current > 0 && el('div', { class: 'res__item' },
          el('div', { class: 'res__val', style: 'font-size:var(--fs-base)' }, `🔥 ${s.streak.current}`),
          el('div', { class: 'res__cap' }, 'подряд')),
        el('div', { class: 'res__item' },
          el('div', { class: 'res__val', style: 'font-size:var(--fs-base)' }, `💎 ${s.econ.gems}`),
          el('div', { class: 'res__cap' }, 'алмазы')),
      );

      const barFill = el('div', { class: 'bar__fill' });
      const progress = el('div', { class: 'stack', style: 'gap:var(--sp-2)' },
        el('h1', { class: 't-h1' }, greeting(s.profile.name)),
        el('p', { class: 't-sm' },
          today.words >= goal
            ? `Цель дня выполнена: ${today.words} из ${goal} слов`
            : `Сегодня ${today.words} из ${goal} слов`),
        el('div', { class: 'bar' }, barFill),
      );

      const dueCount = countDue(s, content);
      const hero = el('div', { class: 'card--hero stack', style: 'gap:var(--sp-3)' },
        el('div', { style: 'font-size:var(--fs-md);font-weight:700' },
          today.sessions > 0 ? 'Ещё разок?' : 'Продолжим?'),
        el('div', { class: 't-sm', style: 'color:rgba(255,255,255,.85)' },
          dueCount > 0
            ? `${dueCount} ${dueCount === 1 ? 'слово готово' : 'слов готовы'} к повторению`
            : 'Возьмём новые слова'),
        el('button', {
          class: 'btn btn--onhero btn--cta',
          onClick: () => { sound.sessionStart(); ctx.go('session/build'); },
        }, 'Начать занятие →'),
        el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.75);text-align:center' },
          `≈ ${Math.max(2, Math.round(goal * 0.4))} мин`),
      );

      /* Карточки режимов — карточки, а не кнопки: главная кнопка на экране одна. */
      const modes = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)' },
        modeCard('⚡', 'Блиц', 'узнавание', () => ctx.go('session/sprint')),
        modeCard('🎧', 'На слух', 'звучание', () => ctx.go('session/ether')),
      );

      function modeCard(icon, title, sub, onClick) {
        return el('button', { class: 'card', style: 'text-align:left', onClick: () => { sound.tap(); onClick(); } },
          el('div', { style: 'font-size:22px' }, icon),
          el('div', { style: 'font-weight:600' }, title),
          el('div', { class: 't-caption' }, sub));
      }

      const softNote = isSoftMode(s.lives) && el('div', { class: 'card card--flat t-sm' },
        'Мягкий режим: задания попроще. Жизни вернутся сами, или быстрее — за разбор.');

      /* Слово дня. Берётся детерминированно от номера дня: одно и то же
         слово в течение суток, но своё у каждого дня. */
      const wod = content.deck1[(s.day * 7919) % content.deck1.length];
      const wordOfDay = el('div', { class: 'card row', style: 'gap:var(--sp-3)' },
        el('div', { class: 'stack grow', style: 'gap:2px' },
          el('div', { class: 't-caption' }, 'СЛОВО ДНЯ'),
          el('div', { class: 'row', style: 'gap:var(--sp-2)' },
            en(wod.en, 't-h2'),
            el('span', { class: 't-ipa', 'aria-hidden': 'true' }, wod.ipa)),
          el('div', { class: 't-sm' }, wod.ru)),
        speech.available && el('button', {
          class: 'qcard__speak', style: 'position:static',
          'aria-label': `Произнести ${wod.en}`,
          onClick: () => speech.say(wod.en),
        }, '🔊'),
      );

      const stats = el('div', { class: 'row', style: 'gap:var(--sp-2)' },
        el('div', { class: 'tile grow' },
          el('div', { class: 'tile__val' }, String(known)),
          el('div', { class: 'tile__cap' }, 'слов знаю')),
        el('div', { class: 'tile grow' },
          el('div', { class: 'tile__val' }, String(learning)),
          el('div', { class: 'tile__cap' }, 'в работе')),
        el('div', { class: 'tile grow' },
          el('div', { class: 'tile__val' }, String(lvl.level)),
          el('div', { class: 'tile__cap' }, 'уровень')),
      );

      wrap.append(res, progress, hero, modes, softNote, stats, wordOfDay,
        el('div', { class: 't-caption center' },
          `планка ${s.challenge.index} · ${tierOf(s.challenge.index).name}`));
      root.append(wrap);

      enterCard(hero);
      fillBar(barFill, 0, Math.min(1, today.words / goal));

      return { destroy() {} };
    },
  };
}

function countDue(s, content) {
  let n = 0;
  for (const deck of ['deck1', 'deck2']) {
    for (const rec of Object.values(s.srs[deck] || {})) {
      if (rec.box >= 1 && rec.dueDay <= s.day) n++;
    }
  }
  return n;
}
