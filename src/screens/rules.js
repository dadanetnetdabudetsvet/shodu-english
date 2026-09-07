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
              t('{v0} из {v1} разобрано', { v0: done, v1: content.rules.length }))),
          ...content.rules.map(rule),
        );
      }

      function rule(r) {
        const isRead = !!(store.state.rulesRead || {})[r.id];
        return el('button', {
          class: 'list-row',
          onClick: () => open(r),
        },
          el('div', {
            style: `width:36px;height:36px;flex:none;border-radius:var(--r-full);display:grid;place-items:center;
                    background:${isRead ? 'var(--success-soft)' : 'var(--surface-2)'};font-size:15px`,
          }, isRead ? '✓' : String(r.difficulty)),
          el('div', { class: 'stack grow', style: 'gap:1px' },
            el('div', { style: 'font-weight:600' }, r.title),
            el('div', { class: 't-sm' }, r.idea),
            r.why_easy ? el('div', { class: 't-caption' }, r.why_easy) : null),
        );
      }

      function open(r) {
        sound.tap();
        // Правило засчитывается по закрытию, а не по открытию:
        // иначе счётчик считает касания, а не прочитанное.
        let counted = false;
        const sheet = el('div', {
          class: 'card', role: 'dialog', 'aria-modal': 'true',
          style: 'position:fixed;left:12px;right:12px;bottom:12px;z-index:80;max-width:536px;margin:0 auto;max-height:80dvh;overflow:auto',
        },
          el('h2', { class: 't-h2' }, r.title),
          el('p', { class: 't-body', style: 'margin-top:var(--sp-2)' }, r.idea),
          r.why_easy ? el('div', {
            class: 'card card--flat',
            style: 'margin-top:var(--sp-3);background:var(--accent-soft)',
          },
            el('div', { class: 't-caption' }, t('ЧТО ЗДЕСЬ ЛЁГКОГО')),
            el('div', { class: 't-sm' }, r.why_easy)) : null,
          el('div', { class: 'card card--flat', style: 'margin-top:var(--sp-2)' },
            el('div', { class: 't-caption' }, t('ТЫ ТАК УЖЕ ГОВОРИШЬ')),
            el('div', { class: 't-sm' }, r.ru_parallel)),
          el('div', { class: 'card card--flat', style: 'margin-top:var(--sp-2)' },
            el('div', { lang: 'en', style: 'font-weight:600' }, r.en_example),
            el('div', { class: 't-sm' }, r.ru_example)),
          r.gotcha ? el('div', {
            class: 'card card--flat',
            style: 'margin-top:var(--sp-2)',
          },
            el('div', { class: 't-caption' }, t('ВСЯ РАЗНИЦА')),
            el('div', { class: 't-sm' }, r.gotcha)) : null,
          el('button', {
            class: 'btn btn--primary btn--cta', style: 'margin-top:var(--sp-3)',
            onClick: close,
          }, t('Так и знал ✓')),
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:79', onClick: close });
        document.body.append(back, sheet);
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
