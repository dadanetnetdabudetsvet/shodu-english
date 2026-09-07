/* Экран «Пересчёт».
 *
 * Все остальные экраны показывают накопление (сколько всего) или
 * активность (сколько дней). Ни один не показывает изменение
 * способности — а именно в это человек про себя не верит.
 *
 * Здесь повторяется та же самая проверка, что была в первый день, на
 * тех же самых десяти словах. Пул не подстраивается: это измерение,
 * а не занятие. Поведение при отсутствии роста прописано явно.
 */

import { el, en, setChildren } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { pickDistractors, shuffle } from '../data/content.js';
import { enterCard, enterOptions, popCorrect, tweenNumber, popIn } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { confetti } from '../core/confetti.js';

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const s = store.state;
      const base = s.baseline;
      const timers = new Set();
      const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; };
      const wrap = el('div', { class: 'screen screen--full' });
      root.replaceChildren(wrap);

      if (!base || !base.ids || !base.ids.length) {
        setChildren(wrap, el('div', { class: 'stack center', style: 'justify-content:center;flex:1;gap:var(--sp-4)' },
          el('div', { style: 'font-size:44px' }, '📏'),
          el('h1', { class: 't-h1' }, t('Пересчёт сравнивает с первым днём')),
          el('p', { class: 't-sm' }, t('Сравнивать будем с твоей первой проверкой.')),
          el('button', { class: 'btn btn--primary btn--cta', onClick: () => ctx.go('home') }, t('Понятно ✓'))));
        return { destroy() { for (const id of timers) clearTimeout(id); } };
      }

      const quiz = base.ids.map(id => content.byId.get(id)).filter(Boolean);
      // Сравнивать восемь из десяти с одним из семи нельзя: это сообщит
      // о падении там, где его нет.
      if (quiz.length !== base.ids.length) {
        setChildren(wrap, el('div', { class: 'stack center', style: 'justify-content:center;flex:1;gap:var(--sp-4)' },
          el('div', { style: 'font-size:44px' }, '📏'),
          el('h1', { class: 't-h1' }, t('Пересчёт пропустим')),
          el('p', { class: 't-sm' }, t('Часть слов из первой проверки поменялась, сравнивать было бы нечестно.')),
          el('button', { class: 'btn btn--primary btn--cta', onClick: () => ctx.go('home') }, t('Понятно ✓'))));
        return { destroy() { for (const id of timers) clearTimeout(id); } };
      }
      let i = 0, correct = 0;
      render();

      function render() {
        if (i >= quiz.length) return finish();
        const word = quiz[i];
        const options = shuffle([word, ...pickDistractors(word, content.deck1, 3)]);
        let answered = false;

        const card = el('div', { class: 'qcard' },
          el('div', { class: 'qcard__hint' }, t('{v0} из {v1}', { v0: i + 1, v1: quiz.length })),
          en(word.en, 't-en'),
          el('div', { class: 't-ipa', 'aria-hidden': 'true' }, word.tr));

        const opts = el('div', { class: 'options', role: 'radiogroup' });
        for (const o of options) {
          const btn = el('button', { class: 'option', role: 'radio', onClick: () => choose(btn, o) },
            el('span', { class: 'option__key' }, ''), el('span', { class: 'grow', text: o.answer }));
          opts.append(btn);
        }

        function choose(btn, o) {
          if (answered) return;
          answered = true;
          const right = o.id === word.id;
          if (right) { correct++; btn.classList.add('option--right'); sound.correct(); popCorrect(btn); }
          else {
            btn.classList.add('option--wrong');
            const rb = [...opts.children][options.findIndex(x => x.id === word.id)];
            later(() => rb.classList.add('option--right'), 240);
          }
          later(() => { i++; render(); }, right ? 520 : 1000);
        }

        setChildren(wrap, el('div', { class: 'stack', style: 'gap:var(--sp-4)' },
          el('div', { class: 'row row--between' },
            el('button', { class: 'session__close', 'aria-label': t('Выйти'), onClick: () => ctx.go('home') }, '✕'),
            el('div', { class: 't-caption' }, t('Пересчёт'))),
          el('p', { class: 't-sm center' }, t('Те же десять слов, что в самый первый день.')),
          card, opts));
        enterCard(card);
        enterOptions(opts.children);
      }

      function finish() {
        const was = base.correct;
        const now = correct;
        const grew = now > was;
        const same = now === was;

        const emoji = el('div', { class: 'results__emoji' }, grew ? '📈' : same ? '🎯' : '🌱');
        const num = el('div', { class: 't-num', style: 'font-size:var(--fs-4xl);font-weight:800' }, String(was));

        // Ни в одном исходе не сообщаем человеку, что он не справился.
        const line = grew
          ? (s.profile.name ? t('{v2}, было {v0}, стало {v1}. Это и есть память.', { v0: was, v1: now, v2: s.profile.name }) : t('Было {v0}, стало {v1}. Это и есть память.', { v0: was, v1: now }))
          : same
            ? t('Держишь {v0} из {v1}. Ничего не растерялось.', { v0: now, v1: quiz.length })
            : t('{v0} из {v1}, и это те же слова, что в первый день. Они никуда не делись.', { v0: now, v1: quiz.length });

        setChildren(wrap, el('div', { class: 'results' },
          emoji,
          el('h1', { class: 't-h1' }, t('Пересчёт')),
          num,
          el('div', { class: 't-sm' }, t('из {v0} — с первого взгляда', { v0: quiz.length })),
          el('p', { class: 't-body center' }, line),
          el('div', { class: 'grow' }),
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => {
              store.dispatch({ type: 'RECHECK_DONE', correct: now });
              ctx.go('home');
            },
          }, t('Дальше →'))));

        popIn(emoji);
        tweenNumber(num, was, now, 1200);
        if (grew) { sound.medal(); confetti.burst({ count: 80 }); } else sound.sessionDone();
      }

      return { destroy() { for (const id of timers) clearTimeout(id); } };
    },
  };
}
