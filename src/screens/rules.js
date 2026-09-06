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
          el('div', { class: 'card card--flat t-sm' },
            t('{v0} из {v1} прочитано. Это те места, где английский устроен как русский.', { v0: done, v1: content.rules.length })),
          ...content.rules.map(rule),
        );
      }

      function rule(r) {
        const isRead = !!(store.state.rulesRead || {})[r.id];
        return el('button', {
          class: 'card row', style: 'gap:var(--sp-3);text-align:left;padding:var(--sp-3)',
          onClick: () => open(r),
        },
          el('div', {
            style: `width:36px;height:36px;flex:none;border-radius:var(--r-full);display:grid;place-items:center;
                    background:${isRead ? 'var(--success-soft)' : 'var(--surface-2)'};font-size:15px`,
          }, isRead ? '✓' : String(r.difficulty)),
          el('div', { class: 'stack grow', style: 'gap:1px' },
            el('div', { style: 'font-weight:600' }, r.title),
            el('div', { class: 't-sm' }, r.idea)),
        );
      }

      function open(r) {
        sound.tap();
        store.dispatch({ type: 'RULE_READ', id: r.id });
        const sheet = el('div', {
          class: 'card', role: 'dialog', 'aria-modal': 'true',
          style: 'position:fixed;left:12px;right:12px;bottom:12px;z-index:80;max-width:536px;margin:0 auto;max-height:80dvh;overflow:auto',
        },
          el('h2', { class: 't-h2' }, r.title),
          el('p', { class: 't-body', style: 'margin-top:var(--sp-2)' }, r.idea),
          el('div', { class: 'card card--flat', style: 'margin-top:var(--sp-3)' },
            el('div', { class: 't-caption' }, t('КАК В РУССКОМ')),
            el('div', { class: 't-sm' }, r.ru_parallel)),
          el('div', { class: 'card card--flat', style: 'margin-top:var(--sp-2)' },
            el('div', { lang: 'en', style: 'font-weight:600' }, r.en_example),
            el('div', { class: 't-sm' }, r.ru_example)),
          r.gotcha ? el('div', {
            class: 'card card--flat',
            style: 'margin-top:var(--sp-2);background:var(--answer-wrong-soft)',
          },
            el('div', { class: 't-caption' }, t('ЕДИНСТВЕННОЕ ОТЛИЧИЕ')),
            el('div', { class: 't-sm' }, r.gotcha)) : null,
          el('button', {
            class: 'btn btn--primary btn--cta', style: 'margin-top:var(--sp-3)',
            onClick: close,
          }, t('Понятно ✓')),
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:79', onClick: close });
        document.body.append(back, sheet);
        animate(sheet, [{ transform: 'translateY(110%)' }, { transform: 'none' }],
          { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        function close() { sheet.remove(); back.remove(); render(); }
      }

      const wrap = el('div', { class: 'screen' },
        el('h1', { class: 't-h1' }, t('Правила')),
        el('p', { class: 't-sm' }, t('Коротко и только то, что устроено как у нас.')),
        list);
      root.append(wrap);
      render();
      enterCard(wrap);
      return { destroy() {} };
    },
  };
}
