/* Итоги занятия.
 *
 * Занятие заканчивается СОСТОЯНИЕМ, а не оценкой. Итог — это
 * предложение о человеке, а не о его результате. Процентов точности
 * здесь нет и быть не может.
 *
 * Числа появляются последовательно и считаются от вчерашнего значения,
 * а не от нуля: считать от нуля значит каждый раз обесценивать всё,
 * что было до сегодня.
 */

import { el, setChildren } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { takeResult } from './session.js';
import { countKnown, levelInfo } from '../ui/reducer.js';
import { VOTE_REPLY, tierOf } from '../domain/challenge.js';
import { MEDALS } from '../domain/medals.js';
import { KEYS, keyCoverage, unseenByKey } from '../domain/keys.js';
import { makeProof } from '../domain/referral.js';
import { popIn, tweenNumber, animate } from '../core/motion.js';
import { confetti } from '../core/confetti.js';
import { sound } from '../core/sound.js';

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const r = takeResult();
      // Перезагрузка на этом адресе не должна выглядеть как потеря
      // прогресса: итога уже нет, показывать нули нечестно.
      if (!r) { ctx.go('home'); return { destroy() {} }; }

      const s = store.state;
      const { known } = countKnown(s);
      const today = s.days[s.day] || { xp: 0, words: 0, touched: 0, sessions: 0 };
      const goal = s.settings.dailyGoalWords || 10;
      const wordsToday = (today.words || 0) + Math.floor((today.touched || 0) / 2);
      const knownBefore = previousKnown(s);
      const gained = Math.max(0, known - knownBefore);

      const timers = new Set();
      const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; };
      const wrap = el('div', { class: 'screen screen--full results' });
      root.replaceChildren(wrap);

      const title = !r.completed
        ? t('Всё, что прошёл, засчитано')
        : r.mistakes === 0 && r.answered > 0 ? t('Чисто. Ни одной заминки')
        : r.newWords > 0 ? t('Ещё {v0} английских слов стали твоими', { v0: r.newWords })
        : t('Слова подтверждены. Они держатся');

      const headline = el('h1', { class: 't-h1 center' }, title);

      /* Главное число: сколько слов у человека всего. Считается от
         вчерашнего, чтобы был виден прирост, а не сумма с нуля. */
      const big = el('div', { class: 't-num', style: 'font-size:var(--fs-4xl);font-weight:800;line-height:1' },
        String(knownBefore));
      const bigCap = el('div', { class: 't-sm' }, t('английских слов ты уже узнаёшь'));
      const delta = gained > 0
        ? el('div', { class: 't-caption' }, t('сегодня прибавилось {v0}', { v0: gained }))
        : el('div', { class: 't-caption' }, t('сегодня подтверждено: {v0}', { v0: r.correctFirstTry || 0 }));

      const xpEl = el('div', { class: 'tile__val t-num' }, '0');
      const firstEl = el('div', { class: 'tile__val t-num' }, '0');
      const minEl = el('div', { class: 'tile__val t-num' }, '0');
      const tiles = el('div', { class: 'results__tiles' },
        el('div', { class: 'tile' }, xpEl, el('div', { class: 'tile__cap' }, t('очков за день'))),
        el('div', { class: 'tile' }, firstEl, el('div', { class: 'tile__cap' }, t('понял сразу'))),
        el('div', { class: 'tile' }, minEl, el('div', { class: 'tile__cap' }, t('минут'))),
      );

      const goalLine = wordsToday >= goal
        ? el('div', { class: 'card card--flat center t-sm' }, t('День засчитан.'))
        : el('div', { class: 'card card--flat center t-sm' },
            t('Круглый день — это ещё {v0} слов. Идти туда необязательно.', { v0: goal - wordsToday }));

      /* Медали выдаются в редьюсере, здесь их только показывают:
         раньше человек узнавал о награде, только если заходил в профиль. */
      const fresh = (s.lastMedals || []).map(id => MEDALS.find(m => m.id === id)).filter(Boolean);
      const medalBlock = fresh.length && el('div', { class: 'card stack center', style: 'gap:6px' },
        el('div', { style: 'font-size:34px' }, fresh[0].icon),
        el('div', { style: 'font-weight:600' }, t(fresh[0].name)),
        el('div', { class: 't-caption' }, t(fresh[0].hint)),
        el('div', { class: 't-sm' }, t('+{v0} 💎', { v0: fresh[0].gems })),
      );

      /* Ключ открылся. Это самое сильное событие продукта: человеку
         показывают слово, которого он здесь не видел, и он его понимает.
         После этого «я знаю английский» перестаёт быть авансом. */
      const freshKeys = (s.lastKeys || []).map(id => KEYS.find(k => k.id === id)).filter(Boolean);
      let keyCard = null;
      if (freshKeys.length) {
        const key = freshKeys[0];
        const covers = keyCoverage(key, content);
        const unseen = unseenByKey(key, s, content);
        const revealed = el('div', { class: 't-sm', hidden: true });
        keyCard = el('div', { class: 'card--hero stack', style: 'gap:var(--sp-2)' },
          el('div', { class: 't-caption', style: 'color:rgba(255,255,255,.8)' }, t('ОТКРЫЛСЯ КЛЮЧ')),
          el('div', { style: 'font-size:var(--fs-lg);font-weight:700' }, key.title),
          el('div', { class: 't-sm', style: 'color:rgba(255,255,255,.9)' }, t(key.line)),
          el('div', { class: 't-sm', style: 'color:rgba(255,255,255,.9)' },
            t('Это не одно слово, а правило. В словаре под него подпадает {v0} слов.', { v0: covers })),
          unseen ? el('div', { class: 'card', style: 'margin-top:var(--sp-2)' },
            el('div', { class: 't-caption' }, t('ЭТО СЛОВО МЫ ТЕБЕ НЕ ПОКАЗЫВАЛИ')),
            el('div', { lang: 'en', style: 'font-size:var(--fs-xl);font-weight:800;margin:4px 0' }, unseen.en),
            el('button', {
              class: 'btn',
              onClick: (e) => {
                revealed.hidden = false;
                revealed.textContent = unseen.answer;
                e.currentTarget.remove();
                sound.medal();
              },
            }, t('Кажется, я понял 👀')),
            revealed,
            el('div', { class: 't-caption', style: 'margin-top:4px' },
              t('Ты узнал его сам. Мы к этому не притрагивались.'))) : null,
        );
      }

      const wpmLine = r.wpm
        ? el('div', { class: 't-sm center' }, t('{v0} слов в минуту', { v0: r.wpm }))
        : null;

      /* Голос по сложности. «Поток» его не спрашивает: он уже подстроил
         темп внутри себя, и голос двинул бы настройку дважды за сессию. */
      const voteBox = el('div', { class: 'stack', style: 'gap:var(--sp-2)' });
      if (r.mode !== 'stream') {
        setChildren(voteBox,
          el('div', { class: 't-sm center' }, t('Как было по темпу?')),
          el('div', { class: 'vote' }, voteBtn('easy', t('Слишком спокойно 😎')),
            voteBtn('normal', t('В самый раз 🙂')), voteBtn('hard', t('Плотновато 😅'))));
      }
      const voteReply = el('div', { class: 't-caption center' });

      function voteBtn(kind, label) {
        return el('button', {
          class: 'btn',
          onClick: () => {
            sound.tap();
            store.dispatch({ type: 'CHALLENGE_VOTE', vote: kind });
            const idx = store.state.challenge.index;
            /* Ответ на голос раньше был серой строкой, которую никто не
               замечал: человек нажимал и думал, что ничего не произошло. */
            const card = el('div', { class: 'card card--flat stack center', style: 'gap:4px' },
              el('div', { style: 'font-size:22px' }, kind === 'easy' ? '📈' : kind === 'hard' ? '🌤' : '👌'),
              el('div', { style: 'font-weight:600' }, t(VOTE_REPLY[kind])),
              el('div', { class: 't-caption' },
                t('сложность {v0} · {v1}', { v0: idx, v1: t(tierOf(idx).name) })));
            setChildren(voteBox, card);
            animate(card, [
              { opacity: 0, transform: 'scale(.94)' },
              { opacity: 1, transform: 'scale(1.02)', offset: .6 },
              { opacity: 1, transform: 'scale(1)' },
            ], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
            voteReply.textContent = '';
          },
        }, label);
      }

      /* Пришёл по приглашению и закрыл первое занятие: код появляется
         только сейчас, потому что награда даётся за занятие. */
      let handshake = null;
      const ref = s.referral || {};
      if (r.completed && ref.invitedBy && !ref.newcomerPaid) {
        store.dispatch({ type: 'REFERRAL_NEWCOMER_PAID' });
        const proof = makeProof(ref.invitedBy, ref.selfCode);
        handshake = el('div', { class: 'card stack', style: 'gap:var(--sp-2)' },
          el('div', { style: 'font-weight:600' }, t('Тебя позвал друг')),
          el('div', { class: 't-sm' }, t('Тебе начислено 100 алмазов. Отправь этот код тому, кто позвал, — ему тоже начислят.')),
          el('div', { class: 'card card--flat center t-num',
            style: 'font-size:var(--fs-xl);font-weight:800;letter-spacing:.08em' }, proof),
          el('button', {
            class: 'btn btn--primary',
            onClick: async () => {
              try {
                if (navigator.share) await navigator.share({ text: t('Мой код в Shodu: {v0}', { v0: proof }) });
                else await navigator.clipboard.writeText(proof);
              } catch { /* передумал — не ошибка */ }
            },
          }, t('Отправить код другу 📤')));
      }

      /* Когда цель дня закрыта, кнопки меняются местами: эта аудитория
         бросает не от лени, а от перебора. */
      const goalMet = wordsToday >= goal;
      const again = el('button', {
        class: goalMet ? 'btn btn--cta' : 'btn btn--primary btn--cta',
        onClick: () => { sound.sessionStart(); ctx.go(routeFor(r.mode)); },
      }, t('Ещё заход ⚡'));
      const stop = el('button', {
        class: goalMet ? 'btn btn--primary btn--cta' : 'btn btn--ghost btn--cta',
        onClick: () => ctx.go('home'),
      }, t('На сегодня всё 👌'));

      setChildren(wrap,
        headline,
        el('div', { class: 'stack center', style: 'gap:2px' }, big, bigCap, delta),
        tiles, goalLine, keyCard, medalBlock, wpmLine,
        r.maxCombo >= 5 ? el('div', { class: 't-sm center' }, t('Лучшая серия: {v0} подряд', { v0: r.maxCombo })) : null,
        voteBox, voteReply, handshake,
        el('div', { class: 'grow' }),
        goalMet ? stop : again,
        goalMet ? again : stop,
      );

      /* Последовательность, а не всё сразу: заголовок, число, плитки. */
      animate(headline, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
      later(() => tweenNumber(big, knownBefore, known, 780), 300);
      later(() => {
        tweenNumber(xpEl, 0, today.xp, 700);
        tweenNumber(firstEl, 0, r.correctFirstTry || 0, 700);
        tweenNumber(minEl, 0, Math.max(1, Math.round(r.ms / 60000)), 600);
      }, 900);

      if (r.completed) {
        sound.sessionDone();
        if (fresh.length) { later(() => { sound.medal(); confetti.burst({ count: 90 }); }, 1200); }
        else if (r.mistakes === 0 && r.answered > 0) later(() => confetti.burst({ count: 70 }), 900);
      }

      // Автоподстройка работает только там, где голоса не будет.
      later(() => {
        const voted = (store.state.challenge.votes || []).some(v => v.day === store.state.day);
        if (!voted && r.mode !== 'stream') {
          store.dispatch({
            type: 'CHALLENGE_AUTO',
            stats: { answered: r.answered, correctFirstTry: r.correctFirstTry || 0, medianAnswerMs: r.medianAnswerMs },
          });
        }
      }, 4000);

      return { destroy() { for (const id of timers) clearTimeout(id); } };
    },
  };
}

function routeFor(mode) {
  if (mode === 'phrase') return 'phrase';
  if (mode === 'stream') return 'stream';
  return 'session/' + (mode || 'build');
}

/* Сколько слов было известно на конец предыдущего дня с занятием.
   Если снимка ещё нет, дельту не показываем, а не выдумываем. */
function previousKnown(s) {
  const days = Object.keys(s.days).map(Number).filter(d => d < s.day).sort((a, b) => b - a);
  for (const d of days) {
    const rec = s.days[d];
    if (rec && typeof rec.knownAtEnd === 'number') return rec.knownAtEnd;
  }
  const today = s.days[s.day];
  return (today && typeof today.knownAtEnd === 'number') ? today.knownAtEnd : countKnown(s).known;
}
