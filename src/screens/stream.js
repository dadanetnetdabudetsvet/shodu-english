/* Экран «Поток»: ночное табло.
 *
 * Строки приходят снизу и уходят вверх. Не успел — строка сама показала
 * верное слово и уехала. Состояния «конец» у экрана нет вообще, поэтому
 * проиграть здесь нельзя буквально, а не по договорённости.
 *
 * Тап по слову, которое стоит правильно, — это ход в поиске, а не
 * ошибка: он сужает область и подчёркивает слово до конца строки.
 * Снимать за него жизнь значило бы запретить искать.
 */

import { el, en, setChildren } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { buildStreamLine, nextTempo, wordsPerMinute, STREAM, STREAM_XP } from '../domain/stream.js';
import { newRecord } from '../domain/srs.js';
import { allowedSources } from '../domain/challenge.js';
import { poolForChallenge } from '../data/content.js';
import { animate } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const s0 = store.state;
      const startedAt = Date.now();
      let tempo = STREAM.startMs;
      let wave = 0, inWave = 0, missedInWave = 0;
      let wordsRead = 0, readMs = 0;
      const stats = { answered: 0, correctFirstTry: 0, mistakes: 0, newWords: 0, times: [], maxCombo: 0 };
      let steady = false;
      let timer = null, rafId = null;
      // Отложенные переходы между строками: без учёта они продолжали
      // начислять очки уже после ухода с экрана.
      const pending = new Set();
      const later = (fn, ms) => { const id = setTimeout(() => { pending.delete(id); fn(); }, ms); pending.add(id); return id; };

      const sources = allowedSources(s0.challenge.index);
      const pool = poolForChallenge(content, sources)
        .map(w => ({ id: w.id, word: w,
          rec: (s0.srs[w.deck === 'core' ? 'deck2' : 'deck1'] || {})[w.id] || newRecord() }))
        .filter(p => p.rec.box >= (p.word.deck === 'core' ? 2 : 3) && p.word.ex_en);

      if (pool.length < 6) { root.append(notReady(ctx)); return { destroy() {} }; }

      const stage = el('div', { class: 'stream-stage' });
      const wrap = el('div', { class: 'session stream-mode' },
        el('div', { class: 'session__top' },
          el('button', { class: 'session__close', 'aria-label': t('Выйти'), onClick: () => finish(false) }, '✕'),
          el('div', { class: 'grow' }),
          el('span', { class: 't-caption' }, t('Поток'))),
        stage);
      root.replaceChildren(wrap);
      intro();

      function intro() {
        setChildren(stage, el('div', { class: 'stack center', style: 'gap:var(--sp-4);justify-content:center;flex:1' },
          el('div', { style: 'font-size:44px' }, '👁'),
          el('h1', { class: 't-h1' }, t('Читай. Одно слово в строке чужое.')),
          el('p', { class: 't-sm' }, t('В каждой строке одно слово чужое. Тапни по нему. Не успеешь — строка покажет сама.')),
          el('button', { class: 'btn btn--primary btn--cta', onClick: () => { steady = false; start(); } }, t('С ускорением ⚡')),
          el('button', { class: 'btn', onClick: () => { steady = true; start(); } }, t('Ровный темп 🌊'))));
      }

      function start() { wave = 0; nextWave(); }

      function nextWave() {
        inWave = 0; missedInWave = 0;
        wave++;
        if (wave > STREAM.waves) { finish(true); return; }
        nextLine();
      }

      function nextLine() {
        if (inWave >= STREAM.waveSize) { waveBreak(); return; }
        inWave++;

        const p = pool[Math.floor(Math.random() * pool.length)];
        const line = buildStreamLine(p.word, content.all);
        if (!line) { nextLine(); return; }

        const shownAt = performance.now();
        let resolved = false;
        const tapped = new Set();

        const bar = el('div', { class: 'stream-bar' });
        const row = el('div', { class: 'stream-line' });
        line.tokens.forEach((tok, idx) => {
          row.append(el('button', {
            class: 'stream-word', lang: 'en',
            onClick: () => onTap(idx),
          }, tok.text));
          if (tok.after) row.append(document.createTextNode(tok.after + ' '));
        });

        const ru = el('div', { class: 'stream-ru' }, line.ru);
        setChildren(stage, el('div', { class: 'stream-card' }, bar, row, ru));

        // Полоса наполняется, а не опустошается: опустошение читается
        // как утекающее время, то есть как фигура проигрыша.
        animate(bar, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
          { duration: tempo, easing: 'linear', fill: 'forwards' });
        animate(row, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });

        timer = later(() => escape(), tempo);

        function onTap(idx) {
          if (resolved) return;
          if (idx === line.badIndex) {
            resolved = true;
            clearTimeout(timer);
            const taps = tapped.size;
            const xp = taps === 0 ? STREAM_XP.firstTap : taps === 1 ? STREAM_XP.secondTap : STREAM_XP.laterTap;
            sound.correct();
            row.children[idx * (line.tokens[idx].after ? 2 : 1)];
            const node = [...row.querySelectorAll('.stream-word')][idx];
            node.textContent = line.correct;
            node.classList.add('stream-word--fixed');
            if (speech.available) speech.say(line.tokens.map((tk, k) => (k === idx ? line.correct : tk.text)).join(' '));
            grade(true, xp, performance.now() - shownAt, taps);
            later(() => nextLine(), 700);
          } else {
            // Не ошибка, а сужение поиска: слово остаётся подчёркнутым.
            tapped.add(idx);
            [...row.querySelectorAll('.stream-word')][idx].classList.add('stream-word--checked');
          }
        }

        function escape() {
          if (resolved) return;
          resolved = true;
          missedInWave++;
          const node = [...row.querySelectorAll('.stream-word')][line.badIndex];
          node.textContent = line.correct;
          node.classList.add('stream-word--fixed');
          ru.textContent = t('Вот оно');
          grade(false, STREAM_XP.escaped, performance.now() - shownAt);
          later(() => nextLine(), 900);
        }

        function grade(found, xp, elapsed, taps = 0) {
          stats.answered++;
          stats.times.push(elapsed);
          if (found) stats.correctFirstTry++; else stats.mistakes++;
          wordsRead += line.tokens.length;
          readMs += elapsed;
          store.dispatch({
            type: 'ANSWER_GRADED',
            wordId: line.targetId, deck: p.word.deck,
            correct: found, typoOnly: false,
            elapsedMs: elapsed, mode: 'stream', exerciseType: 'scan',
            usedHint: false, isCognate: p.word.tier <= 2,
            comboAfter: 0, attempt: 1, listens: 1, taps,
            softMiss: !found,
          });
        }
      }

      function waveBreak() {
        if (!steady) tempo = nextTempo(tempo, missedInWave);
        const wpm = wordsPerMinute(wordsRead, readMs);
        setChildren(stage, el('div', { class: 'stack center', style: 'gap:var(--sp-3);justify-content:center;flex:1' },
          el('div', { class: 't-h1 t-num' }, String(wpm)),
          el('div', { class: 't-sm' }, t('английских слов в минуту — это твоя скорость чтения')),
          el('div', { class: 't-caption' }, t('волна {v0} из {v1} · {v2} строк', {
            v0: wave, v1: STREAM.waves, v2: STREAM.waveSize })),
          el('button', { class: 'btn btn--primary btn--cta', onClick: () => nextWave() },
            wave >= STREAM.waves ? t('Показать итог →') : t('Дальше волна →')),
          el('button', { class: 'btn btn--ghost', onClick: () => finish(true) }, t('На сегодня всё 👌'))));
      }

      let finished = false;
      function finish(completed) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        for (const id of pending) clearTimeout(id);
        pending.clear();
        if (rafId) cancelAnimationFrame(rafId);
        const ms = Date.now() - startedAt;
        const wpm = wordsPerMinute(wordsRead, readMs);
        const best = store.state.profile.readWpm || 0;
        if (wpm > best) store.dispatch({ type: 'PROFILE_SET', patch: { readWpm: wpm } });
        store.dispatch({
          type: 'SESSION_FINISHED', content, mode: 'stream', completed, ms,
          mistakes: stats.mistakes, newWords: 0, isReview: false, newRecord: wpm > best,
        });
        const times = stats.times.slice().sort((a, b) => a - b);
        import('./session.js').then(m => {
          m.setResult({ mode: 'stream', completed, ...stats, ms, wpm,
            medianAnswerMs: times[Math.floor(times.length / 2)] || 9999 });
          ctx.go('results');
        });
      }

      return { destroy() {
        finished = true;
        clearTimeout(timer);
        for (const id of pending) clearTimeout(id);
        pending.clear();
        speech.cancel();
      } };
    },
  };
}

function notReady(ctx) {
  return el('div', { class: 'screen center stack', style: 'justify-content:center;gap:var(--sp-4)' },
    el('div', { style: 'font-size:48px' }, '👁'),
    el('h1', { class: 't-h1' }, t('Поток читается по словам, которые уже твои')),
    el('p', { class: 't-sm' }, t('Одно занятие — и здесь будет что читать.')),
    el('button', { class: 'btn btn--primary btn--cta', onClick: () => ctx.go('session/build') }, t('Взять слова 🌱')),
    el('button', { class: 'btn btn--ghost', onClick: () => ctx.go('home') }, t('Не сейчас')));
}
