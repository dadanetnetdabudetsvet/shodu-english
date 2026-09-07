/* Главный экран.
 *
 * Порядок продиктован сутью продукта: сначала улика (сколько слов у тебя
 * уже есть), потом ритм, потом одна кнопка. Раньше первым элементом
 * стоял стрик, хотя правила прямо запрещают его визуальное доминирование,
 * а под кнопкой висели три плитки нулей, которые в первый день
 * сообщали человеку ровно то, чего он и боится.
 *
 * Пять режимов не превращают экран в меню: связка дня ведёт человека
 * сама, а полный список живёт в шторке.
 */

import { el, en, greeting, setChildren } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { weekRhythm, weekDone, WEEK_TARGET, isSoftMode } from '../domain/streak.js';
import { weekdayShort, weekdayIndex, dayToDate } from '../core/day.js';
import { countKnown, levelInfo } from '../ui/reducer.js';
import { isKnown } from '../domain/srs.js';
import { questsForDay } from '../domain/quests.js';
import { enterCard, fillBar, animate, tweenNumber } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';

/* Слоты связки: вход, ядро, выход. Пять режимов заполняют три слота
   по ротации, поэтому недели не повторяются, а длина дня не растёт. */
const MODES = {
  build:  { icon: '📘', name: 'Занятие', sub: 'новые слова', route: 'session/build', slot: 'core' },
  sprint: { icon: '⚡', name: 'Блиц',    sub: 'на скорость', route: 'session/sprint', slot: 'in' },
  stream: { icon: '👁', name: 'Чтение',   sub: 'слова идут сами', route: 'stream',       slot: 'in' },
  ether:  { icon: '🎧', name: 'На слух', sub: 'звучание',    route: 'session/ether',  slot: 'out' },
  phrase: { icon: '🧱', name: 'Фраза',   sub: 'собери мысль', route: 'phrase',        slot: 'out' },
};

