/* Профиль: аватар, имя, статистика, график, медали, настройки.
 *
 * Здесь нет процента точности: правило Р1 запрещает его везде.
 * Падение активности красится нейтральным цветом, а не цветом ошибки.
 * Обнуление прогресса спрятано за тремя барьерами.
 */

import { el } from '../ui/dom.js';
import { countKnown, levelInfo } from '../ui/reducer.js';
import { MEDALS, evaluateMedals, nextMedal } from '../domain/medals.js';
import { gradeForLevel } from '../domain/scoring.js';
import { tierOf, MIN_INDEX, MAX_INDEX } from '../domain/challenge.js';
import { weekDone } from '../domain/streak.js';
import { WEEKDAY_SHORT, weekdayIndex } from '../core/day.js';
import { sound } from '../core/sound.js';
import { storage } from '../core/storage.js';
import { toast } from '../ui/toast.js';
import { enterCard } from '../core/motion.js';

const AVATARS = ['🐱', '🦊', '🐼', '🐧', '🦉', '🐻', '🦔', '🐺', '🦫', '🐲', '🐙', '🧑‍🚀'];

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const wrap = el('div', { class: 'screen' });
      root.append(wrap);

      function render() {
        const s = store.state;
        const { known, learning } = countKnown(s);
        const lvl = levelInfo(s);
        const grade = gradeForLevel(lvl.level);
        const totalMs = Object.values(s.days).reduce((a, d) => a + (d.ms || 0), 0);
        const totalSessions = Object.values(s.days).reduce((a, d) => a + (d.sessions || 0), 0);
        const avatarIdx = Number(s.profile.avatarIdx ?? 0);

        wrap.replaceChildren(
          header(s, avatarIdx, lvl, grade),
          statsGrid({ known, learning, s, totalMs, totalSessions }),
          chart(s),
          medalsBlock(s, { known, learning, totalSessions }),
          settingsBlock(s),
        );
      }

      /* ── шапка ─────────────────────────────────────────────── */
      function header(s, avatarIdx, lvl, grade) {
        const bar = el('div', { class: 'bar__fill', style: `transform:scaleX(${lvl.ratio})` });
        return el('div', { class: 'stack center', style: 'gap:var(--sp-2);align-items:center' },
          el('button', {
            style: `width:96px;height:96px;border-radius:var(--r-full);font-size:48px;
                    display:grid;place-items:center;background:var(--surface);
                    box-shadow:var(--sh-gold-glow)`,
            'aria-label': 'Сменить аватар',
            onClick: () => {
              sound.tap();
              store.dispatch({ type: 'PROFILE_SET', patch: { avatarIdx: (avatarIdx + 1) % AVATARS.length } });
              render();
            },
          }, AVATARS[avatarIdx]),
          el('button', {
            class: 't-h1', style: 'background:none',
            onClick: () => editName(s),
          }, s.profile.name || 'Дать себе имя'),
          el('div', { class: 't-sm' }, `Уровень ${lvl.level} · ${grade.name}`),
          el('div', { class: 't-caption' }, grade.line),
          el('div', { class: 'bar', style: 'width:100%;margin-top:var(--sp-2)' }, bar),
          el('div', { class: 't-caption' }, `${lvl.inLevel} из ${lvl.needed} очков до следующего`),
        );
      }

      function editName(s) {
        const val = prompt('Как тебя звать?', s.profile.name || '');
        if (val == null) return;
        const clean = sanitizeName(val);
        store.dispatch({ type: 'PROFILE_SET', patch: { name: clean } });
        render();
      }

      /* ── статистика ────────────────────────────────────────── */
      function statsGrid({ known, learning, s, totalMs, totalSessions }) {
        const tiles = [
          ['📗', known, 'слов знаю'],
          ['📘', learning, 'в работе'],
          ['🔥', s.streak.current, 'дней подряд'],
          ['👑', s.streak.best, 'лучший ритм'],
          ['⏱', Math.round(totalMs / 60000), 'минут всего'],
          ['⭐', s.econ.xpTotal, 'очков всего'],
          ['⚡', totalSessions, 'занятий'],
          ['💎', s.econ.gems, 'алмазов'],
        ];
        return el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-2)' },
          ...tiles.map(([icon, val, cap]) => el('div', { class: 'tile' },
            el('div', { style: 'font-size:16px' }, icon),
            el('div', { class: 'tile__val', style: 'font-size:var(--fs-md)' }, String(val)),
            el('div', { class: 'tile__cap' }, cap))));
      }

      /* ── график по минутам ─────────────────────────────────── */
      function chart(s) {
        const N = 14;
        const bars = [];
        let max = 0;
        for (let i = N - 1; i >= 0; i--) {
          const d = s.day - i;
          const min = Math.round(((s.days[d]?.ms) || 0) / 60000);
          max = Math.max(max, min);
          bars.push({ day: d, min, isToday: i === 0 });
        }
        const top = Math.max(20, Math.ceil(max / 10) * 10);
        const H = 120;

        if (max === 0) {
          return el('div', { class: 'card center t-sm' },
            'Пока пусто. После первого занятия здесь появится твой ритм.');
        }

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${N * 26} ${H + 22}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', `Занятия по дням, максимум ${top} минут`);

        bars.forEach((b, i) => {
          const x = i * 26 + 4;
          // Пустой день рисуется пеньком, а не отсутствием столбца:
          // иначе провал читается как поломка графика.
          const h = b.min === 0 ? 3 : Math.max(4, (b.min / top) * H);
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', x); rect.setAttribute('y', H - h);
          rect.setAttribute('width', 18); rect.setAttribute('height', h);
          rect.setAttribute('rx', 5);
          rect.setAttribute('fill', b.min === 0 ? 'var(--surface-3)'
            : b.isToday ? 'var(--accent)' : 'var(--accent)');
          rect.setAttribute('opacity', b.min === 0 ? '1' : b.isToday ? '1' : '.45');
          svg.append(rect);

          if (i % 2 === 0) {
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t.setAttribute('x', x + 9); t.setAttribute('y', H + 16);
            t.setAttribute('text-anchor', 'middle');
            t.setAttribute('font-size', '9');
            t.setAttribute('fill', 'var(--text-3)');
            t.textContent = WEEKDAY_SHORT[weekdayIndex(b.day)];
            svg.append(t);
          }
        });

        return el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
          el('div', { class: 'row row--between' },
            el('div', { style: 'font-weight:600' }, 'Минуты по дням'),
            el('div', { class: 't-caption' }, `две недели · до ${top} мин`)),
          svg);
      }

      /* ── медали ────────────────────────────────────────────── */
      function medalsBlock(s, agg) {
        const counters = buildCounters(s, agg);
        const earned = s.medals || {};
        const fresh = evaluateMedals(counters, earned);
        if (fresh.length) {
          // Выдаём молча в состоянии, показываем как открытые.
          for (const m of fresh) earned[m.id] = s.day;
          store.dispatch({ type: 'PROFILE_SET', patch: {} });
        }
        const next = nextMedal(counters, earned);

        // Показываем только то, что не дальше удвоенного текущего прогресса:
        // витрина недостижимого сообщает человеку о его недостаточности.
        const visible = MEDALS.filter(m => earned[m.id] || !m.secret);

        return el('div', { class: 'card stack' },
          el('div', { class: 'row row--between' },
            el('div', { style: 'font-weight:600' }, 'Медали'),
            el('div', { class: 't-caption' }, `${Object.keys(earned).length} из ${MEDALS.length}`)),
          next ? el('div', { class: 't-caption' }, `Следующая: ${next.name} — ${next.hint}`) : null,
          el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-2)' },
            ...visible.map(m => {
              const has = !!earned[m.id];
              return el('div', {
                class: 'tile',
                style: has ? '' : 'opacity:.45;filter:grayscale(1)',
                title: m.hint,
                'aria-label': has ? `${m.name}. Получена.` : `${m.name}. Закрыта. ${m.hint}`,
              },
                el('div', { style: 'font-size:22px' }, has ? m.icon : '🔒'),
                el('div', { class: 'tile__cap' }, m.name));
            })),
        );
      }

      /* ── настройки ─────────────────────────────────────────── */
      function settingsBlock(s) {
        const body = el('div', { class: 'stack', hidden: true, style: 'margin-top:var(--sp-3)' });
        const toggle = el('button', {
          class: 'row row--between', style: 'width:100%',
          onClick: () => { body.hidden = !body.hidden; sound.tap(); },
        }, el('span', { style: 'font-weight:600' }, '⚙︎ Настройки'), el('span', { class: 't-sm' }, '▾'));

        body.append(
          selectRow('Тема', s.settings.theme, [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']],
            v => store.dispatch({ type: 'SETTINGS_SET', patch: { theme: v } })),
          selectRow('Анимации', s.settings.motion, [['full', 'Полные'], ['calm', 'Спокойные'], ['off', 'Выключены']],
            v => store.dispatch({ type: 'SETTINGS_SET', patch: { motion: v } })),
          selectRow('Размер шрифта', s.settings.fontScale, [['s', 'Меньше'], ['m', 'Обычный'], ['l', 'Крупный'], ['xl', 'Очень крупный']],
            v => store.dispatch({ type: 'SETTINGS_SET', patch: { fontScale: v } })),
          toggleRow('Звук', s.settings.sound, v => store.dispatch({ type: 'SETTINGS_SET', patch: { sound: v } })),
          toggleRow('Озвучка слов', s.settings.speech, v => store.dispatch({ type: 'SETTINGS_SET', patch: { speech: v } })),
          goalRow(s),
          challengeRow(s),
          exportRow(),
          dangerZone(s),
        );

        return el('div', { class: 'card' }, toggle, body);
      }

      function selectRow(label, value, options, onSet) {
        const row = el('div', { class: 'stack', style: 'gap:6px' },
          el('div', { class: 't-sm' }, label),
          el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
            ...options.map(([v, l]) => el('button', {
              class: 'btn' + (v === value ? ' btn--primary' : ''),
              style: 'min-height:38px;padding:0 var(--sp-3);font-size:var(--fs-sm)',
              onClick: () => { sound.tap(); onSet(v); render(); },
            }, l))));
        return row;
      }

      function toggleRow(label, value, onSet) {
        return el('div', { class: 'row row--between' },
          el('div', { class: 't-sm' }, label),
          el('button', {
            class: 'btn' + (value ? ' btn--primary' : ''),
            style: 'min-height:38px;padding:0 var(--sp-4)',
            onClick: () => { sound.tap(); onSet(!value); render(); },
          }, value ? 'Вкл' : 'Выкл'));
      }

      function goalRow(s) {
        return selectRow('Цель на день', s.settings.dailyGoalWords,
          [[5, '5 слов'], [10, '10 слов'], [20, '20 слов']],
          v => store.dispatch({ type: 'SETTINGS_SET', patch: { dailyGoalWords: Number(v) } }));
      }

      /* Планка. Ручное значение имеет приоритет: автоматика молчит три дня. */
      function challengeRow(s) {
        const val = el('div', { class: 't-sm t-num' }, String(s.challenge.index));
        const desc = el('div', { class: 't-caption' }, tierOf(s.challenge.index).desc);
        const input = el('input', {
          type: 'range', min: MIN_INDEX, max: MAX_INDEX, value: s.challenge.index,
          style: 'width:100%', 'aria-label': 'Планка сложности',
          onInput: (e) => {
            val.textContent = e.target.value;
            desc.textContent = tierOf(Number(e.target.value)).desc;
          },
          onChange: (e) => {
            store.dispatch({ type: 'CHALLENGE_SET', index: Number(e.target.value) });
            sound.tap();
          },
        });
        return el('div', { class: 'stack', style: 'gap:6px' },
          el('div', { class: 'row row--between' },
            el('div', { class: 't-sm' }, `Планка · ${tierOf(s.challenge.index).name}`), val),
          input, desc,
          toggleRow('Подстраивать автоматически', s.settings.autoChallenge,
            v => store.dispatch({ type: 'SETTINGS_SET', patch: { autoChallenge: v } })),
        );
      }

      function exportRow() {
        return el('div', { class: 'row', style: 'gap:var(--sp-2)' },
          el('button', {
            class: 'btn grow', onClick: () => {
              const blob = new Blob([JSON.stringify(store.state)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `shodu-progress-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 30000);
              toast('Файл сохранён. Держи его как страховку.', { kind: 'info' });
            },
          }, 'Сохранить прогресс в файл'));
      }

      /* Опасная зона: свёрнута, внизу, нейтрального цвета, с подтверждением
         вводом слова и окном отмены. Красный заголовок притягивает палец,
         поэтому его здесь нет. */
      function dangerZone(s) {
        const inner = el('div', { class: 'stack', hidden: true, style: 'margin-top:var(--sp-2)' });
        const head = el('button', {
          class: 't-caption', style: 'width:100%;text-align:left;color:var(--text-2)',
          onClick: () => { inner.hidden = !inner.hidden; },
        }, 'Дополнительно ▾');

        const { known } = countKnown(s);
        inner.append(
          el('div', { class: 't-caption' },
            `Если начать заново, исчезнут: ${known} слов, ${s.streak.best} дней лучшего ритма, ` +
            `${Object.keys(s.medals || {}).length} медалей, ${s.econ.gems} алмазов.`),
          el('button', {
            class: 'btn', style: 'background:none;box-shadow:none;border:1px solid var(--border-strong);align-self:flex-start',
            onClick: () => {
              const typed = prompt('Это нельзя отменить.\nНапиши УДАЛИТЬ заглавными, если точно решил.');
              if (typed !== 'УДАЛИТЬ') { toast('Ничего не тронул.', { kind: 'info' }); return; }
              let cancelled = false;
              toast('Прогресс будет удалён через 10 секунд.', {
                sticky: true, kind: 'warn',
                action: { label: 'Вернуть', fn: () => { cancelled = true; toast('Отменил. Всё на месте.', { kind: 'info' }); } },
              });
              setTimeout(() => {
                if (cancelled) return;
                storage.wipe();
                location.hash = '#/welcome';
                location.reload();
              }, 10000);
            },
          }, 'Начать заново'),
        );
        return el('div', { style: 'margin-top:var(--sp-4)' }, head, inner);
      }

      function buildCounters(s, agg) {
        let answersCorrect = 0, corrected = 0, trapsKnown = 0;
        for (const deck of ['deck1', 'deck2']) {
          for (const rec of Object.values(s.srs[deck] || {})) {
            answersCorrect += rec.ok || 0;
            corrected += Math.min(rec.ok || 0, rec.fail || 0);
          }
        }
        for (const f of content.falseFriends) {
          const rec = (s.srs.deck1 || {})[f.id];
          if (rec && rec.box >= 3) trapsKnown++;
        }
        const cleanDays = Object.values(s.days).filter(d => d.answered > 0 && d.answered === d.correct).length;
        return {
          answersCorrect, corrected, trapsKnown,
          known: agg.known, sessions: agg.totalSessions,
          streakBest: s.streak.best, weekBest: weekDone(s.days, s.day),
          cleanSessions: cleanDays, returnedAfter: s.flags.returnedAfter || 0,
        };
      }

      render();
      enterCard(wrap);
      const off = store.subscribe(st => st, render);
      return { destroy() { off(); } };
    },
  };
}

function sanitizeName(v) {
  return String(v)
    .replace(/[​-‏‪-‮⁦-⁩]/g, '')  // невидимые и управляющие направлением
    .trim()
    .slice(0, 20);
}
