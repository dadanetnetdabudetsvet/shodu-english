/* Экран «Сегодня».
 *
 * Здесь нет кнопки «начать занятие», и это главное решение экрана.
 * Появится — экран станет прихожей перед занятием, а он нужен ровно
 * для обратного: для дня, когда заниматься не готов.
 *
 * Порядок разворота держит идею продукта, а не логику учебника.
 * Сначала человек читает про себя, потом получает доказательство,
 * что уже читает по-английски, и только после этого встречает
 * содержимое. Слово дня стоит четвёртым не потому, что оно
 * неважное, а потому что оно про язык, а первые экраны — про него.
 *
 * Карточки различаются цветом. Одинаково серые карточки читаются
 * как список дел; разные — как развороты журнала, который листают.
 */

import { el, en, setChildren, greeting } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { wordOfDay, ruleOfDay, differenceOfDay, trapOfDay, portrait, settled, readable } from '../domain/today.js';
import { isKnown } from '../domain/srs.js';
import { moodFor } from '../core/mood.js';
import { KEYS, keyCoverage } from '../domain/keys.js';
import { countKnown } from '../ui/reducer.js';
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
      const read = readable(s, content, day, isKnown);
      const openKeys = KEYS.filter(k => (s.keys || {})[k.id]);
      const rested = settled(s, content, day);
      const { known, learning } = countKnown(s);
      const total = known + learning;
      const cognates = (content.deck1 || []).filter(w => !w.falseFriend).length;

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

        /* Разворот открывается человеком, а не словом. Первое, что он
           здесь видит, — размер того, что у него уже есть.

           У новичка своих слов ещё нет, и пустой герой был бы худшим
           первым кадром: он сообщал бы ноль. Поэтому ему показывается
           то, что у него есть и без нас, — сколько английских слов
           почти совпадают с русскими. Это не аванс и не комплимент,
           это размер колоды, который можно пересчитать. */
        el('div', { class: 'tday-hero' },
          el('div', { class: 'tday-hero__glow' }),
          el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.72)' },
            total > 0 ? t('ТВОЙ АНГЛИЙСКИЙ') : t('ЖДЁТ ТЕБЯ')),
          el('div', { class: 'tday-hero__num t-num' },
            String(total > 0 ? total : cognates)),
          el('div', { class: 'tday-hero__sub' },
            total === 0 ? t('английских слов почти совпадают с русскими')
              : known === 0 ? t('слов уже лежат у тебя')
              : known === total ? t('слов, и все ты достаёшь не думая')
              : t('слов, и {v0} из них ты достаёшь не думая', { v0: known })),
          total === 0
            ? el('div', { class: 'tday-hero__note' },
                t('Ты их не учил и всё равно узнаёшь. Ниже — три штуки на сегодня.'))
            : me ? el('div', { class: 'tday-hero__note' }, t(me.text, me.vars)) : null,
          mood.line ? el('div', { class: 'tday-hero__mood' }, t(mood.line)) : null,
        ),

        /* Доказательство. Не «ты молодец», а целое предложение, в
           котором нет ни одного слова мимо тебя. */
        read ? readCard(read) : null,

        /* Находка вместо потери: пока человека не было, слова улеглись
           сами. Это правда о том, как работает память, а не утешение. */
        rested.length >= 3 ? tcard('rest', t('ПОКА ТЕБЯ НЕ БЫЛО'),
          el('div', { class: 'stack', style: 'gap:4px' },
            el('div', { class: 'tcard__big' }, t('{v0} слов улеглись сами', { v0: rested.length })),
            el('div', { class: 't-sm' },
              t('Память доделывает работу без тебя. Эти слова теперь достаются легче, чем когда ты их оставил.')))) : null,

        /* Слово дня. Крупно, с транскрипцией и звуком: его можно
           просто послушать и закрыть приложение. */
        wd ? tcard('word', t('СЛОВО ДНЯ'),
          el('div', { class: 'stack', style: 'gap:6px' },
            el('div', { class: 'row', style: 'gap:var(--sp-3);align-items:center' },
              en(wd.en, 'tcard__en'),
              el('div', { class: 'grow' }),
              speech.available ? el('button', {
                class: 'tcard__speak',
                'aria-label': t('Произнести {v0}', { v0: wd.en }),
                onClick: () => { countPresence(); sound.tap(); speech.say(wd.en); },
              }, '🔊') : null),
            el('div', { class: 't-ipa' }, `${wd.ipa} · ${wd.tr}`),
            el('div', { class: 'tcard__big' }, wd.ru),
            el('div', { class: 't-sm' }, wd.hint))) : null,

        /* Разница между тем, как человек думает, и тем, как звучит. */
        df ? tcard('diff', t('А ЗВУЧИТ ИНАЧЕ'),
          el('div', { class: 'stack', style: 'gap:var(--sp-2)' },
            en(df.word.en, 'tcard__en'),
            el('div', { class: 'diff' },
              el('div', { class: 'diff__half' },
                el('div', { class: 't-caption' }, t('ты думаешь')),
                el('div', { style: 'font-weight:600' }, df.expected),
                el('div', { class: 't-caption' },
                  df.kind === 'drop' ? t('{v0} слога', { v0: df.ruSyl }) : t('ударение своё'))),
              el('div', { class: 'diff__half diff__half--right' },
                el('div', { class: 't-caption' }, t('а звучит')),
                el('div', { style: 'font-weight:600' }, df.actual),
                el('div', { class: 't-caption' },
                  df.kind === 'drop' ? t('{v0} слога', { v0: df.enSyl }) : t('ударение другое')))),
            el('div', { class: 't-sm' },
              df.kind === 'drop' ? t('Слог просто выпал. Никто его не произносит.')
                : t('Ударение уехало на другой слог. Больше в этом слове ничего не поменялось.')),
            speech.available ? el('button', {
              class: 'tcard__btn',
              onClick: () => { countPresence(); speech.say(df.word.en); },
            }, t('🔊 Послушать')) : null)) : null,

        /* Ловушка дня: единственное место, где допустимо лёгкое
           напряжение, потому что ставки объявлены нулевыми. */
        tr && (tr.bridge || tr.looks_like) ? tcard('trap', t('ДВОЙНИК'),
          el('div', { class: 'stack', style: 'gap:6px' },
            el('div', { class: 'row', style: 'gap:var(--sp-2);align-items:baseline;flex-wrap:wrap' },
              en(tr.en, 'tcard__en'),
              el('div', { class: 't-sm' }, t('это не «{v0}»', { v0: tr.bridge || tr.looks_like }))),
            el('div', { class: 'tcard__big' }, tr.ru || tr.actual_ru),
            el('div', { class: 't-sm' }, tr.note || tr.hint || ''),
            el('div', { class: 't-caption' }, t('Таких слов на весь язык три десятка. Остальные не подводят.')))) : null,

        /* Правило дня подаётся не как правило, а как совпадение. */
        rd ? tcard('rule', t('СОВПАДЕНИЕ'),
          el('div', { class: 'stack', style: 'gap:6px' },
            el('div', { class: 'tcard__big' }, rd.title),
            el('div', { class: 't-sm' }, rd.ru_parallel),
            el('div', { class: 'tcard__quote' },
              el('div', { lang: 'en', class: 'tcard__quote-en' }, rd.en_example),
              el('div', { class: 't-sm' }, rd.ru_example)),
            rd.why_easy ? el('div', { class: 't-caption' }, rd.why_easy) : null)) : null,

        /* Открытые ключи — коллекция, которая растёт сама и которую
           приятно разглядывать. Каждый ключ это не слово, а правило. */
        openKeys.length ? tcard('keys', t('ТВОИ КЛЮЧИ'),
          el('div', { class: 'stack', style: 'gap:var(--sp-2)' },
            el('div', { class: 't-sm' },
              t('Каждый ключ открывает сразу пачку слов, которых ты не видел.')),
            ...openKeys.map(k => el('div', { class: 'tday-key' },
              el('span', { class: 'tday-key__ic' }, k.icon),
              el('span', { style: 'font-weight:600' }, t(k.title)),
              el('span', { class: 'grow' }),
              el('span', { class: 't-caption' }, t('{v0} слов', { v0: keyCoverage(k, content) })))))) : null,

        el('div', { class: 't-caption center', style: 'padding:var(--sp-4) 0' },
          t('Это всё на сегодня. Заниматься не обязательно.')),
      );

      /* Карточка-доказательство. Сначала только английский: человек
         должен успеть понять сам. Перевод открывается по нажатию и
         подтверждает то, что уже произошло у него в голове. */
      function readCard(r) {
        const ru = el('div', { class: 'read__ru', hidden: true },
          el('div', { class: 't-sm' }, r.ru),
          el('div', { class: 'read__verdict' }, t('Ты понял это без перевода. Это и называется читать.')));

        const btn = el('button', { class: 'read__btn' }, t('Я понял 👀'));
        btn.addEventListener('click', () => {
          countPresence();
          sound.correct();
          ru.hidden = false;
          btn.hidden = true;
          animate(ru, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
            { duration: 240 });
        });

        return el('div', { class: 'read' },
          el('div', { class: 'read__glow' }),
          el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.72)' }, t('ТЫ ЭТО ЧИТАЕШЬ')),
          el('div', { class: 'read__en', lang: 'en' }, r.en),
          el('div', { class: 'read__hint' },
            t('Здесь нет ни одного слова, которого у тебя нет.')),
          btn, ru,
          speech.available ? el('button', {
            class: 'read__speak',
            'aria-label': t('Произнести'),
            onClick: () => { countPresence(); speech.say(r.en); },
          }, '🔊') : null);
      }

      function tcard(kind, label, body) {
        const node = el('div', { class: 'tcard', dataset: { kind } },
          el('div', { class: 'tcard__label' }, label), body);
        node.addEventListener('pointerdown', countPresence, { once: true, passive: true });
        return node;
      }

      /* Карточки въезжают лесенкой: разворот собирается на глазах,
         а не появляется готовой стеной текста. */
      animate(wrap, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
      [...wrap.children].forEach((c, i) => {
        if (i === 0) return;
        animate(c, [
          { opacity: 0, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'none' },
        ], { duration: 300, delay: Math.min(i, 6) * 45, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
      });

      return { destroy() { clearTimeout(presenceTimer); speech.cancel(); } };
    },
  };
}