export function screen(store, content) {
  return {
    mount(root, ctx) {
      store.dispatch({ type: 'DAY_TICK' });
      const s = store.state;
      const today = s.days[s.day] || { words: 0, touched: 0, sessions: 0, ms: 0 };
      const goal = s.settings.dailyGoalWords || 10;
      const { known, learning } = countKnown(s);
      const rhythm = weekRhythm(s.days, s.day);
      const doneThisWeek = weekDone(s.days, s.day);
      const daysLived = s.day - (s.createdDay ?? s.day) + 1;
      const chain = dayChain(s);
      const doneToday = today.sessions;
      const lvl = levelInfo(s);

      /* Компактная шапка: ритм недели, стрик, алмазы и уровень в одной
         строке фиксированной высоты. Раньше это была свободная строка,
         которая разъезжалась, как только числа становились длиннее. */
      const dots = rhythm.slice(Math.max(0, 7 - Math.max(daysLived, 1)));
      /* В шапке остаётся только ритм и число дней, проведённых вместе.
         Стрик, алмазы и уровень отсюда убраны: три счётчика из четырёх
         говорили человеку, сколько он должен, и делали это первым, что
         он видит на экране. */
      const daysTogether = Object.values(s.days || {}).filter(d => d.sessions > 0 || d.present).length;
      /* Шапка. Обе левые ячейки раньше были мёртвыми подписями: они
         не открывались и не объясняли, что за ними стоит. Теперь это
         кнопки, и по ним разворачивается история. */
      const head = el('div', { class: 'topbar' },
        el('button', {
          class: 'topbar__cell', style: 'flex:2 1 0',
          'aria-label': t('Показать неделю'),
          onClick: () => { sound.swipe(); openHistory(); },
        },
          el('div', { class: 'rhythm', role: 'img',
            'aria-label': t('Дней с английским на этой неделе: {v0}', { v0: doneThisWeek }) },
            dots.map(d => el('span', {
              class: 'rhythm__dot'
                + (d.done ? (d.light ? ' rhythm__dot--light' : ' rhythm__dot--done') : '')
                + (d.isToday ? ' rhythm__dot--today' : ''),
            }))),
          el('div', { class: 'topbar__cap' }, t('неделя ›'))),

        el('div', { class: 'topbar__sep' }),

        el('button', {
          class: 'topbar__cell',
          'aria-label': t('Показать историю'),
          onClick: () => { sound.swipe(); openHistory(); },
        },
          el('div', { class: 'topbar__val' }, String(daysTogether)),
          el('div', { class: 'topbar__cap' }, t('дней ›'))),

        el('button', {
          class: 'topbar__cell', 'aria-label': t('Лавка'),
          onClick: () => { sound.tap(); ctx.go('quests/shop'); },
        },
          el('div', { class: 'topbar__val' }, `💎 ${s.econ.gems}`),
          el('div', { class: 'topbar__cap' }, t('лавка ›'))),
      );

      /* Разворот истории: то, что стояло за цифрами шапки. */
      function openHistory() {
        const totalMs = Object.values(s.days).reduce((a, d) => a + (d.ms || 0), 0);
        const first = Math.min(...Object.keys(s.days).map(Number).concat([s.day]));
        const rows = weekRhythm(s.days, s.day).map(d => {
          const rec = s.days[d.day] || {};
          const mins = Math.round((rec.ms || 0) / 60000);
          return el('div', { class: 'row row--between', style: 'padding:6px 0' },
            el('div', { class: 't-sm' }, weekdayFull(d.day)),
            el('div', { class: 't-caption' },
              rec.sessions ? t('{v0} мин · {v1} слов', { v0: Math.max(1, mins), v1: rec.touched || 0 })
                : rec.present ? t('заглядывал')
                : t('—')));
        });

        const sheet = el('div', {
          class: 'card stack', role: 'dialog', 'aria-modal': 'true',
          style: 'position:fixed;left:12px;right:12px;bottom:12px;z-index:90;max-width:536px;margin:0 auto',
        },
          el('div', { style: 'font-weight:600' }, t('Твоя неделя')),
          ...rows,
          el('div', { class: 'row', style: 'gap:var(--sp-2);margin-top:var(--sp-3)' },
            el('div', { class: 'tile grow' },
              el('div', { class: 'tile__val' }, String(daysTogether)),
              el('div', { class: 'tile__cap' }, t('дней вместе'))),
            el('div', { class: 'tile grow' },
              el('div', { class: 'tile__val' }, String(Math.round(totalMs / 60000))),
              el('div', { class: 'tile__cap' }, t('минут всего'))),
            el('div', { class: 'tile grow' },
              el('div', { class: 'tile__val' }, String(s.streak.best || 0)),
              el('div', { class: 'tile__cap' }, t('лучший ритм')))),
          el('div', { class: 't-caption' },
            t('Первый день был {v0} дней назад.', { v0: Math.max(0, s.day - first) })),
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => { close(); ctx.go('profile'); },
          }, t('Вся история в профиле →')),
          el('button', { class: 'btn btn--ghost', onClick: close }, t('Закрыть')),
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:89', onClick: close });
        document.body.append(back, sheet);
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        function close() { sheet.remove(); back.remove(); document.removeEventListener('keydown', onKey); }
      }

      /* Главный кадр экрана.
       *
       * Раньше человек первым делом видел серое число и полосу
       * недобора, то есть сколько он не сделал. Теперь первым делом он
       * видит то, что у него уже есть, и это единственное цветное пятно
       * на экране.
       */
      const recognised = known + learning;
      const step = Math.min(doneToday, 2);
      const current = chain[step];
      const bigNumber = el('div', { class: 'hero__num t-num' }, '0');

      const hero = el('div', { class: 'hero' },
        el('div', { class: 'hero__glow' }),

        el('div', { class: 'hero__row' },
          el('div', { class: 'hero__left' },
            el('div', { class: 'hero__hi' }, greeting(s.profile.name)),
            bigNumber,
            el('div', { class: 'hero__cap' }, t('слов в твоём английском')),
            el('div', { class: 'hero__sub' },
              known > 0 ? t('{v0} из них ты достаёшь не думая', { v0: known })
                : recognised > 0 ? t('Ты их не учил. Ты их узнал.')
                : t('Сейчас посчитаем, сколько их у тебя.'))),

          el('div', { class: 'hero__ring' },
            ringSvg(Math.min(1, todayWords(today) / goal)),
            el('div', { class: 'hero__ring-mid' },
              el('div', { class: 'hero__ring-num t-num' }, String(todayWords(today))),
              el('div', { class: 'hero__ring-cap' }, t('сегодня'))))),

        el('button', {
          class: 'hero__cta',
          onClick: () => { sound.sessionStart(); ctx.go(MODES[current].route); },
        },
          el('span', { class: 'hero__cta-icon' }, MODES[current].icon),
          el('span', { class: 'grow', style: 'text-align:left' },
            doneToday === 0 ? t('Начнём')
              : doneToday >= 3 ? t('Ещё заход')
              : t('Дальше: {v0}', { v0: t(MODES[current].name) })),
          el('span', { class: 'hero__cta-note' }, nextReward(s, today, goal))),

        doneToday >= 3 ? el('button', {
          class: 'hero__more',
          onClick: () => { sound.tap(); ctx.go('quests'); },
        }, t('Все три сделаны. Посмотреть задания и награды →')) : null,

        el('div', { class: 'hero__chips' },
          ...chain.map((m, i) => el('span', {
            class: 'chip' + (i < doneToday ? ' chip--done' : i === step ? ' chip--now' : ''),
          }, `${i < doneToday ? '✓ ' : ''}${MODES[m].icon} ${t(MODES[m].name)}`))),
      );

      const pickLink = el('button', {
        class: 'btn btn--ghost', style: 'align-self:flex-start;font-size:var(--fs-sm)',
        onClick: openPicker,
      }, t('Выбрать другой заход →'));


      const softNote = isSoftMode(s.lives) && el('div', { class: 'card card--flat t-sm' },
        t('Сегодня подбираю слова поспокойнее. Искры вернутся сами.'));

      /* Прерванное занятие. Человек не должен гадать, сохранилось ли
         то, что он успел. */
      const open = s.openSession && s.openSession.day === s.day && s.openSession.pos > 0
        ? el('div', { class: 'card row', style: 'gap:var(--sp-3);align-items:center' },
            el('div', { style: 'font-size:22px' }, '↩️'),
            el('div', { class: 'stack grow', style: 'gap:2px' },
              el('div', { style: 'font-weight:600' }, t('Ты остановился на {v0} из {v1}', { v0: s.openSession.pos, v1: s.openSession.total })),
              el('div', { class: 't-caption' }, t('Всё, что успел, на месте'))),
            el('button', {
              class: 'btn btn--primary', style: 'flex:none',
              onClick: () => { sound.sessionStart(); ctx.go(MODES[s.openSession.mode]?.route || 'session/build'); },
            }, t('Дальше →')))
        : null;

      /* Пересчёт: единственное место, где видно изменение способности,
         а не накопление. Предлагается с седьмого дня. */
      const recheckCard = shouldOfferRecheck(s) && el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
        el('div', { style: 'font-weight:600' }, t('Посмотрим, что изменилось 📏')),
        el('div', { class: 't-sm' },
          t('Те же десять слов, что в первый день. Минута, чтобы увидеть разницу.')),
        el('button', { class: 'btn btn--primary', onClick: () => { sound.tap(); ctx.go('recheck'); } },
          t('Пересчитать 📏')),
        el('button', {
          class: 'btn btn--ghost', style: 'font-size:var(--fs-sm)',
          onClick: () => { store.dispatch({ type: 'RECHECK_SNOOZE' }); ctx.go('home'); },
        }, t('Не сейчас')));

      /* Установка на домашний экран: не косметика, а сохранность слов. */
      const installCard = shouldOfferInstall(s) && el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
        el('div', { style: 'font-weight:600' }, t('Положи на домашний экран 📲')),
        el('div', { class: 't-sm' },
          t('Твои {v0} слов живут вот в этом браузере. На домашнем экране они держатся дольше.', { v0: known + learning })),
        el('button', { class: 'btn btn--primary', onClick: () => { sound.tap(); ctx.go('install'); } },
          t('Показать, как 📲')),
        el('button', {
          class: 'btn btn--ghost', style: 'font-size:var(--fs-sm)',
          onClick: () => { store.dispatch({ type: 'INSTALL_SEEN' }); ctx.go('home'); },
        }, t('Потом')));

      const wrap = el('div', { class: 'screen' },
        head, hero, open, pickLink,
        recheckCard, installCard, softNote);
      root.replaceChildren(wrap);

      enterCard(hero);
      tweenNumber(bigNumber, 0, recognised, 1000);

      /* Шторка выбора: все пять режимов, подпись каждого — число из
         данных, а не реклама. Недоступный режим не прячется и не
         блокируется: он ведёт на экран, который умеет починить тупик. */
      function openPicker() {
        sound.tap();
        const rows = Object.entries(MODES).map(([key, m]) => {
          const info = modeInfo(key, s, content);
          return el('button', {
            class: 'list-row',
            onClick: () => { close(); sound.sessionStart(); ctx.go(m.route); },
          },
            el('span', { style: 'font-size:22px;width:32px' }, m.icon),
            el('span', { class: 'stack grow', style: 'gap:1px' },
              el('span', { style: 'font-weight:600' }, t(m.name)),
              el('span', { class: 't-caption' }, info)),
            key === current ? el('span', { class: 't-caption' }, '•') : null,
          );
        });
        const sheet = el('div', {
          class: 'card stack', role: 'dialog', 'aria-modal': 'true',
          style: 'position:fixed;left:12px;right:12px;bottom:12px;z-index:80;max-width:536px;margin:0 auto',
        },
          el('div', { style: 'font-weight:600' }, t('Чем займёмся?')),
          ...rows,
          el('button', { class: 'btn btn--ghost', onClick: close }, t('Закрыть')),
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:79', onClick: close });
        document.body.append(back, sheet);
        animate(sheet, [{ transform: 'translateY(110%)' }, { transform: 'none' }],
          { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        function close() { sheet.remove(); back.remove(); document.removeEventListener('keydown', onKey); }
      }

      return { destroy() {} };
    },
  };
}

