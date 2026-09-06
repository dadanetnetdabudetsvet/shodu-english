/* Профиль: аватар, имя, статистика, график, медали, настройки.
 *
 * Здесь нет процента точности: правило Р1 запрещает его везде.
 * Падение активности красится нейтральным цветом, а не цветом ошибки.
 * Обнуление прогресса спрятано за тремя барьерами.
 */

import { el, setChildren } from '../ui/dom.js';
import { LANGUAGES, currentLanguage, setLanguage } from '../i18n/index.js';
import { countKnown, levelInfo } from '../ui/reducer.js';
import { MEDALS, evaluateMedals, nextMedal } from '../domain/medals.js';
import { gradeForLevel } from '../domain/scoring.js';
import { tierOf, MIN_INDEX, MAX_INDEX } from '../domain/challenge.js';
import { weekDone } from '../domain/streak.js';
import { WEEKDAY_SHORT, weekdayIndex } from '../core/day.js';
import { inviteUrl, shareTargets, INVITE_TEXT } from '../domain/referral.js';
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
          inviteBlock(s),
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
            'aria-label': t('Сменить аватар'),
            onClick: () => {
              sound.tap();
              store.dispatch({ type: 'PROFILE_SET', patch: { avatarIdx: (avatarIdx + 1) % AVATARS.length } });
              render();
            },
          }, AVATARS[avatarIdx]),
          el('button', {
            class: 't-h1', style: 'background:none',
            onClick: () => editName(s),
          }, s.profile.name || t('Дать себе имя ✏️')),
          el('div', { class: 't-sm' }, t('Уровень {v0} · {v1}', { v0: lvl.level, v1: t(grade.name) })),
          el('div', { class: 't-caption' }, t(grade.line)),
          el('div', { class: 'bar', style: 'width:100%;margin-top:var(--sp-2)' }, bar),
          el('div', { class: 't-caption' }, t('{v0} из {v1} очков до следующего', { v0: lvl.inLevel, v1: lvl.needed })),
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
          ['📗', known, t('слов знаю')],
          ['📘', learning, t('в работе')],
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
            t('Пока пусто. После первого занятия здесь появится твой ритм.'));
        }

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${N * 26} ${H + 22}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', t('Занятия по дням, максимум {v0} минут', { v0: top }));

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
            el('div', { style: 'font-weight:600' }, t('Минуты по дням')),
            el('div', { class: 't-caption' }, t('две недели · до {v0} мин', { v0: top }))),
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
                'aria-label': has ? t('{v0}. Получена.', { v0: t(m.name) }) : t('{v0}. Закрыта. {v1}', { v0: t(m.name), v1: t(m.hint) }),
              },
                el('div', { style: 'font-size:22px' }, has ? m.icon : '🔒'),
                el('div', { class: 'tile__cap' }, t(m.name)));
            })),
        );
      }

      /* ── друзья ────────────────────────────────────────────── */
      /* ── друзья ────────────────────────────────────────────── */

      /* Прежний вариант был рядом одинаковых серых кнопок: девять штук
         в сетке, все на одно лицо, ни одна не притягивает палец.
         Теперь одна крупная кнопка делает главное действие, каналы
         стали узнаваемыми плитками с фирменным цветом, а служебная
         часть с кодом убрана под раскрытие. */
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
          el('div', { class: 't-caption' }, t('Друг получает код после первого занятия. Пока нет сервера, приложение не может узнать об этом само.')),
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
              ? t('Вдвоём не бросают. За первого друга — 100 алмазов, за второго 200, за третьего 400.')
              : t('Следующий друг принесёт {v0} алмазов.', { v0: nextGems })),

          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: async () => {
              sound.tap();
              const text = `${t(INVITE_TEXT)} ${url}`;
              try {
                if (navigator.share) await navigator.share({ title: 'Shodu', text: t(INVITE_TEXT), url });
                else { await navigator.clipboard.writeText(text); toast(t('Ссылка скопирована 🔗'), { kind: 'info' }); }
              } catch { /* человек передумал, это не ошибка */ }
            },
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
        return el('div', { class: 'row row--between' },
          el('div', { class: 't-sm' }, label),
          el('button', {
            class: 'btn' + (value ? ' btn--primary' : ''),
            style: 'min-height:38px;padding:0 var(--sp-4)',
            onClick: () => { sound.tap(); onSet(!value); render(); },
          }, value ? t('Вкл') : t('Выкл')));
      }

      function goalRow(s) {
        return selectRow(t('Цель на день'), s.settings.dailyGoalWords,
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
            el('div', { style: 'font-weight:600' }, t('Сложность 🎚')),
            el('div', { class: 't-caption' }, t(tierOf(s.challenge.index).name))),
          el('div', { class: 't-sm' },
            t('Насколько трудные слова подбирать. Можно двигать самому, а можно просто отвечать после занятий.')),
          challengeRow(s),
        );
      }

      function challengeRow(s) {
        const val = el('div', { class: 't-sm t-num' }, String(s.challenge.index));
        const desc = el('div', { class: 't-caption' }, t(tierOf(s.challenge.index).desc));
        const input = el('input', {
          type: 'range', min: MIN_INDEX, max: MAX_INDEX, value: s.challenge.index,
          style: 'width:100%', 'aria-label': t('Сложность сложности'),
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
          }, t('Сохранить прогресс в файл 💾')));
      }

      /* Опасная зона: свёрнута, внизу, нейтрального цвета, с подтверждением
         вводом слова и окном отмены. Красный заголовок притягивает палец,
         поэтому его здесь нет. */
      function dangerZone(s) {
        const inner = el('div', { class: 'stack', hidden: true, style: 'margin-top:var(--sp-2)' });
        const head = el('button', {
          class: 't-caption', style: 'width:100%;text-align:left;color:var(--text-2)',
          onClick: () => { inner.hidden = !inner.hidden; },
        }, t('Дополнительно ▾'));

        const { known } = countKnown(s);
        inner.append(
          el('div', { class: 't-caption' },
            t('Если начать заново, исчезнут: {v0} слов, {v1} дней лучшего ритма, ', { v0: known, v1: s.streak.best }) +
            t('{v0} медалей, {v1} алмазов.', { v0: Object.keys(s.medals || {}).length, v1: s.econ.gems })),
          el('button', {
            class: 'btn', style: 'background:none;box-shadow:none;border:1px solid var(--border-strong);align-self:flex-start',
            onClick: () => {
              const typed = prompt('Это нельзя отменить.\nНапиши УДАЛИТЬ заглавными, если точно решил.');
              if (typed !== t('УДАЛИТЬ')) { toast('Ничего не тронул.', { kind: 'info' }); return; }
              let cancelled = false;
              toast('Прогресс будет удалён через 10 секунд.', {
                sticky: true, kind: 'warn',
                action: { label: t('Вернуть'), fn: () => { cancelled = true; toast('Отменил. Всё на месте.', { kind: 'info' }); } },
              });
              setTimeout(() => {
                if (cancelled) return;
                storage.wipe();
                location.hash = '#/welcome';
                location.reload();
              }, 10000);
            },
          }, t('Начать заново')),
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
          friends: (s.referral?.friends || []).length,
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
