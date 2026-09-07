/* Правила. Тридцать штук, совпадающих с русским.
 * У каждого честно показано единственное отличие: продукт создаёт
 * ощущение лёгкости, но не врёт. */

import { el, en, setChildren } from '../ui/dom.js';
import { sound } from '../core/sound.js';
import { enterCard, animate } from '../core/motion.js';
import { t } from '../i18n/index.js';

export function screen(store, content) {
  return {
    mount(root) {
      const s = store.state;
      const read = s.rulesRead || {};
      const list = el('div', { class: 'stack', style: 'gap:6px' });

      function render() {
        const done = Object.keys(store.state.rulesRead || {}).length;
        setChildren(list,
          el('div', { class: 'card card--flat stack', style: 'gap:4px' },
            el('div', { style: 'font-weight:600' }, t('Здесь почти нечего запоминать')),
            el('div', { class: 't-sm' },
              t('Первые правила — это места, где английский устроен ровно как русский. Ты уже так говоришь, просто другими словами.')),
            el('div', { class: 't-caption' },
              t('{v0} совпадений ты уже видел', { v0: done, v1: content.rules.length }))),
          ...content.rules.map(rule),
        );
      }

      /* Значок совпадения с русским. Знак равенства читается мгновенно
         и говорит именно то, что нужно: тут всё так же. */
      function sameMark(n) {
        return n >= 5 ? '=' : n === 4 ? '≈' : n === 3 ? '~' : n === 2 ? '±' : '≠';
      }
      function sameLabel(n) {
        return n >= 5 ? t('всё как в русском')
          : n === 4 ? t('почти как в русском')
          : n === 3 ? t('похоже, но есть особенность')
          : n === 2 ? t('кое-что иначе')
          : t('здесь по-своему');
      }

      function rule(r) {
        const isRead = !!(store.state.rulesRead || {})[r.id];
        /* Карточка показывает не оглавление, а само содержимое: человек
           видит английскую фразу и сразу узнаёт в ней свои слова. Это и
           есть доказательство, ради которого раздел существует. */
        return el('button', {
          class: 'rule' + (isRead ? ' rule--read' : ''),
          onClick: () => open(r),
        },
          el('div', { class: 'rule__top' },
            el('span', { class: `rule__mark rule__mark--s${r.sameness}` }, sameMark(r.sameness)),
            el('span', { class: 'rule__title' }, r.title),
            isRead ? el('span', { class: 'done-mark' }, '✓') : null),
          el('div', { class: 'rule__ex' },
            el('span', { lang: 'en', class: 'rule__en' }, r.en_example),
            el('span', { class: 'rule__ru' }, r.ru_example)),
          el('div', { class: 'rule__same' }, sameLabel(r.sameness)),
        );
      }

      function open(r) {
        sound.tap();
        // Правило засчитывается по закрытию, а не по открытию:
        // иначе счётчик считает касания, а не прочитанное.
        let counted = false;

        /* Лист устроен как разворот, а не как стопка серых блоков.
           Сверху — заголовок, который не уезжает; в середине —
           крупная английская фраза, ради которой всё и открывали;
           снизу — кнопка, приклеенная к краю, чтобы её было видно
           до прокрутки и человек понимал, что лист длинный. */
        const body = el('div', { class: 'rsheet__body' },
          el('div', { class: 'rsheet__hero' },
            el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.72)' }, t('ЧИТАЕТСЯ ТАК')),
            el('div', { class: 'rsheet__en', lang: 'en' }, r.en_example),
            el('div', { class: 'rsheet__ru' }, r.ru_example)),

          el('p', { class: 'rsheet__idea' }, r.idea),

          el('div', { class: 'rsheet__pair' },
            el('div', { class: 'rsheet__pair-side' },
              el('div', { class: 't-caption' }, t('ПО-РУССКИ ТЫ ГОВОРИШЬ')),
              el('div', { class: 'rsheet__pair-text' }, r.ru_parallel)),
            el('div', { class: 'rsheet__pair-eq' }, sameMark(r.sameness)),
            el('div', { class: 'rsheet__pair-side' },
              el('div', { class: 't-caption' }, t('ПО-АНГЛИЙСКИ ТОЧНО ТАК ЖЕ')),
              el('div', { class: 'rsheet__pair-text', lang: 'en' }, r.en_example))),

          r.en_example2 ? el('div', { class: 'rsheet__more' },
            el('div', { class: 't-caption' }, t('ЕЩЁ ОДИН')),
            el('div', { lang: 'en', class: 'rsheet__more-en' }, r.en_example2),
            el('div', { class: 't-sm' }, r.ru_example2)) : null,

          r.why_easy ? el('div', { class: 'rsheet__note rsheet__note--easy' },
            el('div', { class: 'rsheet__note-ic' }, '✅'),
            el('div', {},
              el('div', { class: 't-caption' }, t('ПОЧЕМУ ЭТО ЛЕГКО')),
              el('div', { class: 't-sm' }, r.why_easy))) : null,

          r.gotcha ? el('div', { class: 'rsheet__note rsheet__note--diff' },
            el('div', { class: 'rsheet__note-ic' }, '⚠️'),
            el('div', {},
              el('div', { class: 't-caption' }, t('ВСЯ РАЗНИЦА')),
              el('div', { class: 't-sm' }, r.gotcha))) : null,
        );

        const sheet = el('div', { class: 'rsheet', role: 'dialog', 'aria-modal': 'true' },
          el('div', { class: 'rsheet__head' },
            el('span', { class: `rule__mark rule__mark--s${r.sameness}` }, sameMark(r.sameness)),
            el('div', { class: 'grow' },
              el('div', { class: 'rsheet__title' }, r.title),
              el('div', { class: 't-caption' }, sameLabel(r.sameness))),
            el('button', { class: 'rsheet__x', 'aria-label': t('Закрыть'), onClick: close }, '✕')),
          body,
          el('div', { class: 'rsheet__foot' },
            el('button', { class: 'btn btn--primary btn--cta', onClick: close },
              t('Ровно так и говорю ✓'))));

        const back = el('div', { class: 'rsheet__back', onClick: close });
        document.body.append(back, sheet);

        /* Тень у нижнего края, пока лист не докручен: без неё длинный
           лист выглядит закончившимся на середине. */
        const shade = () => sheet.classList.toggle('is-more',
          body.scrollHeight - body.scrollTop - body.clientHeight > 12);
        body.addEventListener('scroll', shade, { passive: true });
        requestAnimationFrame(shade);

        animate(sheet, [{ transform: 'translateY(110%)' }, { transform: 'none' }],
          { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });

        function close() {
          if (!counted) { counted = true; store.dispatch({ type: 'RULE_READ', id: r.id }); }
          sheet.remove(); back.remove(); render();
        }
      }

      const wrap = el('div', { class: 'screen' },
        el('h1', { class: 't-h1' }, t('Триста совпадений')),
        el('p', { class: 't-sm' }, t('У 299 правил из 300 разница с русским ровно одна. У одного её нет вовсе.')),
        list);
      root.append(wrap);
      render();
      enterCard(wrap);
      return { destroy() {} };
    },
  };
}