/* Пересчёт предлагается с седьмого дня и потом раз в четыре недели. */
function shouldOfferRecheck(s) {
  if (!s.baseline) return false;
  const lived = s.day - (s.createdDay ?? s.day);
  if (lived < 7) return false;
  if (s.recheckSnoozedDay && s.day - s.recheckSnoozedDay < 3) return false;
  const last = (s.rechecks || []).slice(-1)[0];
  if (!last) return true;
  return s.day - last.day >= 28;
}

/* Подсказка про установку показывается один раз, на седьмой день. */
function shouldOfferInstall(s) {
  if (s.flags?.installPromptSeen) return false;
  if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) return false;
  if (navigator.standalone) return false;
  return (s.day - (s.createdDay ?? s.day)) >= 6;
}

/** Полное название дня недели для разворота истории. */
function weekdayFull(dayNum) {
  try {
    return dayToDate(dayNum).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  } catch { return String(dayNum); }
}

/* Кольцо дня. Круг вместо полосы: полоса показывает, сколько не
   пройдено, кольцо — сколько уже есть, и у него нет видимого края. */
function ringSvg(ratio) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', '84'); svg.setAttribute('height', '84');
  svg.setAttribute('aria-hidden', 'true');
  const R = 42, C = 2 * Math.PI * R;

  const base = document.createElementNS(NS, 'circle');
  base.setAttribute('cx', 50); base.setAttribute('cy', 50); base.setAttribute('r', R);
  base.setAttribute('fill', 'none');
  base.setAttribute('stroke', 'rgba(255,255,255,.22)');
  base.setAttribute('stroke-width', 8);

  const arc = document.createElementNS(NS, 'circle');
  arc.setAttribute('cx', 50); arc.setAttribute('cy', 50); arc.setAttribute('r', R);
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke', '#fff');
  arc.setAttribute('stroke-width', 8);
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', 'rotate(-90 50 50)');
  arc.setAttribute('stroke-dasharray', String(C));
  arc.setAttribute('stroke-dashoffset', String(C));
  setTimeout(() => {
    arc.style.transition = 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)';
    arc.setAttribute('stroke-dashoffset', String(C * (1 - Math.max(0.04, ratio))));
  }, 120);

  svg.append(base, arc);
  return svg;
}

