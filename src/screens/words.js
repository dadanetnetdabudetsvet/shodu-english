/* Словарь. Весь контент всегда доступен для просмотра — правило Р1:
 * ничего не заперто, смотреть можно что угодно и когда угодно.
 *
 * Тап по строке открывает ту же карточку подачи, что и в занятии:
 * это самое ценное содержимое продукта, и показывать его один раз
 * в жизни было бы расточительством. */

import { el, en, setChildren } from '../ui/dom.js';
import { isKnown, isLearning, newRecord } from '../domain/srs.js';
import { speech } from '../core/speech.js';
import { sound } from '../core/sound.js';
import { enterCard, animate } from '../core/motion.js';
import { t } from '../i18n/index.js';

const FILTERS = [
  { id: 'all', label: t('Все') },
  { id: 'known', label: t('Знаю') },
  { id: 'learning', label: t('Учу') },
  { id: 'new', label: t('Новые') },
  { id: 'traps', label: t('Ловушки') },
];

export function screen(store, content) {
  return {
    mount(root) {
      let filter = 'all';
      let query = '';

      const list = el('div', { class: 'stack', style: 'gap:6px' });
      const summary = el('div', { class: 't-sm' });
      const chips = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' });
      const search = el('input', {
        class: 'option', type: 'search', placeholder: t('Найти слово…'),
        style: 'width:100%;min-height:48px',
        onInput: (e) => { query = e.target.value.trim().toLowerCase(); render(); },
      });

      for (const f of FILTERS) {
        chips.append(el('button', {
          class: 'btn', dataset: { f: f.id },
          style: 'min-height:36px;padding:0 var(--sp-3);font-size:var(--fs-sm)',
          onClick: () => { filter = f.id; sound.tap(); render(); },
        }, f.label));
      }

      function all() { return content.all; }
      function recOf(w) {
        const bucket = w.deck === 'core' ? 'deck2' : 'deck1';
        return (store.state.srs[bucket] || {})[w.id] || newRecord();
      }

      function render() {
        const s = store.state;
        for (const b of chips.children) {
          b.classList.toggle('btn--primary', b.dataset.f === filter);
        }
        let items = all();
        if (filter === 'known') items = items.filter(w => isKnown(recOf(w)));
        else if (filter === 'learning') items = items.filter(w => isLearning(recOf(w)));
        else if (filter === 'new') items = items.filter(w => recOf(w).box === 0 && !w.falseFriend);
        else if (filter === 'traps') items = items.filter(w => w.falseFriend);
        if (query) items = items.filter(w =>
          w.en.toLowerCase().includes(query) || String(w.answer).toLowerCase().includes(query));

        let known = 0, learning = 0;
        for (const w of all()) {
          const r = recOf(w);
          if (isKnown(r)) known++; else if (isLearning(r)) learning++;
        }
        summary.textContent = t('{v0} слов · {v1} знаю · {v2} учу', { v0: all().length, v1: known, v2: learning });

        setChildren(list, ...items.map(row));
        if (!items.length) {
          list.append(el('div', { class: 'card card--flat t-sm center' },
            query ? t('Такого слова пока нет.') : t('Здесь появятся слова, которые ты встретишь.')));
        }
      }

      function row(w) {
        const r = recOf(w);
        const strength = Math.min(5, r.box);
        // Двести карточек с тенями подряд — это не список, а шум.
        return el('button', {
          class: 'list-row',
          onClick: () => openCard(w, r),
        },
          el('div', { class: 'stack grow', style: 'gap:1px' },
            el('div', { class: 'row', style: 'gap:6px' },
              en(w.en, ''), w.falseFriend ? el('span', { class: 't-caption' }, '⚠') : null),
            el('div', { class: 't-sm' }, w.answer)),
          el('div', {
            class: 'rhythm', 'aria-label': t('Сила памяти {v0} из 5', { v0: strength }),
          }, Array.from({ length: 5 }, (_, i) =>
            el('span', { class: 'rhythm__dot' + (i < strength ? ' rhythm__dot--done' : '') }))),
        );
      }

      /* Та же карточка, что в занятии. Здесь она — справочник. */
      function openCard(w, r) {
        sound.tap();
        const sheet = el('div', {
          class: 'card', style: 'position:fixed;left:12px;right:12px;bottom:12px;z-index:80;max-width:536px;margin:0 auto',
          role: 'dialog', 'aria-modal': 'true',
        },
          el('div', { class: 'teach' },
            el('div', { class: 'teach__over' }, w.falseFriend ? t('ловушка') : w.topic || ''),
            en(w.en, 't-en'),
            el('div', { class: 't-ipa', 'aria-hidden': 'true' }, `${w.ipa}  ·  ${w.tr}`),
            el('div', { class: 'teach__ru' }, w.answer),
            w.bridge && w.bridge !== w.answer
              ? el('div', { class: 't-sm' }, t('похоже на «{v0}»', { v0: w.bridge })) : null,
            el('div', { class: 'teach__lesson' + (w.falseFriend ? ' teach__warn' : '') }, w.hint),
            w.ex_en ? el('div', { class: 't-sm' }, el('span', { lang: 'en' }, w.ex_en), ' — ', w.ex_ru) : null,
          ),
          el('div', { class: 'row', style: 'gap:var(--sp-2);margin-top:var(--sp-3)' },
            speech.available ? el('button', {
              class: 'btn grow', onClick: () => speech.say(w.en),
            }, t('🔊 Послушать')) : null,
            el('button', { class: 'btn btn--primary grow', onClick: close }, t('Понятно ✓'))),
          el('button', {
            class: 'btn btn--ghost', style: 'width:100%;margin-top:var(--sp-2);font-size:var(--fs-caption)',
            onClick: () => { report(w); close(); },
          }, t('Здесь ошибка? Сообщить')),
        );
        const back = el('div', {
          style: 'position:fixed;inset:0;background:var(--overlay);z-index:79', onClick: close,
        });
        document.body.append(back, sheet);
        animate(sheet, [{ transform: 'translateY(110%)' }, { transform: 'none' }],
          { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        function close() { sheet.remove(); back.remove(); }
      }

      /* Без способа сообщить об ошибке ошибки в контенте не находятся никогда. */
      function report(w) {
        const key = 'shodu:reports';
        try {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          list.push({ id: w.id, en: w.en, at: Date.now() });
          localStorage.setItem(key, JSON.stringify(list.slice(-50)));
        } catch { /* не смогли записать — не беда */ }
        import('../ui/toast.js').then(m => m.toast('Спасибо, отметил. Поправим.', { kind: 'info' }));
      }

      const wrap = el('div', { class: 'screen' },
        el('h1', { class: 't-h1' }, t('Слова')),
        search, chips, summary, list);
      root.append(wrap);
      render();
      enterCard(wrap);

      const off = store.subscribe(s => s.srs, render);
      return { destroy() { off(); } };
    },
  };
}
