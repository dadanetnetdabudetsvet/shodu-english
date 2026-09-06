/* Онбординг. Четыре шага, первая победа на 12–18 секунде.
 *
 * Главный шаг — второй: проверка из десяти когнатов. Он не учит,
 * а СЧИТАЕТ. Это и есть продукт: человек получает доказательство,
 * а не комплимент.
 *
 * Результат не подкручивается никогда. Подкручивается только пул:
 * десять честных когнатов первого тира дают восемь-десять правильных
 * у любого человека сами собой. Поведение при плохом результате
 * прописано явно, а не оставлено на случай.
 *
 * Разрешение на уведомления здесь не запрашивается: на iOS отказ
 * необратим, и тратить единственный запрос на функцию, которой у нас
 * нет, нельзя.
 */

import { el, en } from '../ui/dom.js';
import { pickDistractors, shuffle } from '../data/content.js';
import { enterCard, enterOptions, popCorrect, shakeWrong, tweenNumber, popIn } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { haptics } from '../core/haptics.js';
import { confetti } from '../core/confetti.js';
import { speech } from '../core/speech.js';
import { t } from '../i18n/index.js';

const QUIZ_SIZE = 10;

export function screen(store, content) {
  return {
    mount(root, ctx) {
      let step = 0;
      let correct = 0;
      let quiz = [];
      let qi = 0;
      let goal = 10;

      const wrap = el('div', { class: 'screen screen--full' });
      root.append(wrap);

      function render() {
        wrap.replaceChildren();
        if (step === 0) renderHello();
        else if (step === 1) renderQuiz();
        else if (step === 2) renderCount();
        else renderGoal();
      }

      /* Шаг 1. Стыд не называется вслух: называть проблему до того,
         как человек почувствовал себя в безопасности, нельзя. */
      function renderHello() {
        const card = el('div', { class: 'stack', style: 'gap:var(--sp-5);padding-top:var(--sp-12)' },
          el('div', { style: 'font-size:56px;line-height:1' }, '👋'),
          el('h1', { class: 't-h1' }, t('Ты знаешь английских слов больше, чем думаешь')),
          el('p', { class: 't-body t-dim' }, t('Сейчас проверим. Две минуты, десять слов, никакой зубрёжки.')),
          el('p', { class: 't-sm' }, t('Оценок нет, таймера нет, никто не смотрит через плечо.')),
          el('div', { class: 'grow' }),
          el('button', { class: 'btn btn--primary btn--cta', onClick: () => { sound.tap(); step = 1; startQuiz(); } }, t('Посчитать, сколько я уже знаю 🔍')),
        );
        wrap.append(card);
        enterCard(card);
      }

      function startQuiz() {
        // Пул — только первый тир: самые узнаваемые. Это честная выборка,
        // а не подтасовка результата.
        const easy = content.deck1.filter(w => w.tier === 1);
        quiz = shuffle(easy.slice()).slice(0, QUIZ_SIZE);
        qi = 0; correct = 0;
        render();
      }

      function renderQuiz() {
        const word = quiz[qi];
        const options = shuffle([word, ...pickDistractors(word, content.deck1, 3)]);
        let answered = false;

        const card = el('div', { class: 'qcard' },
          el('div', { class: 'qcard__hint' }, t('{v0} из {v1}', { v0: qi + 1, v1: QUIZ_SIZE })),
          en(word.en, 't-en'),
          el('div', { class: 't-ipa', 'aria-hidden': 'true' }, word.ipa),
        );

        const opts = el('div', { class: 'options', role: 'radiogroup', 'aria-label': t('Выбери перевод') });
        for (const o of options) {
          const btn = el('button', {
            class: 'option', role: 'radio', 'aria-checked': 'false',
            onClick: () => choose(btn, o),
          }, el('span', { class: 'option__key' }, ''), el('span', { class: 'grow', text: o.answer }));
          opts.append(btn);
        }

        const shownAt = performance.now();

        function choose(btn, o) {
          if (answered) return;
          answered = true;
          const right = o.id === word.id;

          /* Ответ засчитывается в прогресс. Иначе человек видит «8 из 10
             узнал сразу», а через полминуты — «слов знаю 0», и те же слова
             подаются ему как новые. Это подтасовка с обратной силой. */
          store.dispatch({
            type: 'ANSWER_GRADED',
            wordId: word.id, deck: word.deck, correct: right, typoOnly: false,
            elapsedMs: performance.now() - shownAt, mode: 'build', exerciseType: 'choice4',
            usedHint: false, isCognate: true, comboAfter: 0, attempt: 1, listens: 1,
          });

          if (right) {
            correct++;
            btn.classList.add('option--right');
            btn.append(el('span', { class: 'option__mark' }, '✓'));
            sound.correct(); haptics.fire('correct'); popCorrect(btn);
          } else {
            btn.classList.add('option--wrong');
            btn.append(el('span', { class: 'option__mark' }, '→'));
            shakeWrong(btn);
            const rightBtn = [...opts.children][options.findIndex(x => x.id === word.id)];
            setTimeout(() => {
              rightBtn.classList.add('option--right');
              rightBtn.append(el('span', { class: 'option__mark' }, '✓'));
            }, 300);
          }
          setTimeout(() => { qi++; if (qi >= quiz.length) { step = 2; } render(); }, right ? 620 : 1200);
        }

        wrap.append(
          el('div', { class: 'stack', style: 'gap:var(--sp-4)' },
            el('p', { class: 't-sm center' }, t('Просто узнавай слова. Промахнёшься — ничего не будет 🙂')),
            card, opts,
            el('button', {
              class: 'qskip',
              onClick: () => {
                if (answered) return;
                answered = true;
                const rightBtn = [...opts.children][options.findIndex(x => x.id === word.id)];
                rightBtn.classList.add('option--right');
                rightBtn.append(el('span', { class: 'option__mark' }, '✓'));
                setTimeout(() => { qi++; if (qi >= quiz.length) step = 2; render(); }, 900);
              },
            }, t('не знаю 🤷')),
          )
        );
        enterCard(card);
        enterOptions(opts.children);
      }

      /* Шаг 2. Подсчёт. Число берётся из ответов, а не назначается. */
      function renderCount() {
        const emoji = el('div', { class: 'results__emoji' }, correct >= 8 ? '🎉' : '👀');
        const num = el('div', { class: 't-num', style: 'font-size:var(--fs-4xl);font-weight:800' }, '0');

        // Поведение при слабом результате прописано явно.
        const line = correct >= 8
          ? t('Ты знал их и до нас. Считай, что они уже в кармане.')
          : correct >= 5
            ? t('Половина уже твоя. Вторая догонит быстрее, чем ты думаешь.')
            : t('И это уже слова, за которые не надо садиться за учебник.');

        const card = el('div', { class: 'results' },
          emoji,
          el('div', { class: 'stack center', style: 'gap:2px' },
            num,
            el('div', { class: 't-sm' }, t('из {v0} узнал не задумываясь', { v0: QUIZ_SIZE })),
          ),
          el('p', { class: 't-body center' }, line),
          el('p', { class: 't-sm center' }, t('Ты и так знаешь английский на уровне, о котором не догадывался.')),
          el('div', { class: 'grow' }),
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => { sound.tap(); step = 3; render(); },
          }, t('Так, и что дальше →')),
        );
        wrap.append(card);
        popIn(emoji);
        tweenNumber(num, 0, correct, 900);
        if (correct >= 8) { sound.medal(); confetti.burst({ count: 70 }); }
        else sound.sessionDone();
      }

      /* Шаг 3. Цель в словах. Имя не спрашиваем: оно ни на что не влияет,
         и его место в профиле. */
      function renderGoal() {
        const choices = [
          { n: 5,  cap: t('примерно 2 минуты'), note: t('Спокойно') },
          { n: 10, cap: t('примерно 4 минуты'), note: t('Обычно') },
          { n: 20, cap: t('примерно 8 минут'),  note: t('Плотно') },
        ];
        const list = el('div', { class: 'stack' });
        for (const c of choices) {
          const btn = el('button', {
            class: 'option' + (c.n === goal ? ' option--right' : ''),
            onClick: () => { goal = c.n; sound.tap(); renderGoalList(); },
          },
            el('span', { class: 'grow' },
              el('div', { style: 'font-weight:600' }, t('{v0} слов в день', { v0: c.n })),
              el('div', { class: 't-caption' }, `${c.cap} · ${c.note}`)),
          );
          list.append(btn);
        }
        function renderGoalList() {
          [...list.children].forEach((b, i) => b.classList.toggle('option--right', choices[i].n === goal));
        }

        wrap.append(el('div', { class: 'stack', style: 'gap:var(--sp-5);padding-top:var(--sp-8)' },
          el('h1', { class: 't-h1' }, t('Сколько слов в день потянешь?')),
          el('p', { class: 't-sm' }, t('Передумаешь — поменяешь в любой момент, никто слова не скажет.')),
          list,
          el('div', { class: 'grow' }),
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => {
              sound.sessionStart();
              store.dispatch({ type: 'SETTINGS_SET', patch: { dailyGoalWords: goal } });
              /* Точка отсчёта: те же десять слов и результат. По ней потом
                 считается «было шесть, стало десять» — единственное место,
                 где виден рост способности, а не накопления. */
              store.dispatch({
                type: 'ONBOARDED',
                baseline: { day: store.state.day, ids: quiz.map(w => w.id), correct },
              });
              ctx.go('session/build');
            },
          }, t('Всё, поехали 🚀')),
        ));
      }

      render();
      return { destroy() { speech.cancel(); } };
    },
  };
}