/* Что даст следующий заход. Показываем только гарантированное:
   обещать очки, которых может не быть, запрещено. */
function nextReward(s, today, goal) {
  const quests = questsForDay(s.day, goal);
  const claimed = new Set((s.questsClaimed || {})[String(s.day)] || []);
  const day = s.days[s.day];
  for (const q of quests) {
    if (claimed.has(q.id)) continue;
    if (q.unit === 'sessions' && (day?.sessions || 0) + 1 >= q.need) return `+${q.gems} 💎`;
  }
  return '+20';
}

/* Кольцо дня. Круг вместо полосы: полоса показывает пустую часть,
   то есть сколько не пройдено, а у кольца нет видимого края. */
function todayWords(d) {
  return (d.words || 0) + Math.floor((d.touched || 0) / 2);
}

/* Ротация связки: кто дольше не был, тот и идёт. */
function dayChain(s) {
  const last = s.lastModes || {};
  const pickSlot = (slot) => Object.entries(MODES)
    .filter(([, m]) => m.slot === slot)
    .sort((a, b) => (last[a[0]] || 0) - (last[b[0]] || 0))[0][0];
  return [pickSlot('in'), 'build', pickSlot('out')];
}

/* Подпись режима — всегда число из состояния, никогда не реклама. */
function modeInfo(key, s, content) {
  let due = 0, ready = 0;
  for (const deck of ['deck1', 'deck2']) {
    for (const rec of Object.values(s.srs[deck] || {})) {
      if (rec.box >= 1 && rec.dueDay <= s.day) due++;
      if (isKnown(rec)) ready++;
    }
  }
  if (key === 'build') return t('{v0} слов сегодня можно подтвердить', { v0: due });
  if (key === 'sprint') return t('{v0} знакомых слов', { v0: ready });
  if (key === 'stream') return s.profile.readWpm
    ? t('{v0} слов в минуту · 100 секунд', { v0: s.profile.readWpm })
    : t('узнаешь, с какой скоростью читаешь по-английски');
  if (key === 'ether') return t('{v0} слов на слух', { v0: ready });
  if (key === 'phrase') return ready >= 4
    ? t('{v0} фраз можно собрать', { v0: Math.min(7, ready) })
    : t('появится, когда наберётся четыре слова');
  return '';
}
