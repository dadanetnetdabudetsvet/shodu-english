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
import { countKnown, levelInfo } from '../ui/reducer.js';
import { isKnown } from '../domain/srs.js';
import { enterCard, fillBar, animate, tweenNumber } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';

/* Слоты связки: вход, ядро, выход. Пять режимов заполняют три слота
   по ротации, поэтому недели не повторяются, а длина дня не растёт. */
const MODES = {
  build:  { icon: '📘', name: 'Занятие', sub: 'новые слова', route: 'session/build', slot: 'core' },
  sprint: { icon: '⚡', name: 'Блиц',    sub: 'на скорость', route: 'session/sprint', slot: 'in' },
  stream: { icon: '👁', name: 'Поток',   sub: 'слова идут сами', route: 'stream',       slot: 'in' },
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
      const head = el('div', { class: 'topbar' },
        el('div', { class: 'topbar__cell', style: 'flex:2 1 0' },
          el('div', { class: 'rhythm', role: 'img',
            'aria-label': t('Дней с английским на этой неделе: {v0}', { v0: doneThisWeek }) },
            dots.map(d => el('span', {
              class: 'rhythm__dot'
                + (d.done ? (d.light ? ' rhythm__dot--light' : ' rhythm__dot--done') : '')
                + (d.isToday ? ' rhythm__dot--today' : ''),
            }))),
          el('div', { class: 'topbar__cap' }, t('эта неделя'))),

        el('div', { class: 'topbar__sep' }),

        el('div', { class: 'topbar__cell' },
          el('div', { class: 'topbar__val' }, String(daysTogether)),
          el('div', { class: 'topbar__cap' }, t('дней вместе'))),
      );

      /* Улика идёт первой: это главное, что продукт доказывает. */
      const recognised = known + learning;
      const bigNumber = el('div', {
        class: 't-num', style: 'font-size:var(--fs-4xl);font-weight:800;line-height:1',
      }, '0');
      const proof = el('div', { class: 'stack', style: 'gap:2px' },
        el('div', { class: 't-caption' }, greeting(s.profile.name)),
        bigNumber,
        el('div', { class: 't-body' }, t('английских слов ты уже узнаёшь')),
        known > 0
          ? el('div', { class: 't-caption' }, t('{v0} из них держатся без напоминания', { v0: known }))
          : null,
      );

      const barFill = el('div', { class: 'bar__fill' });
      const goalRow = el('div', { class: 'stack', style: 'gap:6px' },
        el('div', { class: 't-sm' }, todayWords(today) >= goal
          ? t('День засчитан. Слов сегодня: {v0}', { v0: todayWords(today), v1: goal })
          : t('сегодня твоих стало больше на {v0}', { v0: todayWords(today), v1: goal })),
        el('div', { class: 'bar' }, barFill),
      );

      /* Связка дня: три шага, одна кнопка, текст которой меняется. */
      const step = Math.min(doneToday, 2);
      const current = chain[step];
      const chips = el('div', { class: 'row', style: 'gap:6px' },
        ...chain.map((m, i) => el('div', {
          class: 't-caption',
          style: `padding:4px 10px;border-radius:var(--r-full);
                  background:${i < doneToday ? 'var(--accent-soft)' : 'transparent'};
                  border:1px solid ${i === step ? 'var(--accent)' : 'var(--border)'};
                  color:${i < doneToday ? 'var(--accent)' : 'inherit'}`,
        }, `${i < doneToday ? '✓ ' : ''}${MODES[m].icon} ${t(MODES[m].name)}`)));

      const heroBtn = el('button', {
        class: 'btn btn--onhero btn--cta',
        onClick: () => { sound.sessionStart(); ctx.go(MODES[current].route); },
      }, doneToday === 0 ? t('Начнём ⚡')
        : doneToday >= 3 ? t('Ещё заход ⚡')
        : t('Дальше: {v0} →', { v0: t(MODES[current].name) }));

      const hero = el('div', { class: 'card--hero stack', style: 'gap:var(--sp-3)' },
        el('div', { style: 'font-size:var(--fs-md);font-weight:700' },
          doneToday === 0 ? t('Связка на сегодня') : doneToday >= 3 ? t('Связка сложилась') : t('Ты в середине')),
        chips,
        heroBtn,
        el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.75);text-align:center' },
          t('≈ {v0} мин', { v0: Math.max(2, Math.round(goal * 0.4)) })),
      );

      const pickLink = el('button', {
        class: 'btn btn--ghost', style: 'align-self:flex-start;font-size:var(--fs-sm)',
        onClick: openPicker,
      }, t('🎛 собрать своё →'));

      const softNote = isSoftMode(s.lives) && el('div', { class: 'card card--flat t-sm' },
        t('Сегодня подбираю слова поспокойнее. Искры вернутся сами.'));

      /* Слово дня: берём только из узнаваемых, иначе оно пугает. */
      const easy = content.deck1.filter(w => w.tier <= 2);
      // Без сети и без кэша колода приходит пустой: деление на ноль
      // роняло стартовый экран целиком.
      const wod = easy.length ? easy[(s.day * 7919) % easy.length] : null;
      const wordOfDay = wod && el('button', {
        class: 'card row', style: 'gap:var(--sp-3);text-align:left;width:100%',
        onClick: () => { sound.tap(); if (speech.available) speech.say(wod.en); },
      },
        el('div', { class: 'stack grow', style: 'gap:2px' },
          el('div', { class: 't-caption' }, t('СЛОВО ДНЯ')),
          el('div', { class: 'row', style: 'gap:var(--sp-2)' },
            en(wod.en, 't-h2'),
            el('span', { class: 't-ipa', 'aria-hidden': 'true' }, wod.tr)),
          el('div', { class: 't-sm' }, wod.answer)),
        speech.available ? el('span', { style: 'font-size:20px' }, '🔊') : null,
      );

      /* Пересчёт: единственное место, где видно изменение способности,
         а не накопление. Предлагается с седьмого дня и дальше раз в
         четыре недели. «Не сейчас» есть всегда, ничего не сгорает. */
      const recheckCard = shouldOfferRecheck(s) && el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
        el('div', { style: 'font-weight:600' }, t('Посмотрим, что изменилось 📏')),
        el('div', { class: 't-sm' },
          t('Те же десять слов, что в первый день. Минута, чтобы увидеть разницу.')),
        el('button', {
          class: 'btn btn--primary', onClick: () => { sound.tap(); ctx.go('recheck'); },
        }, t('Пересчитать 📏')),
        el('button', {
          class: 'btn btn--ghost', style: 'font-size:var(--fs-sm)',
          onClick: () => { store.dispatch({ type: 'RECHECK_SNOOZE' }); ctx.go('home'); },
        }, t('Не сейчас')),
      );

      /* Установка на домашний экран: не косметика, а сохранность
         прогресса. Браузер стирает данные сайтов после недели без
         открытия, а установленное приложение считает свою неделю
         отдельно. Предлагаем на седьмой день, когда есть что терять. */
      const installCard = shouldOfferInstall(s) && el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
        el('div', { style: 'font-weight:600' }, t('Положи на домашний экран 📲')),
        el('div', { class: 't-sm' },
          t('Твои {v0} слов живут вот в этом браузере. На домашнем экране они держатся дольше.', { v0: known })),
        el('div', { class: 't-caption' },
          t('На айфоне: «Поделиться» → «На экран Домой». На Андроиде появится предложение установить.')),
        el('button', {
          class: 'btn btn--ghost', style: 'font-size:var(--fs-sm)',
          onClick: () => { store.dispatch({ type: 'INSTALL_SEEN' }); ctx.go('home'); },
        }, t('Понятно ✓')),
      );

      const wrap = el('div', { class: 'screen' },
        head, proof, goalRow, hero, pickLink,
        recheckCard, installCard, softNote, wordOfDay);
      root.replaceChildren(wrap);

      enterCard(hero);
      tweenNumber(bigNumber, 0, recognised, 900);
      fillBar(barFill, 0, Math.min(1, todayWords(today) / goal));

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
