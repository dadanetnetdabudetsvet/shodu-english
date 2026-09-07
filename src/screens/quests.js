/* Страница челленджей.
 *
 * Три вещи на одном экране: месяц целиком, три задания на сегодня и
 * список того, что вообще можно здесь делать.
 *
 * Ничего не сгорает и не отнимается. Невыполненный челлендж не имеет
 * последствий: он просто не даёт награду. Это прямое требование
 * правила Р6.
 */

import { el, setChildren } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { questsForDay, questProgress, questDone, ACTIVITIES, monthStats } from '../domain/quests.js';
import { SECTIONS, FREEZE, isOwned, itemById } from '../domain/shop.js';
import { dayToDate } from '../core/day.js';
import { countKnown } from '../ui/reducer.js';
import { enterCard, fillBar, animate, tweenNumber } from '../core/motion.js';
import { sound } from '../core/sound.js';

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const wrap = el('div', { class: 'screen' });
      root.replaceChildren(wrap);
      let tab = ctx.params[0] === 'shop' ? 'shop' : 'today';

      function render() {
        const s = store.state;
        setChildren(wrap,
          monthCard(s),
          tabs(),
          tab === 'today' ? todayBlock(s) : shopBlock(s),
        );
      }

      /* ── месяц ─────────────────────────────────────────────── */
      function monthCard(s) {
        const m = monthStats(s.days, s.day, dayToDate);
        const monthName = dayToDate(s.day).toLocaleDateString(undefined, { month: 'long' });
        const { known } = countKnown(s);
        const target = Math.max(30, Math.ceil((m.words || 1) / 30) * 30);
        const fill = el('div', { class: 'bar__fill' });
        const num = el('div', { class: 't-num', style: 'font-size:var(--fs-3xl);font-weight:800;line-height:1' }, '0');

        return el('div', { class: 'card--hero stack', style: 'gap:var(--sp-3)' },
          el('div', { class: 'row row--between' },
            el('div', { style: 'font-size:var(--fs-md);font-weight:700;text-transform:capitalize' }, monthName),
            el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.8)' },
              t('{v0} слов у тебя', { v0: known }))),
          el('div', { class: 'row', style: 'align-items:flex-end;gap:var(--sp-3)' },
            el('div', { class: 'stack', style: 'gap:0' },
              num,
              el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.8)' }, t('слов за месяц'))),
            el('div', { class: 'grow' }),
            el('div', { class: 'stack center', style: 'gap:0' },
              el('div', { class: 't-num', style: 'font-size:var(--fs-xl);font-weight:800' }, String(m.active)),
              el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.8)' }, t('дней в деле'))),
            el('div', { class: 'stack center', style: 'gap:0' },
              el('div', { class: 't-num', style: 'font-size:var(--fs-xl);font-weight:800' }, String(m.longest)),
              el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.8)' }, t('подряд')))),
          el('div', { class: 'bar', style: 'background:rgba(255,255,255,.22)' }, fill),
          el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.75)' },
            t('Идёт {v0}-й день месяца', { v0: m.passed, v1: m.daysInMonth })),
          (() => { setTimeout(() => { tweenNumber(num, 0, m.words, 900); fillBar(fill, 0, Math.min(1, m.words / target)); }, 60); return null; })(),
        );
      }

      function tabs() {
        const mk = (id, label) => el('button', {
          class: 'btn' + (tab === id ? ' btn--primary' : ''),
          style: 'flex:1;min-height:40px;font-size:var(--fs-sm)',
          onClick: () => { tab = id; sound.select(); render(); },
        }, label);
        return el('div', { class: 'row', style: 'gap:var(--sp-2)' },
          mk('today', t('Сегодня')), mk('shop', t('Лавка 💎')));
      }

      /* ── сегодня ───────────────────────────────────────────── */
      function todayBlock(s) {
        const day = s.days[s.day];
        const quests = questsForDay(s.day, s.settings.dailyGoalWords || 10);
        const claimed = new Set((s.questsClaimed || {})[String(s.day)] || []);
        const ready = quests.some(q => questDone(q, day) && !claimed.has(q.id));

        const rows = quests.map(q => {
          const have = questProgress(q, day);
          const done = questDone(q, day);
          const got = claimed.has(q.id);
          const fill = el('div', { class: 'bar__fill' });
          setTimeout(() => fillBar(fill, 0, Math.min(1, have / q.need)), 60);
          return el('div', { class: 'card row', style: 'gap:var(--sp-3);align-items:center' },
            el('div', { style: `font-size:26px;width:34px;text-align:center;${done ? '' : 'filter:grayscale(.6);opacity:.75'}` }, q.icon),
            el('div', { class: 'stack grow', style: 'gap:5px' },
              el('div', { class: 'row row--between' },
                el('div', { style: 'font-weight:600' }, t(q.title)),
                el('div', { class: 't-caption t-num' }, `${Math.min(have, q.need)}/${q.need}`)),
              el('div', { class: 't-caption' }, t(q.hint)),
              el('div', { class: 'bar bar--thin' }, fill)),
            el('div', { class: 't-sm t-num', style: 'flex:none' }, got ? '✓' : `+${q.gems} 💎`),
          );
        });

        const claimBtn = ready && el('button', {
          class: 'btn btn--primary btn--cta',
          onClick: () => { store.dispatch({ type: 'QUEST_CLAIM' }); render(); },
        }, t('Это твоё 💎'));

        return el('div', { class: 'stack', style: 'gap:var(--sp-3)' },
          el('div', { class: 'row row--between' },
            el('div', { class: 't-h2' }, t('Сегодня')),
            el('div', { class: 't-caption' }, t('ничего не сгорает'))),
          ...rows,
          claimBtn,
          el('div', { class: 't-h2', style: 'margin-top:var(--sp-4)' }, t('Чем ещё заняться')),
          el('div', { class: 't-caption' }, t('Просто список того, что здесь есть. Наград за это нет.')),
          el('div', { class: 'stack', style: 'gap:0' },
            ...ACTIVITIES.map(a => el('button', {
              class: 'list-row',
              onClick: () => {
                sound.tap();
                if (a.route === 'quests' && a.param === 'shop') { tab = 'shop'; render(); return; }
                ctx.go(a.route);
              },
            },
              el('span', { style: 'font-size:20px;width:30px;text-align:center' }, a.icon),
              el('span', { class: 'stack grow', style: 'gap:1px' },
                el('span', { style: 'font-weight:600' }, t(a.title)),
                el('span', { class: 't-caption' }, t(a.sub))),
              el('span', { class: 't-caption' }, '›'),
            ))),
        );
      }

      /* ── лавка ─────────────────────────────────────────────── */
      function shopBlock(s) {
        const owned = s.owned || [];
        const avatar = s.profile.avatar || {};
        const slotOf = { bases: 'base', hats: 'hat', frames: 'frame' };

        const sections = SECTIONS.map(sec => el('div', { class: 'stack', style: 'gap:var(--sp-2)' },
          el('div', { class: 't-h2' }, t(sec.title)),
          el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-2)' },
            ...sec.items.map(item => {
              const have = isOwned(owned, item);
              const slot = slotOf[sec.id];
              const active = sec.id === 'accents'
                ? (s.settings.accent || 'a00') === item.id
                : avatar[slot] === item.id;
              return el('button', {
                class: 'tile',
                style: `gap:4px;${active ? 'box-shadow:var(--sh-accent-glow);border:1px solid var(--accent)' : ''}`,
                onClick: () => {
                  if (!have) { store.dispatch({ type: 'SHOP_BUY', id: item.id }); render(); return; }
                  sound.select();
                  if (sec.id === 'accents') store.dispatch({ type: 'ACCENT_SET', id: item.id });
                  else store.dispatch({ type: 'AVATAR_SET', patch: { [slot]: item.id } });
                  render();
                },
              },
                preview(sec.id, item),
                el('div', { class: 'tile__cap' }, t(item.name)),
                el('div', { class: 't-caption' },
                  have ? (active ? t('на тебе') : t('надеть')) : `${item.price} 💎`),
              );
            }))));

        const freezeCard = el('div', { class: 'card row', style: 'gap:var(--sp-3);align-items:center' },
          el('div', { style: 'font-size:26px' }, '🧊'),
          el('div', { class: 'stack grow', style: 'gap:2px' },
            el('div', { style: 'font-weight:600' }, t(FREEZE.name)),
            el('div', { class: 't-caption' },
              t('Сейчас у тебя {v0}. Одна выдаётся бесплатно каждые семь дней.', { v0: s.streak.freezes }))),
          el('button', {
            class: 'btn', style: 'flex:none',
            onClick: () => { store.dispatch({ type: 'SHOP_BUY', id: FREEZE.id }); render(); },
          }, `${FREEZE.price} 💎`),
        );

        return el('div', { class: 'stack', style: 'gap:var(--sp-4)' },
          el('div', { class: 'card row row--between' },
            el('div', { class: 'stack', style: 'gap:2px' },
              el('div', { style: 'font-weight:600' }, t('У тебя {v0} алмазов', { v0: s.econ.gems })),
              el('div', { class: 't-caption' }, t('Слова здесь не продаются. Только облик и защита ритма.'))),
            el('div', { style: 'font-size:26px' }, '💎')),
          freezeCard,
          ...sections,
        );
      }

      function preview(secId, item) {
        if (secId === 'accents') {
          return el('div', { style: `width:30px;height:30px;border-radius:var(--r-full);background:${item.color}` });
        }
        if (secId === 'frames') {
          return el('div', {
            style: `width:30px;height:30px;border-radius:var(--r-full);
                    background:${item.css === 'none' ? 'var(--surface-2)' : item.css}`,
          });
        }
        return el('div', { style: 'font-size:24px;line-height:1' }, item.emoji || '—');
      }

      render();
      enterCard(wrap);
      const off = store.subscribe(
        st => ({ gems: st.econ.gems, owned: (st.owned || []).length, day: st.day,
                 avatar: JSON.stringify(st.profile.avatar), accent: st.settings.accent }),
        render);
      return { destroy() { off(); } };
    },
  };
}
