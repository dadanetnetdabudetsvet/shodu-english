/* Итоги занятия.
 *
 * Занятие заканчивается СОСТОЯНИЕМ, а не оценкой. Итог — предложение
 * о человеке, а не о его результате. Процентов точности здесь нет и
 * быть не может.
 */

import { el } from '../ui/dom.js';
import { takeResult } from './session.js';
import { countKnown, levelInfo } from '../ui/reducer.js';
import { VOTE_REPLY, tierOf } from '../domain/challenge.js';
import { makeProof } from '../domain/referral.js';
import { popIn, tweenNumber } from '../core/motion.js';
import { confetti } from '../core/confetti.js';
import { sound } from '../core/sound.js';

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const r = takeResult() || { answered: 0, mistakes: 0, newWords: 0, ms: 0, maxCombo: 0, completed: false, medianAnswerMs: 9999 };
      const s = store.state;
      const { known } = countKnown(s);
      const lvl = levelInfo(s);
      const today = s.days[s.day] || { xp: 0, words: 0, sessions: 0 };
      const goal = s.settings.dailyGoalWords || 10;

      const emoji = el('div', { class: 'results__emoji' },
        r.mistakes === 0 && r.answered > 0 ? '🎯' : r.completed ? '🎉' : '👌');

      const title = !r.completed ? 'Занятие прервано'
        : r.mistakes === 0 && r.answered > 0 ? 'Чисто. Ни одной ошибки'
        : r.newWords > 0 ? `Готово. ${r.newWords} ${plural(r.newWords)} новых`
        : 'Занятие закрыто';

      const xpEl = el('div', { class: 'tile__val t-num' }, '0');
      const wordsEl = el('div', { class: 'tile__val t-num' }, '0');
      const minEl = el('div', { class: 'tile__val t-num' }, '0');

      const tiles = el('div', { class: 'results__tiles' },
        el('div', { class: 'tile' }, xpEl, el('div', { class: 'tile__cap' }, 'очков')),
        el('div', { class: 'tile' }, wordsEl, el('div', { class: 'tile__cap' }, 'узнал сразу')),
        el('div', { class: 'tile' }, minEl, el('div', { class: 'tile__cap' }, 'минут')),
      );

      /* Главная строка: накопление, а не оценка. */
      const stateLine = el('p', { class: 't-body center' }, `Всего у тебя ${known} слов.`);

      const goalLine = today.words >= goal
        ? el('div', { class: 'card card--flat center t-sm' }, 'Дневная цель выполнена.')
        : el('div', { class: 'card card--flat center t-sm' },
            `До цели дня: ${goal - today.words} ${plural(goal - today.words)}.`);

      /* Голос по планке. Формулировки не сообщают, что человек не справился. */
      const voteBox = el('div', { class: 'stack', style: 'gap:var(--sp-2)' },
        el('div', { class: 't-sm center' }, 'Как зашло?'),
        el('div', { class: 'vote' },
          voteBtn('easy', 'Легко'),
          voteBtn('normal', 'Нормально'),
          voteBtn('hard', 'Сложно'),
        ),
      );
      const voteReply = el('div', { class: 't-caption center' });

      function voteBtn(kind, label) {
        return el('button', {
          class: 'btn',
          onClick: () => {
            sound.tap();
            store.dispatch({ type: 'CHALLENGE_VOTE', vote: kind });
            voteBox.replaceChildren(el('div', { class: 't-sm center' }, VOTE_REPLY[kind]));
            const idx = store.state.challenge.index;
            voteReply.textContent = `планка ${idx} · ${tierOf(idx).name}`;
          },
        }, label);
      }

      /* Пришёл по приглашению и закрыл первое занятие — выдаём бонус
         и показываем код, который надо отправить пригласившему.
         Раньше этого момента кода нет: награда за реальное занятие. */
      let handshake = null;
      const ref = s.referral || {};
      if (r.completed && ref.invitedBy && !ref.newcomerPaid) {
        store.dispatch({ type: 'REFERRAL_NEWCOMER_PAID' });
        const proof = makeProof(ref.invitedBy, ref.selfCode);
        handshake = el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
          el('div', { style: 'font-weight:600' }, 'Тебя позвал друг'),
          el('div', { class: 't-sm' }, 'Тебе начислено 100 алмазов. Отправь этот код тому, кто позвал, — ему тоже начислят.'),
          el('div', {
            class: 'card card--flat center t-num',
            style: 'font-size:var(--fs-xl);font-weight:800;letter-spacing:.08em',
          }, proof),
          el('button', {
            class: 'btn btn--primary',
            onClick: async () => {
              const text = `Мой код в Шоду: ${proof}`;
              try {
                if (navigator.share) await navigator.share({ text });
                else { await navigator.clipboard.writeText(proof); }
              } catch { /* отмена шаринга это не ошибка */ }
            },
          }, 'Отправить код'),
        );
      }

      const actions = el('div', { class: 'stack', style: 'gap:var(--sp-2)' },
        el('button', {
          class: 'btn btn--primary btn--cta',
          onClick: () => { sound.sessionStart(); ctx.go('session/' + (r.mode || 'build')); },
        }, 'Ещё одно занятие'),
        el('button', { class: 'btn btn--ghost btn--cta', onClick: () => ctx.go('home') }, 'На сегодня хватит'),
      );

      root.append(el('div', { class: 'screen screen--full results' },
        emoji,
        el('h1', { class: 't-h1 center' }, title),
        tiles,
        stateLine,
        goalLine,
        r.maxCombo >= 5 ? el('div', { class: 't-sm center' }, `Лучшая серия: ${r.maxCombo} подряд`) : null,
        voteBox, voteReply,
        handshake,
        el('div', { class: 'grow' }),
        actions,
      ));

      popIn(emoji);
      tweenNumber(xpEl, 0, today.xp, 900);
      tweenNumber(wordsEl, 0, r.correctFirstTry || 0, 900);
      tweenNumber(minEl, 0, Math.max(1, Math.round(r.ms / 60000)), 700);

      if (r.completed) {
        sound.sessionDone();
        if (r.mistakes === 0 && r.answered > 0) confetti.burst({ count: 80 });
      }

      // Автоподстройка планки применяется только если голоса не будет.
      setTimeout(() => {
        if (!store.state.challenge.votes.some(v => v.day === store.state.day)) {
          store.dispatch({
            type: 'CHALLENGE_AUTO',
            stats: { answered: r.answered, correctFirstTry: r.correctFirstTry || 0, medianAnswerMs: r.medianAnswerMs },
          });
        }
      }, 4000);

      return { destroy() {} };
    },
  };
}

function plural(n) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return 'слов';
  if (b > 1 && b < 5) return 'слова';
  if (b === 1) return 'слово';
  return 'слов';
}
