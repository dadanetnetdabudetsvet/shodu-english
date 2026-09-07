/* Экран «Фраза»: наборная касса.
 *
 * Тут нет правильного и неправильного нажатия — есть черновик, который
 * можно переставлять сколько угодно. Поэтому здесь нет жизней: непонятно,
 * за какое из четырёх слов их снимать, и любой выбор был бы враньём.
 */

import { el, en, setChildren } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { buildPhraseTask, checkPlacement, phraseXp, phraseOptions } from '../domain/phrase.js';
import { newRecord } from '../domain/srs.js';
import { selectByChallenge, allowedSources } from '../domain/challenge.js';
import { poolForChallenge, applyWordSet } from '../data/content.js';
import { enterCard, animate, fillBar } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';
import { haptics } from '../core/haptics.js';

const PHRASES_PER_SESSION = 7;

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const s0 = store.state;
      const startedAt = Date.now();
      const stats = { answered: 0, correctFirstTry: 0, mistakes: 0, newWords: 0, times: [], maxCombo: 0 };

      const sources = allowedSources(s0.challenge.index);
      const pool = applyWordSet(poolForChallenge(content, sources), content, s0.settings.wordSet)
        .map(w => ({
          id: w.id, word: w,
          rec: (s0.srs[w.deck === 'core' ? 'deck2' : 'deck1'] || {})[w.id] || newRecord(),
        }))
        .filter(p => p.rec.box >= (p.word.deck === 'core' ? 1 : 2) && p.word.ex_en);

      if (pool.length < 4) {
        root.append(notReady(ctx));
        return { destroy() {} };
      }

      const banded = selectByChallenge(pool, s0.challenge.index);
      const chosen = (banded.length >= PHRASES_PER_SESSION ? banded : pool)
        .slice(0, PHRASES_PER_SESSION * 2);
      const opts = phraseOptions(s0.challenge.index);
      const tasks = [];
      for (const p of chosen) {
        const task = buildPhraseTask(p.word, content.all, opts);
        if (task) tasks.push({ task, word: p.word });
        if (tasks.length >= PHRASES_PER_SESSION) break;
      }
      if (!tasks.length) { root.append(notReady(ctx)); return { destroy() {} }; }

      let i = 0;
      const bar = el('div', { class: 'bar__fill' });
      const counter = el('span', { class: 't-caption t-num' }, `1/${tasks.length}`);
      const stage = el('div', { class: 'stack grow', style: 'gap:var(--sp-4)' });

      const wrap = el('div', { class: 'session phrase-mode' },
        el('div', { class: 'session__top' },
          el('button', { class: 'session__close', 'aria-label': t('Выйти'), onClick: () => finish(false) }, '✕'),
          el('div', { class: 'bar bar--thin grow' }, bar),
          counter),
        el('div', { class: 't-caption', style: 'text-align:center' }, t('Фраза')),
        stage);
      root.replaceChildren(wrap);
      render();

      function render() {
        const { task, word } = tasks[i];
        counter.textContent = `${i + 1}/${tasks.length}`;
        fillBar(bar, i / tasks.length, (i + 1) / tasks.length);

        let attempt = 0;
        let resolved = false;
        const placed = new Array(task.slots).fill(null);
        const shownAt = performance.now();

        const shelf = el('div', { class: 'shelf' });
        const bank = el('div', { class: 'bank' });
        const check = el('button', { class: 'btn btn--primary btn--cta', disabled: true }, t('Смотрим ✓'));

        function drawShelf() {
          setChildren(shelf, ...placed.map((tile, idx) =>
            tile
              ? el('button', {
                  class: 'tile-word', dataset: { slot: String(idx) },
                  onClick: () => { returnTile(idx); },
                }, en(tile.text))
              // На высокой сложности пунктир исчезает: подсказка длины
              // ответа — самая сильная опора режима, и снимать её
              // осмысленнее, чем добавлять дистракторы.
              : el('span', { class: opts.showSlots ? 'tile-slot' : 'tile-slot tile-slot--blind' })));
          check.disabled = placed.some(x => !x);
          check.textContent = check.disabled ? t('поставь все слова') : t('Смотрим ✓');
        }

        function drawBank() {
          setChildren(bank, ...task.bank.map((tile, idx) => {
            const usedHere = placed.some(p => p && p.bankIndex === idx);
            return el('button', {
              class: 'tile-word' + (usedHere ? ' tile-word--used' : ''),
              disabled: usedHere,
              onClick: () => placeTile(tile, idx),
            }, en(tile.text));
          }));
        }

        function placeTile(tile, bankIndex) {
          const free = placed.findIndex(x => !x);
          if (free < 0) return;
          placed[free] = { ...tile, bankIndex };
          sound.tap();
          if (speech.available) speech.say(tile.text);
          drawShelf(); drawBank();
        }

        function returnTile(idx) {
          placed[idx] = null;
          sound.tap();
          drawShelf(); drawBank();
        }

        check.addEventListener('click', () => {
          if (resolved) return;
          attempt++;
          const res = checkPlacement(placed, task.answer);
          if (res.ok) return succeed(attempt === 1);
          stats.mistakes++;
          haptics.fire('light');
          // Верные плитки остаются на месте: попытка возвращает факты,
          // а не отнимает очко.
          const wrongSet = new Set(res.wrong);
          [...shelf.children].forEach((node, idx) => {
            if (wrongSet.has(idx)) node.classList.add('tile-word--near');
          });
          const hintLine = el('div', { class: 't-sm center' },
            t('{v0} на месте. Посмотри на янтарные.', { v0: res.right }));
          stage.append(hintLine);
          setTimeout(() => {
            hintLine.remove();
            for (const idx of res.wrong) placed[idx] = null;
            drawShelf(); drawBank();
          }, 1400);
          if (attempt >= 2) setTimeout(() => solve(), 1500);
        });

        function solve() {
          if (resolved) return;
          for (let k = 0; k < task.answer.length; k++) placed[k] = { text: task.answer[k] };
          drawShelf();
          succeed(false, true);
        }

        function succeed(firstTry, hinted = false) {
          if (resolved) return;
          resolved = true;
          check.disabled = true;
          skip.remove();
          stats.answered++;
          stats.times.push(performance.now() - shownAt);
          if (firstTry) stats.correctFirstTry++;
          [...shelf.children].forEach((node, k) => {
            node.classList.remove('tile-word--near');
            setTimeout(() => node.classList.add('tile-word--right'), k * 60);
          });
          sound.correct();
          if (speech.available) setTimeout(() => speech.say(task.en), 340);

          store.dispatch({
            type: 'ANSWER_GRADED',
            wordId: task.targetId, deck: tasks[i].word.deck,
            correct: !hinted, typoOnly: false,
            elapsedMs: performance.now() - shownAt, mode: 'phrase', exerciseType: 'phrase',
            usedHint: hinted, isCognate: tasks[i].word.tier <= 2,
            comboAfter: 0, attempt, listens: 1,
          });

          const lesson = el('div', { class: 'teach__lesson', style: 'margin-top:var(--sp-3)' },
            `${tasks[i].word.en} — ${tasks[i].word.answer}. ${task.lesson}`);
          stage.append(lesson);
          setTimeout(() => {
            stage.append(el('button', {
              class: 'btn btn--primary btn--cta',
              onClick: () => { i++; if (i >= tasks.length) finish(true); else render(); },
            }, i + 1 >= tasks.length ? t('Показать итог →') : t('Собрано, дальше →')));
          }, 1400);
        }

        const skip = el('button', { class: 'qskip', onClick: () => solve() }, t('показать 👀'));
        drawShelf(); drawBank();
        const card = el('div', { class: 'stack', style: 'gap:var(--sp-3)' },
          el('div', { class: 'phrase-ru' }, task.ru),
          shelf, bank, check, skip);
        setChildren(stage, card);
        enterCard(card);
      }

      let finished = false;
      function finish(completed) {
        if (finished) return;
        finished = true;
        const ms = Date.now() - startedAt;
        store.dispatch({
          type: 'SESSION_FINISHED', content, mode: 'phrase', completed, ms,
          mistakes: stats.mistakes, newWords: 0, isReview: false,
        });
        const times = stats.times.slice().sort((a, b) => a - b);
        import('./session.js').then(m => { m.setResult({
          mode: 'phrase', completed, ...stats, ms,
          medianAnswerMs: times[Math.floor(times.length / 2)] || 9999,
        }); ctx.go('results'); });
      }

      return { destroy() { speech.cancel(); } };
    },
  };
}

function notReady(ctx) {
  return el('div', { class: 'screen center stack', style: 'justify-content:center;gap:var(--sp-4)' },
    el('div', { style: 'font-size:48px' }, '🧱'),
    el('h1', { class: 't-h1' }, t('Фразы собираются из твоих слов')),
    el('p', { class: 't-sm' }, t('После первого занятия сюда можно возвращаться сколько угодно.')),
    el('button', { class: 'btn btn--primary btn--cta', onClick: () => ctx.go('session/build') }, t('Взять слова 🌱')),
    el('button', { class: 'btn btn--ghost', onClick: () => ctx.go('home') }, t('Не сейчас')));
}
