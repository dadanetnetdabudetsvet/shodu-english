/* Профиль: аватар, имя, статистика, график, медали, настройки.
 *
 * Здесь нет процента точности: правило Р1 запрещает его везде.
 * Падение активности красится нейтральным цветом, а не цветом ошибки.
 * Обнуление прогресса спрятано за тремя барьерами.
 */

import { el, setChildren } from '../ui/dom.js';
import { LANGUAGES, currentLanguage, setLanguage } from '../i18n/index.js';
import { AVATAR_BASES, AVATAR_HATS, AVATAR_FRAMES } from '../domain/shop.js';
import { countKnown, levelInfo } from '../ui/reducer.js';
import { MEDALS, evaluateMedals, nextMedal, visibleMedals } from '../domain/medals.js';
import { gradeForLevel } from '../domain/scoring.js';
import { tierOf, MIN_INDEX, MAX_INDEX, SIZE_MIN, SIZE_MAX, sizeLabel, sizeMinutes } from '../domain/challenge.js';
import { THEMES, SIZES, setSize as countSet, setTitle, themesOf, isEmptySet } from '../domain/wordsets.js';
import { weekDone } from '../domain/streak.js';
import { weekdayShort, weekdayIndex } from '../core/day.js';
import { inviteUrl, shareTargets, INVITE_TEXT } from '../domain/referral.js';
import { premiumCard } from '../ui/premium-card.js';
import { hardReload } from '../core/sw-update.js';
import { sizeBounds, isActive as isPremium } from '../domain/premium.js';
import { sound } from '../core/sound.js';
import { storage } from '../core/storage.js';
import { toast } from '../ui/toast.js';
import { enterCard } from '../core/motion.js';
import { t } from '../i18n/index.js';

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

        setChildren(wrap, 
          header(s, avatarIdx, lvl, grade),
          statsGrid({ known, learning, s, totalMs, totalSessions }),
          chart(s),
          medalsBlock(s, { known, learning, totalSessions }),
          challengeBlock(s),
          wordSetBlock(s),
          premiumCard(s, { onInvite: shareInvite }),
          inviteBlock(s),
          settingsBlock(s),
        );
      }

      /* ── шапка ─────────────────────────────────────────────── */
      function header(s, avatarIdx, lvl, grade) {
        const bar = el('div', { class: 'bar__fill', style: `transform:scaleX(${lvl.ratio})` });
        const a = s.profile.avatar || {};
        const base = AVATAR_BASES.find(x => x.id === (a.base || 'b00')) || AVATAR_BASES[0];
        const hat = AVATAR_HATS.find(x => x.id === (a.hat || 'h00')) || AVATAR_HATS[0];
        const frame = AVATAR_FRAMES.find(x => x.id === (a.frame || 'f00')) || AVATAR_FRAMES[0];

        /* Аватар собирается из купленных частей. Раньше это был один
           эмодзи, который перебирался по кругу и никуда не вёл. */
        const face = el('button', {
          class: 'avatar',
          style: frame.css === 'none' ? '' : `--avatar-frame:${frame.css}`,
          'aria-label': t('Сменить облик'),
          onClick: () => { sound.tap(); ctx.go('quests/shop'); },
        },
          el('span', { class: 'avatar__base' }, base.emoji),
          hat.emoji ? el('span', { class: 'avatar__hat' }, hat.emoji) : null,
        );

        return el('div', { class: 'stack center', style: 'gap:var(--sp-2);align-items:center' },
          face,
          el('button', { class: 't-h1', style: 'background:none', onClick: () => editName(s) },
            s.profile.name || t('Дать себе имя ✏️')),
          /* Знак «Сходу Всё» рядом с именем. Обещан в карточке, значит
             должен быть виден там, где человек смотрит на себя. */
          isPremium(s) ? el('div', { class: 'prem-badge' }, '💠', t('Сходу Всё')) : null,
          el('div', { class: 't-sm' }, t('Уровень {v0} · {v1}', { v0: lvl.level, v1: t(grade.name) })),
          el('div', { class: 't-caption' }, t(grade.line)),
          el('div', { class: 'bar', style: 'width:100%;margin-top:var(--sp-2)' }, bar),
          el('div', { class: 't-caption' }, t('{v0} очков на этом уровне, весь уровень — {v1}', { v0: lvl.inLevel, v1: lvl.needed })),
        );
      }

      function editName(s) {
        sound.tap();
        const input = el('input', {
          class: 'option', type: 'text', value: s.profile.name || '',
          placeholder: t('Как тебя звать?'), maxlength: '20',
          style: 'width:100%;min-height:48px',
        });
        const sheet = el('div', {
          class: 'card stack sheet', role: 'dialog', 'aria-modal': 'true',
          style: 'z-index:90',
        },
          el('div', { style: 'font-weight:600' }, t('Как тебя звать?')),
          el('div', { class: 't-caption' }, t('Так приложение будет называть твой английский.')),
          input,
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => {
              store.dispatch({ type: 'PROFILE_SET', patch: { name: sanitizeName(input.value) } });
              close(); render();
            },
          }, t('Готово ✓')),
          el('button', { class: 'btn btn--ghost', onClick: close }, t('Отмена')),
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:89', onClick: close });
        document.body.append(back, sheet);
        setTimeout(() => input.focus(), 120);
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        function close() { sheet.remove(); back.remove(); document.removeEventListener('keydown', onKey); }
      }

      /* ── статистика ────────────────────────────────────────── */
      function statsGrid({ known, learning, s, totalMs, totalSessions }) {
        const tiles = [
          ['📗', known, t('читаю без перевода')],
          ['📘', learning, t('на подходе')],
          ['🔥', s.streak.current, t('дней подряд')],
          ['👑', s.streak.best, t('лучший ритм')],
          ['⏱', Math.round(totalMs / 60000), t('минут всего')],
          ['⭐', s.econ.xpTotal, t('очков всего')],
          ['⚡', totalSessions, t('занятий')],
          ['💎', s.econ.gems, t('алмазов')],
        ];
        return el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-2)' },
          ...tiles.map(([icon, val, cap]) => el('div', { class: 'tile' },
            el('div', { style: 'font-size:16px' }, icon),
            el('div', { class: 'tile__val', style: 'font-size:var(--fs-md)' }, String(val)),
            el('div', { class: 'tile__cap' }, cap))));
      }

      /* ── график по минутам ─────────────────────────────────── */
      function chart(s) {
        // Не рисуем дни, которых у человека ещё не было: тринадцать
        // пеньков на второй день читаются как провал, а не как старт.
        const lived = s.day - (s.createdDay ?? s.day) + 1;
        const N = Math.max(3, Math.min(14, lived));
        const bars = [];
        let max = 0;
        for (let i = N - 1; i >= 0; i--) {
          const d = s.day - i;
          const min = Math.round(((s.days[d]?.ms) || 0) / 60000);
          max = Math.max(max, min);
          bars.push({ day: d, min, isToday: i === 0 });
        }
        const top = Math.max(20, Math.ceil(max / 10) * 10);
        const H = 64;

        if (max === 0) {
          return el('div', { class: 'card center t-sm' },
            t('Здесь будет видно, как выглядит твоя неделя.'));
        }

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${N * 22} ${H + 16}`);
        svg.setAttribute('height', String(H + 16));
        svg.style.maxHeight = (H + 16) + 'px';
        svg.setAttribute('width', '100%');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', t('Занятия по дням, максимум {v0} минут', { v0: top }));

        bars.forEach((b, i) => {
          const x = i * 22 + 3;
          // Пустой день рисуется пеньком, а не отсутствием столбца:
          // иначе провал читается как поломка графика.
          const h = b.min === 0 ? 3 : Math.max(4, (b.min / top) * H);
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', x); rect.setAttribute('y', H - h);
          rect.setAttribute('width', 16); rect.setAttribute('height', h);
          rect.setAttribute('rx', 5);
          rect.setAttribute('fill', b.min === 0 ? 'var(--surface-3)'
            : b.isToday ? 'var(--accent)' : 'var(--accent)');
          rect.setAttribute('opacity', b.min === 0 ? '1' : b.isToday ? '1' : '.45');
          svg.append(rect);

          if (i % 2 === 0) {
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t.setAttribute('x', x + 8); t.setAttribute('y', H + 13);
            t.setAttribute('text-anchor', 'middle');
            t.setAttribute('font-size', '8');
            t.setAttribute('fill', 'var(--text-3)');
            t.textContent = weekdayShort(weekdayIndex(b.day), currentLanguage());
            svg.append(t);
          }
        });

        return el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
          el('div', { class: 'row row--between' },
            el('div', { style: 'font-weight:600' }, t('Минуты по дням')),
            el('div', { class: 't-caption' }, t('две недели · до {v0} мин', { v0: top }))),
          svg);
      }

      /* ── медали ────────────────────────────────────────────── */
      function medalsBlock(s, agg) {
        const counters = buildCounters(s, agg);
        const earned = s.medals || {};
        /* Выдача идёт одним действием: раньше экран мутировал состояние
           напрямую и присваивал медали с нулём алмазов, после чего
           редьюсер их уже не выдавал. */
        if (evaluateMedals(counters, earned).length) {
          store.dispatch({ type: 'MEDALS_CLAIM', counters });
        }
        const next = nextMedal(counters, earned);

        /* Показываем только близкое. Витрина недостижимого сообщает
           человеку о его недостаточности — это ровно то, что запрещено. */
        const visible = visibleMedals(counters, earned);

        return el('div', { class: 'card stack' },
          el('div', { class: 'row row--between' },
            el('div', { style: 'font-weight:600' }, t('Медали')),
            el('div', { class: 't-caption' }, t('{v0} из {v1}', { v0: Object.keys(earned).length, v1: MEDALS.length }))),
          next ? el('div', { class: 't-caption' }, t('Следующая: {v0} — {v1}', { v0: t(next.name), v1: t(next.hint) })) : null,
          el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-2)' },
            ...visible.map(m => {
              const has = !!earned[m.id];
              return el('div', {
                class: 'tile',
                style: has ? '' : 'opacity:.45;filter:grayscale(1)',
                title: t(m.hint),
                'aria-label': has ? t('{v0}. Получена.', { v0: t(m.name) }) : t('{v0}. Ещё впереди. {v1}', { v0: t(m.name), v1: t(m.hint) }),
              },
                el('div', { style: 'font-size:22px' }, has ? m.icon : '🔒'),
                el('div', { class: 'tile__cap' }, t(m.name)));
            })),
        );
      }

      /* ── база слов ─────────────────────────────────────────── */

      /* Подборка сужает базу под конкретную цель. Вся остальная логика
         работает так же: это фильтр поверх того же английского, а не
         отдельный курс. */
      /* ── друзья ────────────────────────────────────────────── */

      /* ── база слов ─────────────────────────────────────────── */

      /* Подборка сужает базу под конкретную цель. Вся остальная логика
         работает так же: это фильтр поверх того же английского, а не
         отдельный курс. */
      /* Подпись подборки: переводимая часть отдельно, число отдельно. */
      function setLabel(set) {
        const r = setTitle(set);
        return r.size ? `${t(r.key, r.vars)} · ${r.size}` : t(r.key, r.vars);
      }

      function wordSetBlock(s) {
        const cur = s.settings.wordSet || {};
        const picked = themesOf(cur);
        const isAuto = isEmptySet(cur);

        const save = (next) => {
          store.dispatch({ type: 'SETTINGS_SET', patch: { wordSet: next } });
          sound.select();
          render();
        };

        /* Подборка включается и выключается одним и тем же нажатием.
           Отдельной кнопки «снять» нет: человек и так знает этот жест
           по любому списку с галочками. */
        const toggleTheme = (id) => {
          const has = picked.includes(id);
          const themes = has ? picked.filter(x => x !== id) : [...picked, id];
          save(themes.length || cur.size ? { themes, size: cur.size || null } : null);
        };

        const themeBtn = (th) => {
          const on = picked.includes(th.id);
          return el('button', {
            class: 'setcard' + (on ? ' setcard--on' : ''),
            'aria-pressed': on ? 'true' : 'false',
            onClick: () => toggleTheme(th.id),
          },
            el('span', { style: 'font-size:20px' }, th.icon),
            el('span', { class: 'stack grow', style: 'gap:1px;text-align:left' },
              el('span', { style: 'font-weight:600' }, t(th.title)),
              el('span', { class: 't-caption' }, t(th.sub))),
            el('span', { class: on ? 'done-mark' : 'setcard__add' }, on ? '✓' : '+'));
        };

        const sizeBtn = (n) => {
          const on = (cur.size || null) === n;
          return el('button', {
            class: 'btn' + (on ? ' btn--primary' : ''),
            style: 'min-height:38px;padding:0 var(--sp-3);font-size:var(--fs-sm)',
            onClick: () => {
              const size = on && n !== null ? null : n;
              save(picked.length || size ? { themes: picked, size } : null);
            },
          }, n === null ? t('все') : String(n));
        };

        return el('div', { class: 'card stack', style: 'gap:var(--sp-3)' },
          el('div', { class: 'row row--between' },
            el('div', { style: 'font-weight:600' }, t('База слов 📚')),
            el('div', { class: 't-caption' }, setLabel(cur))),
          el('div', { class: 't-sm' },
            isAuto
              ? t('Сейчас берётся вся база, а какие слова подавать — решает сложность.')
              : t('В подборке {v0} слов. Всё остальное работает как обычно.', { v0: countSet(content, cur) })),

          el('div', { class: 'stack', style: 'gap:6px' },
            el('button', {
              class: 'setcard' + (isAuto ? ' setcard--on' : ''),
              onClick: () => save(null),
            },
              el('span', { style: 'font-size:20px' }, '🎚'),
              el('span', { class: 'stack grow', style: 'gap:1px;text-align:left' },
                el('span', { style: 'font-weight:600' }, t('По умолчанию')),
                el('span', { class: 't-caption' }, t('вся база, состав решает сложность'))),
              isAuto ? el('span', { class: 'done-mark' }, '✓') : null),

            el('div', { class: 't-caption', style: 'margin-top:var(--sp-2)' },
              t('МОЖНО ВЫБРАТЬ НЕСКОЛЬКО')),
            ...Object.values(THEMES).map(themeBtn)),

          el('div', { class: 'stack', style: 'gap:6px' },
            el('div', { class: 't-caption' }, t('СКОЛЬКО СЛОВ')),
            el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
              sizeBtn(null), ...SIZES.map(n => sizeBtn(n)))),

          picked.length > 1 ? el('div', { class: 't-caption' },
            t('Подборки складываются: берутся слова из всех выбранных тем.')) : null,
        );
      }

      /* ── друзья ────────────────────────────────────────────── */

      /* Прежний вариант был рядом одинаковых серых кнопок: девять штук
         в сетке, все на одно лицо, ни одна не притягивает палец.
         Теперь одна крупная кнопка делает главное действие, каналы
         стали узнаваемыми плитками с фирменным цветом, а служебная
         часть с кодом убрана под раскрытие. */
      async function shareInvite() {
        sound.tap();
        const st = store.state;
        const link = inviteUrl(location.href.split('#')[0].split('?')[0], (st.referral || {}).selfCode || '');
        const text = `${t(INVITE_TEXT)} ${link}`;
        try {
          if (navigator.share) await navigator.share({ title: 'Shodu', text: t(INVITE_TEXT), url: link });
          else { await navigator.clipboard.writeText(text); toast(t('Ссылка скопирована 🔗'), { kind: 'info' }); }
        } catch { /* человек передумал, это не ошибка */ }
      }

      function inviteBlock(s) {
        const ref = s.referral || {};
        const url = inviteUrl(location.href.split('#')[0].split('?')[0], ref.selfCode || '');
        const count = (ref.friends || []).length;
        const nth = count + 1;
        const nextGems = nth <= 3 ? [100, 200, 400][nth - 1] : 150;

        const brand = {
          telegram: '#2AABEE', whatsapp: '#25D366', vk: '#0077FF', ok: '#EE8208',
          viber: '#7360F2', x: '#111111', facebook: '#0866FF', email: '#6E56F8', sms: '#34C759',
        };

        const tiles = el('div', {
          style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:var(--sp-2)',
        }, ...shareTargets(url).map(target => el('a', {
          href: target.href, target: '_blank', rel: 'noopener',
          'aria-label': target.label,
          style: `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
                  min-height:64px;border-radius:var(--r-md);text-decoration:none;color:var(--text);
                  background:var(--surface-2);border:1px solid var(--border);
                  box-shadow:inset 0 -2px 0 ${brand[target.id] || 'var(--border-strong)'}`,
          onClick: () => sound.tap(),
        },
          el('span', { style: 'font-size:20px;line-height:1' }, target.icon),
          el('span', { style: 'font-size:10px;color:var(--text-2)' }, target.label),
        )));

        /* Служебная часть: код друга. Она нужна редко, поэтому свёрнута
           и не мешает главному действию. */
        const codeBody = el('div', { class: 'stack', hidden: true, style: 'gap:var(--sp-2);margin-top:var(--sp-2)' });
        const codeToggle = el('button', {
          class: 't-caption', style: 'width:100%;text-align:left;color:var(--text-2)',
          onClick: () => { codeBody.hidden = !codeBody.hidden; sound.tap(); },
        }, t('Друг прислал код? ▾'));

        const proofInput = el('input', {
          class: 'option', type: 'text', placeholder: 'ABC123-XYZW',
          style: 'width:100%;min-height:48px;text-transform:uppercase;letter-spacing:.08em',
        });
        codeBody.append(
          el('div', { class: 't-caption' }, t('Друг получает код после первого захода. Сервера у нас нет, поэтому подтверждение идёт кодом, а не само.')),
          proofInput,
          el('button', {
            class: 'btn btn--primary', onClick: () => {
              const v = proofInput.value.trim();
              if (!v) return;
              store.dispatch({ type: 'REFERRAL_CONFIRM', proof: v });
              proofInput.value = '';
              render();
            },
          }, t('Зачесть друга ✅')),
        );

        return el('div', { class: 'card stack', style: 'gap:var(--sp-3)' },
          el('div', { class: 'row row--between' },
            el('div', { style: 'font-weight:600' }, t('Зови своих 🎁')),
            count ? el('div', { class: 't-caption' }, t('{v0} уже с тобой', { v0: count })) : null),

          el('div', { class: 't-sm' },
            count === 0
              ? t('Вдвоём не бросают. Каждый друг приносит день заморозки, а трое открывают «Сходу Всё» навсегда.')
              : t('Следующий друг принесёт день заморозки и {v0} алмазов.', { v0: nextGems })),

          el('div', { class: 't-caption' },
            count === 0
              ? t('Плюс алмазы: 100 за первого, 200 за второго, 400 за третьего.')
              : t('Заморозок сейчас: {v0}', { v0: s.streak.freezes })),

          el('button', {
            class: 'btn btn--primary btn--cta', onClick: shareInvite,
          }, t('Позвать друга 🎁')),

          tiles,

          el('button', {
            class: 'btn btn--ghost', style: 'font-size:var(--fs-sm)',
            onClick: async () => {
              try { await navigator.clipboard.writeText(url); toast(t('Ссылка скопирована 🔗'), { kind: 'info' }); }
              catch { toast(url, { kind: 'info', ms: 8000 }); }
            },
          }, t('Скопировать ссылку 🔗')),

          el('div', {}, codeToggle, codeBody),
        );
      }

      /* ── настройки ─────────────────────────────────────────── */
      function settingsBlock(s) {
        const body = el('div', { class: 'stack', hidden: true, style: 'margin-top:var(--sp-3)' });
        const toggle = el('button', {
          class: 'row row--between', style: 'width:100%',
          onClick: () => { body.hidden = !body.hidden; sound.tap(); },
        }, el('span', { style: 'font-weight:600' }, t('⚙︎ Настройки')), el('span', { class: 't-sm' }, '▾'));

        body.append(
          selectRow(t('Тема'), s.settings.theme, [['auto', t('Авто')], ['light', t('Светлая')], ['dark', t('Тёмная')]],
            v => store.dispatch({ type: 'SETTINGS_SET', patch: { theme: v } })),
          selectRow(t('Анимации'), s.settings.motion, [['full', t('Полные')], ['calm', t('Спокойные')], ['off', t('Выключены')]],
            v => store.dispatch({ type: 'SETTINGS_SET', patch: { motion: v } })),
          selectRow(t('Размер шрифта'), s.settings.fontScale, [['s', t('Меньше')], ['m', t('Обычный')], ['l', t('Крупный')], ['xl', t('Очень крупный')]],
            v => store.dispatch({ type: 'SETTINGS_SET', patch: { fontScale: v } })),
          toggleRow(t('Звук'), s.settings.sound, v => store.dispatch({ type: 'SETTINGS_SET', patch: { sound: v } })),
          toggleRow(t('Озвучка слов'), s.settings.speech, v => store.dispatch({ type: 'SETTINGS_SET', patch: { speech: v } })),
          goalRow(s),
          el('button', {
            class: 'btn', style: 'justify-content:flex-start',
            onClick: () => { sound.tap(); ctx.go('install'); },
          }, t('📲 Как поставить на домашний экран')),
          languageRow(),
          rateRow(s),
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
        const knob = el('span', { class: 'switch__knob' });
        const sw = el('button', {
          class: 'switch' + (value ? ' switch--on' : ''),
          role: 'switch', 'aria-checked': String(!!value), 'aria-label': label,
          onClick: () => { sound.select(); onSet(!value); render(); },
        }, knob);
        return el('div', { class: 'row row--between', style: 'min-height:44px' },
          el('div', { class: 't-sm' }, label), sw);
      }

      function goalRow(s) {
        return selectRow(t('Сколько слов в день'), s.settings.dailyGoalWords,
          [[5, t('5 слов')], [10, t('10 слов')], [20, t('20 слов')]],
          v => store.dispatch({ type: 'SETTINGS_SET', patch: { dailyGoalWords: Number(v) } }));
      }

      /* ── сложность ─────────────────────────────────────────── */

      /* Вынесено из настроек отдельным блоком: это не техническая
         настройка, а ручка, которой человек пользуется постоянно.
         В настройках её никто не находил. */
      function challengeBlock(s) {
        return el('div', { class: 'card stack', style: 'gap:var(--sp-3)' },
          el('div', { class: 'row row--between' },
            el('div', { style: 'font-weight:600' }, t('Сложность 📶')),
            el('div', { class: 't-caption' }, t(tierOf(s.challenge.index).name))),
          el('div', { class: 't-sm' },
            t('Какие слова тебе подбирать. Двигай сам или просто отвечай после захода.')),
          challengeRow(s),
          sizeRow(s),
        );
      }

      /* Длина занятия — отдельная ручка от сложности. Одному тяжело от
         трудных слов, другому от того, что занятие не кончается. */
      function sizeRow(s) {
        const cur = s.challenge.size || 18;
        const bounds = sizeBounds(s);
        const val = el('div', { class: 't-sm t-num' }, String(cur));
        const desc = el('div', { class: 't-caption' },
          t('{v0} · примерно {v1} мин', { v0: t(sizeLabel(cur)), v1: sizeMinutes(cur) }));
        const input = el('input', {
          type: 'range', min: String(bounds.min), max: String(bounds.max), value: String(cur),
          style: 'width:100%', 'aria-label': t('Длина занятия'),
          onInput: (e) => {
            const v = Number(e.target.value);
            val.textContent = String(v);
            desc.textContent = t('{v0} · примерно {v1} мин', { v0: t(sizeLabel(v)), v1: sizeMinutes(v) });
          },
          onChange: (e) => { store.dispatch({ type: 'SESSION_SIZE_SET', size: Number(e.target.value) }); sound.select(); },
        });
        return el('div', { class: 'stack', style: 'gap:6px;margin-top:var(--sp-3)' },
          el('div', { class: 'row row--between' },
            el('div', { class: 't-sm' }, t('Длина занятия')), val),
          input, desc,
          el('div', { class: 't-caption' },
            t('Двигается сама от твоего ответа в конце занятия. Если поставишь сам, автоматика замолчит на три дня.')));
      }

      function challengeRow(s) {
        const val = el('div', { class: 't-sm t-num' }, String(s.challenge.index));
        const desc = el('div', { class: 't-caption' }, t(tierOf(s.challenge.index).desc));
        const input = el('input', {
          type: 'range', min: MIN_INDEX, max: MAX_INDEX, value: s.challenge.index,
          style: 'width:100%', 'aria-label': t('Ручка сложности'),
          onInput: (e) => {
            val.textContent = e.target.value;
            desc.textContent = t(tierOf(Number(e.target.value)).desc);
          },
          onChange: (e) => {
            store.dispatch({ type: 'CHALLENGE_SET', index: Number(e.target.value) });
            sound.tap();
          },
        });
        return el('div', { class: 'stack', style: 'gap:6px' },
          el('div', { class: 'row row--between' },
            el('div', { class: 't-sm' }, t('Сложность · {v0}', { v0: t(tierOf(s.challenge.index).name) })), val),
          input, desc,
          toggleRow(t('Подстраивать автоматически'), s.settings.autoChallenge,
            v => store.dispatch({ type: 'SETTINGS_SET', patch: { autoChallenge: v } })),
        );
      }

      /* Язык интерфейса. По умолчанию берётся из браузера, ручной выбор
         запоминается. Содержание слов пока остаётся русским: продукт
         построен на русско-английских когнатах, и честнее сказать это
         прямо, чем показать наполовину переведённое приложение. */
      function languageRow() {
        const cur = currentLanguage();
        const grid = el('div', {
          style: 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;max-height:220px;overflow:auto',
        }, ...LANGUAGES.map(l => el('button', {
          class: 'btn' + (l.code === cur ? ' btn--primary' : ''),
          style: 'min-height:42px;padding:0 var(--sp-2);font-size:var(--fs-sm);justify-content:flex-start',
          lang: l.code,
          onClick: async () => {
            sound.tap();
            await setLanguage(l.code);
            store.dispatch({ type: 'SETTINGS_SET', patch: { lang: l.code } });
            render();
          },
        }, l.name)));

        return el('div', { class: 'stack', style: 'gap:6px' },
          el('div', { class: 'row row--between' },
            el('div', { class: 't-sm' }, t('Язык интерфейса 🌍')),
            el('div', { class: 't-caption' }, LANGUAGES.find(l => l.code === cur)?.name || '')),
          grid,
          el('div', { class: 't-caption' }, t('Переводы слов пока на русском: приложение построено на словах, похожих на русские.')),
        );
      }

      /* Оценка и отзыв. Оценка сохраняется на устройстве и ничего никуда
         не отправляет: сервера нет, и обещать отправку было бы враньём.
         Отзыв человек отправляет сам, одним касанием, в мессенджер или
         почтой — так он видит, куда именно уходит текст. */
      function rateRow(s) {
        const given = s.profile.rating || 0;
        const stars = el('div', { class: 'row', style: 'gap:4px', role: 'radiogroup', 'aria-label': t('Оценка приложения') });
        for (let i = 1; i <= 5; i++) {
          stars.append(el('button', {
            role: 'radio', 'aria-checked': String(i === given),
            'aria-label': t('{v0} из 5', { v0: i }),
            style: `font-size:26px;line-height:1;min-width:40px;min-height:44px;
                    filter:${i <= given ? 'none' : 'grayscale(1)'};opacity:${i <= given ? '1' : '.45'}`,
            onClick: () => {
              sound.medal();
              store.dispatch({ type: 'PROFILE_SET', patch: { rating: i } });
              render();
            },
          }, '⭐'));
        }

        const thanks = given
          ? el('div', { class: 't-caption' },
              given >= 4
                ? t('Спасибо. Если не сложно, расскажи об этом кому-нибудь 🙏')
                : t('Понял. Расскажи, что мешает — починю.'))
          : null;

        const feedbackText = el('textarea', {
          class: 'option',
          rows: '3',
          placeholder: t('Что улучшить? Пиши как есть, без вежливости.'),
          style: 'width:100%;min-height:84px;padding:var(--sp-3);resize:vertical;font:inherit',
        });

        const send = (channel) => {
          const body = feedbackText.value.trim();
          if (!body) { toast(t('Напиши пару слов — иначе нечего отправлять.'), { kind: 'warn' }); return; }
          const meta = t('Оценка: {v0} из 5. Слов знаю: {v1}. Дней ритма: {v2}.', {
            v0: given || '—',
            v1: countKnown(store.state).known,
            v2: store.state.streak.current,
          });
          const full = `${body}\n\n${meta}`;
          if (channel === 'share' && navigator.share) {
            navigator.share({ title: t('Отзыв о Сходу'), text: full }).catch(() => {});
          } else if (channel === 'mail') {
            location.href = `mailto:?subject=${encodeURIComponent(t('Отзыв о Сходу'))}&body=${encodeURIComponent(full)}`;
          } else {
            navigator.clipboard.writeText(full)
              .then(() => toast(t('Отзыв скопирован. Вставь куда удобно 📋'), { kind: 'info' }))
              .catch(() => toast(full, { kind: 'info', ms: 9000 }));
          }
          feedbackText.value = '';
        };

        return el('div', { class: 'stack', style: 'gap:6px' },
          el('div', { class: 't-sm' }, t('Как тебе приложение?')),
          stars,
          thanks,
          feedbackText,
          el('div', { class: 'row', style: 'gap:var(--sp-2)' },
            navigator.share ? el('button', { class: 'btn btn--primary grow', onClick: () => send('share') }, t('Отправить 📤')) : null,
            el('button', { class: 'btn grow', onClick: () => send('mail') }, t('Почтой ✉️')),
            el('button', { class: 'btn', onClick: () => send('copy') }, t('Копировать 📋')),
          ),
        );
      }

      /* Экспорт и импорт. Кнопка называет файл страховкой, а вернуть
         его было некуда: это было самое крупное расхождение обещания и
         возможностей во всём продукте. */
      function exportRow() {
        const file = el('input', {
          type: 'file', accept: 'application/json,.json', style: 'display:none',
          onChange: (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              let incoming = null;
              try { incoming = JSON.parse(String(reader.result)); }
              catch { toast(t('Это не похоже на файл прогресса.'), { kind: 'warn' }); return; }
              if (!incoming || !incoming.srs) { toast(t('Это не похоже на файл прогресса.'), { kind: 'warn' }); return; }
              confirmImport(incoming);
            };
            reader.readAsText(f);
            e.target.value = '';
          },
        });

        return el('div', { class: 'stack', style: 'gap:var(--sp-2)' },
          el('div', { class: 'row', style: 'gap:var(--sp-2)' },
            el('button', {
              class: 'btn grow', onClick: () => {
                const blob = new Blob([JSON.stringify(store.state)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                const who = (store.state.profile.name || '').trim().toLowerCase().replace(/\s+/g, '-');
                const n = countKnown(store.state).known + countKnown(store.state).learning;
                a.download = `английский-${who ? who + '-' : ''}${n}-слов.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 30000);
                toast(t('Файл сохранён. Держи его как страховку.'), { kind: 'info' });
              },
            }, t('Сохранить прогресс в файл 💾')),
            el('button', { class: 'btn', onClick: () => file.click() }, t('Вернуть из файла 📂'))),
          file,
          el('div', { class: 't-caption' },
            t('Твои слова живут в этом браузере и никуда не уходят. Сервера у нас нет.')));
      }

      /* Импорт показывает обе стороны прежде, чем что-то заменит:
         одно нажатие не должно стирать месяц. */
      function confirmImport(incoming) {
        const mine = countKnown(store.state);
        const theirs = countKnown(incoming);
        const myDays = Object.keys(store.state.days || {}).length;
        const theirDays = Object.keys(incoming.days || {}).length;

        const side = (title, k, d) => el('div', { class: 'tile', style: 'align-items:flex-start;gap:2px' },
          el('div', { class: 'tile__cap' }, title),
          el('div', { class: 'tile__val', style: 'font-size:var(--fs-lg)' }, String(k.known + k.learning)),
          el('div', { class: 'tile__cap' }, t('слов')),
          el('div', { class: 'tile__cap' }, t('дней: {v0}', { v0: d })));

        const sheet = el('div', {
          class: 'card stack sheet', role: 'dialog', 'aria-modal': 'true',
          style: 'z-index:90',
        },
          el('div', { style: 'font-weight:600' }, t('Что оставить?')),
          el('div', { class: 'row', style: 'gap:var(--sp-2)' },
            side(t('здесь сейчас'), mine, myDays),
            side(t('в файле'), theirs, theirDays)),
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: close,
          }, t('Оставить как есть')),
          el('button', {
            class: 'btn',
            onClick: () => {
              storage.state = incoming;
              storage.flush();
              close();
              location.reload();
            },
          }, t('Взять из файла')),
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:89', onClick: close });
        document.body.append(back, sheet);
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        function close() { sheet.remove(); back.remove(); document.removeEventListener('keydown', onKey); }
      }

      /* Опасная зона: свёрнута, внизу, нейтральным цветом. Красный
         заголовок притягивает палец, поэтому его здесь нет. */
      function dangerZone(s) {
        const inner = el('div', { class: 'stack', hidden: true, style: 'margin-top:var(--sp-2)' });
        const head = el('button', {
          class: 't-caption', style: 'width:100%;text-align:left;color:var(--text-2)',
          onClick: () => { inner.hidden = !inner.hidden; },
        }, t('Дополнительно ▾'));

        const { known, learning } = countKnown(s);

        /* Что случилось в прошлый раз. Строка техническая, поэтому
           лежит в самом дальнем углу и появляется, только если что-то
           действительно было: иначе это шум на пустом месте. */
        let lastErr = null;
        try { lastErr = JSON.parse(localStorage.getItem('shodu:lastError') || 'null'); }
        catch { lastErr = null; }

        // append() печатает null словом «null»: пустые места убираем.
        inner.append(...[
          lastErr && lastErr.text ? el('div', { class: 'stack', style: 'gap:6px' },
            el('div', { class: 't-caption' }, t('ЧТО СЛУЧИЛОСЬ В ПРОШЛЫЙ РАЗ')),
            el('div', {
              class: 't-caption',
              style: 'font-family:var(--font-mono);white-space:pre-wrap;word-break:break-word;'
                   + 'max-height:120px;overflow:auto;background:var(--surface-2);'
                   + 'padding:var(--sp-2);border-radius:var(--r-sm)',
            }, [lastErr.at, lastErr.kind, lastErr.where].filter(Boolean).join(' · ') + '\n' + lastErr.text),
            el('button', {
              class: 'btn', style: 'align-self:flex-start;font-size:var(--fs-sm)',
              onClick: async () => {
                sound.tap();
                const text = [lastErr.at, lastErr.kind, lastErr.where].filter(Boolean).join(' · ')
                  + '\n' + lastErr.text;
                try { await navigator.clipboard.writeText(text); toast(t('Скопировано 📋'), { kind: 'info' }); }
                catch { toast(text.slice(0, 160), { kind: 'info', ms: 12000 }); }
              },
            }, t('Копировать 📋')),
            el('div', { class: 'topbar__sep', style: 'height:1px;width:100%;margin:var(--sp-3) 0' })) : null,

          /* Выход из застрявшей сборки. Стоит выше опасной кнопки и
             ничего не удаляет: сносится только кэш, слова остаются. */
          el('div', { class: 't-caption' },
            t('Если приложение странно себя ведёт, перезапуск начисто чинит это. Слова и ритм останутся.')),
          el('button', {
            class: 'btn', style: 'align-self:flex-start',
            onClick: () => { sound.tap(); hardReload(); },
          }, t('Перезапустить начисто 🔄')),


          el('div', { class: 'topbar__sep', style: 'height:1px;width:100%;margin:var(--sp-3) 0' }),

          el('div', { class: 't-caption' },
            t('Если начать заново, уйдут: {v0} слов, {v1} медалей, {v2} алмазов.', {
              v0: known + learning,
              v1: Object.keys(s.medals || {}).length,
              v2: s.econ.gems,
            })),
          el('button', {
            class: 'btn', style: 'background:none;box-shadow:none;border:1px solid var(--border-strong);align-self:flex-start',
            onClick: openWipeSheet,
          }, t('Начать заново')),
        ].filter(Boolean));
        return el('div', { style: 'margin-top:var(--sp-4)' }, head, inner);
      }

      /* Третий барьер: ввод слова целиком, без нативного диалога,
         с крупной безопасной кнопкой в фокусе. */
      function openWipeSheet() {
        const WORD = t('УДАЛИТЬ');
        const input = el('input', {
          class: 'option', type: 'text', placeholder: WORD,
          style: 'width:100%;min-height:48px;text-transform:uppercase;letter-spacing:.12em',
        });
        const go = el('button', {
          class: 'btn', disabled: true,
          style: 'background:none;box-shadow:none;border:1px solid var(--border-strong)',
          onClick: () => { close(); startWipe(); },
        }, t('Да, стереть всё'));
        input.addEventListener('input', () => {
          go.disabled = input.value.trim().toUpperCase() !== WORD.toUpperCase();
        });

        const sheet = el('div', {
          class: 'card stack sheet', role: 'dialog', 'aria-modal': 'true',
          style: 'z-index:90',
        },
          el('div', { style: 'font-weight:600' }, t('Это нельзя отменить')),
          el('div', { class: 't-sm' }, t('Напиши {v0} заглавными, если точно решил.', { v0: WORD })),
          input,
          el('button', { class: 'btn btn--primary btn--cta', onClick: close }, t('Оставить как есть')),
          go,
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:89', onClick: close });
        document.body.append(back, sheet);
        setTimeout(() => input.focus(), 120);
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        function close() { sheet.remove(); back.remove(); document.removeEventListener('keydown', onKey); }
      }

      /* Четвёртый барьер: окно отмены. Данные стираются не сразу. */
      function startWipe() {
        let cancelled = false;
        toast(t('Через 10 секунд твои слова уйдут. Ещё можно вернуть.'), {
          sticky: true, kind: 'warn',
          action: {
            label: t('Вернуть'),
            fn: () => { cancelled = true; toast(t('Отменил. Всё на месте.'), { kind: 'info' }); },
          },
        });
        setTimeout(() => {
          if (cancelled) return;
          storage.wipe();
          location.hash = '#/welcome';
          location.reload();
        }, 10000);
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
          friends: (s.referral?.friends || []).length,
        };
      }

      render();
      enterCard(wrap);
      /* Раньше подписка стояла на всё состояние, и профиль
         перерисовывался на каждый диспатч, включая чужие. */
      const off = store.subscribe(
        st => ({ xp: st.econ.xpTotal, gems: st.econ.gems, medals: Object.keys(st.medals || {}).length,
                 name: st.profile.name, avatar: st.profile.avatarIdx, ch: st.challenge.index,
                 goal: st.settings.dailyGoalWords, theme: st.settings.theme,
                 sound: st.settings.sound, speech: st.settings.speech,
                 auto: st.settings.autoChallenge, motion: st.settings.motion,
                 font: st.settings.fontScale, lang: st.settings.lang }),
        render);
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
