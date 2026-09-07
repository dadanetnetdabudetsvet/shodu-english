/* Экран «Сегодня».
 *
 * Здесь нет кнопки «начать занятие», и это главное решение экрана.
 * Появится — экран станет прихожей перед занятием, а он нужен ровно
 * для обратного: для дня, когда заниматься не готов.
 *
 * Разворот меняется раз в сутки и одинаков в течение дня. Это делает
 * его свежей единицей, ради которой возвращаются.
 */

import { el, en, setChildren, greeting } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { wordOfDay, ruleOfDay, differenceOfDay, trapOfDay, portrait } from '../domain/today.js';
import { isKnown } from '../domain/srs.js';
import { moodFor } from '../core/mood.js';
import { KEYS, keyCoverage } from '../domain/keys.js';
import { speech } from '../core/speech.js';
import { sound } from '../core/sound.js';
import { animate } from '../core/motion.js';

export function screen(store, content) {
  return {
    mount(root, ctx) {
      store.dispatch({ type: 'DAY_TICK' });
      const s = store.state;
      const day = s.day;
      const mood = moodFor(new Date(), s.settings.mood);

      const wd = wordOfDay(content, day);
      const rd = ruleOfDay(content, day);
      const df = differenceOfDay(content, day);
      const tr = trapOfDay(content, day);
      const me = portrait(s, content, isKnown);
      const openKeys = KEYS.filter(k => (s.keys || {})[k.id]);

      /* Присутствие засчитывается: человек пришёл и что-то взял.
         Без этого весь разворот — декор вокруг единственного
         настоящего действия, и это считывается за неделю. */
      let counted = false;
      const countPresence = () => {
        if (counted) return;
        counted = true;
        store.dispatch({ type: 'PRESENCE' });
      };
      const presenceTimer = setTimeout(countPresence, 25000);

      const wrap = el('div', { class: 'screen' });
      root.replaceChildren(wrap);

      const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

      setChildren(wrap,
        el('div', { class: 'stack', style: 'gap:2px' },
          el('div', { class: 't-caption', style: 'text-transform:capitalize' }, dateLine),
          el('h1', { class: 't-h1' }, greeting(s.profile.name))),

        mood.line ? el('div', { class: 't-sm' }, t(mood.line)) : null,

        me ? el('div', { class: 'card--hero stack', style: 'gap:4px' },
          el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.8)' }, t('ПРО ТЕБЯ')),
          el('div', { style: 'font-size:var(--fs-md);font-weight:600' }, t(me.text, me.vars))) : null,

        /* Слово дня. Крупно, с транскрипцией и звуком: его можно
           просто послушать и закрыть приложение. */
        wd ? card(t('СЛОВО ДНЯ'),
          el('div', { class: 'stack', style: 'gap:4px' },
            el('div', { class: 'row', style: 'gap:var(--sp-3);align-items:center' },
              en(wd.en, ''), 
              el('div', { class: 'grow' }),
              speech.available ? el('button', {
                class: 'qcard__speak', style: 'position:static',
                'aria-label': t('Произнести {v0}', { v0: wd.en }),
                onClick: () => { countPresence(); sound.tap(); speech.say(wd.en); },
              }, '🔊') : null),
            el('div', { class: 't-ipa' }, `${wd.ipa} · ${wd.tr}`),
            el('div', { style: 'font-size:var(--fs-md);font-weight:600' }, wd.ru),
            el('div', { class: 't-sm' }, wd.hint)), 'word') : null,

        /* Разница между тем, как человек думает, и тем, как звучит.
           Самый сильный контент продукта, и до сих пор он жил только
           внутри задания. */
        df ? card(t('А ЗВУЧИТ ИНАЧЕ'),
          el('div', { class: 'stack', style: 'gap:var(--sp-2)' },
            en(df.word.en, 't-h2'),
            el('div', { class: 'diff' },
              el('div', { class: 'diff__half' },
                el('div', { class: 't-caption' }, t('ты думаешь')),
                el('div', { style: 'font-weight:600' }, df.expected),
                el('div', { class: 't-caption' }, t('{v0} слога', { v0: df.ruSyl }))),
              el('div', { class: 'diff__half diff__half--right' },
                el('div', { class: 't-caption' }, t('а звучит')),
                el('div', { style: 'font-weight:600' }, df.actual),
                el('div', { class: 't-caption' }, t('{v0} слога', { v0: df.enSyl })))),
            el('div', { class: 't-sm' },
              df.kind === 'drop' ? t('Слог просто выпал. Никто его не произносит.')
                : t('Ударение уехало на другой слог. Больше в этом слове ничего не поменялось.')),
            speech.available ? el('button', {
              class: 'btn', style: 'align-self:flex-start',
              onClick: () => { countPresence(); speech.say(df.word.en); },
            }, t('🔊 Послушать')) : null), 'diff') : null,

        /* Ловушка дня: единственное место, где допустимо лёгкое
           напряжение, потому что ставки объявлены нулевыми. */
        tr ? card(t('ЛОВУШКА'),
          el('div', { class: 'stack', style: 'gap:6px' },
            el('div', { class: 'row', style: 'gap:var(--sp-2);align-items:baseline' },
              en(tr.en, 't-h2'),
              el('div', { class: 't-sm' }, t('это не «{v0}»', { v0: tr.looks_like }))),
            el('div', { style: 'font-weight:600' }, tr.actual_ru),
            el('div', { class: 't-sm' }, tr.note || tr.hint || '')), 'trap') : null,

        /* Правило дня подаётся не как правило, а как совпадение. */
        rd ? card(t('СОВПАДЕНИЕ'),
          el('div', { class: 'stack', style: 'gap:6px' },
            el('div', { style: 'font-weight:600' }, rd.title),
            el('div', { class: 't-sm' }, rd.ru_parallel),
            el('div', { class: 'card card--flat', style: 'margin-top:4px' },
              el('div', { lang: 'en', style: 'font-weight:600' }, rd.en_example),
              el('div', { class: 't-sm' }, rd.ru_example)),
            rd.why_easy ? el('div', { class: 't-caption' }, rd.why_easy) : null), 'rule') : null,

        /* Открытые ключи — коллекция, которая растёт сама и которую
           приятно разглядывать. Каждый ключ это не слово, а правило. */
        openKeys.length ? el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
          el('div', { class: 't-caption' }, t('ТВОИ КЛЮЧИ')),
          el('div', { class: 't-sm' },
            t('Каждый ключ открывает сразу пачку слов, которых ты не видел.')),
          ...openKeys.map(k => el('div', { class: 'row', style: 'gap:var(--sp-2);align-items:baseline' },
            el('span', {}, k.icon),
            el('span', { style: 'font-weight:600' }, k.title),
            el('span', { class: 'grow' }),
            el('span', { class: 't-caption' }, t('{v0} слов', { v0: keyCoverage(k, content) })))),
        ) : null,

        el('div', { class: 't-caption center', style: 'padding:var(--sp-4) 0' },
          t('Это всё на сегодня. Заниматься не обязательно.')),
      );

      function card(label, body, kind) {
        const node = el('div', { class: 'card stack', style: 'gap:6px', dataset: { kind } },
          el('div', { class: 't-caption' }, label), body);
        node.addEventListener('pointerdown', countPresence, { once: true, passive: true });
        return node;
      }

      animate(wrap, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'linear' });

      return { destroy() { clearTimeout(presenceTimer); speech.cancel(); } };
    },
  };
}
