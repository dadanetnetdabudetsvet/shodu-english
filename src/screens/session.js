/* Экран занятия. Три режима на общем движке.
 *
 * Сессия живёт в собственном состоянии и уничтожается при выходе.
 * В общий стор уходят только два действия: оценка ответа и завершение.
 * Это и изоляция, и бесплатная реализация правила «выход доступен
 * всегда, прогресс сохраняется частично».
 *
 * Правила, соблюдаемые здесь дословно:
 *  — у ошибки нет звука и нет красного цвета;
 *  — ошибочное слово возвращается через три задания в этой же сессии;
 *  — кнопка «не помню» доступна всегда и не наказывается;
 *  — жизни работают только в режиме сборки;
 *  — таймер только в блице и только по выбору.
 */

import { el, en } from '../ui/dom.js';
import { buildSession, SessionQueue, newRecord } from '../domain/srs.js';
import { selectByChallenge, allowedExerciseTypes, allowedSources } from '../domain/challenge.js';
import { isSoftMode, MAX_LIVES } from '../domain/streak.js';
import { poolForChallenge, pickDistractors, shuffle, isTypo } from '../data/content.js';
import { enterCard, enterOptions, popCorrect, shakeWrong, popCombo, fillBar, animate } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';
import { haptics } from '../core/haptics.js';

const MODE_TITLES = { build: 'Занятие', sprint: 'Блиц', ether: 'На слух' };

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const mode = ctx.params[0] || 'build';
      const s0 = store.state;
      const startedAt = Date.now();

      /* Подбор слов: приоритет у алгоритма повторений, планка управляет
         только свободными слотами. */
      const sources = allowedSources(s0.challenge.index);
      const basePool = poolForChallenge(content, sources);
      const withRecs = basePool.map(w => ({
        id: w.id, word: w,
        rec: (s0.srs[w.deck === 'deck2' ? 'deck2' : 'deck1'] || {})[w.id] || newRecord(),
      }));
      const banded = selectByChallenge(withRecs, s0.challenge.index);
      const pool = mergeUnique(withRecs.filter(p => p.rec.box >= 1 && p.rec.dueDay <= s0.day), banded);

      const items = buildSession(pool, {
        day: s0.day, mode, size: mode === 'sprint' ? 30 : 18,
        newBudget: Math.max(0, (s0.settings.dailyGoalWords || 10) - (s0.days[s0.day]?.words || 0)),
      });

      if (!items.length) {
        root.append(emptyState(ctx));
        return { destroy() {} };
      }

      const queue = new SessionQueue(items);
      const allowed = allowedExerciseTypes(s0.challenge.index);
      const soft = isSoftMode(s0.lives);

      const stats = { answered: 0, correctFirstTry: 0, mistakes: 0, newWords: 0, times: [], combo: 0, maxCombo: 0 };

      /* ── каркас ──────────────────────────────────────────────── */
      const bar = el('div', { class: 'bar__fill' });
      const counter = el('span', { class: 't-caption t-num' }, `0/${queue.total}`);
      const sparks = el('div', { class: 'sparks' });
      const combo = el('div', { class: 'combo', hidden: true });
      const stage = el('div', { class: 'stack grow', style: 'gap:var(--sp-4)' });
      const feedback = el('div', { class: 'feedback', hidden: true });

      const top = el('div', { class: 'session__top' },
        el('button', { class: 'session__close', 'aria-label': 'Выйти', onClick: () => finish(false) }, '✕'),
        el('div', { class: 'bar bar--thin grow', role: 'progressbar',
                    'aria-label': `Слово 1 из ${queue.total}` }, bar),
        counter,
        mode === 'build' ? sparks : null,
      );

      const wrap = el('div', { class: 'session' }, top, combo, stage, feedback);
      root.append(wrap);
      renderSparks();
      next();

      /* ── отрисовка ───────────────────────────────────────────── */

      function renderSparks() {
        if (mode !== 'build') return;
        const lives = store.state.lives.count;
        sparks.replaceChildren(...Array.from({ length: MAX_LIVES }, (_, i) =>
          el('span', { class: 'spark' + (i < lives ? '' : ' spark--out') })));
        sparks.setAttribute('aria-label', `Жизней: ${lives} из ${MAX_LIVES}`);
      }

      function next() {
        feedback.hidden = true;
        const item = queue.current;
        if (!item) { finish(true); return; }

        counter.textContent = `${Math.min(queue.pos + 1, queue.total)}/${queue.total}`;
        fillBar(bar, queue.pos / queue.total, (queue.pos + 1) / queue.total);

        if (item.phase === 'teach') renderTeach(item);
        else renderExercise(item);
      }

      /* Карточка подачи нового слова. Перевод показывается сразу и не
         прячется: для когната прятать нечего, а «угадай, потом переверни»
         создаёт ложную трудность. Мы не проверяем, мы подтверждаем. */
      function renderTeach(item) {
        const w = item.word;
        const lesson = w.falseFriend ? w.hint
          : w.stressShift ? `Осторожно: ударение не там, где в русском. ${w.tr}`
          : w.syllableDrop ? `Слогов меньше, чем кажется: ${w.tr}`
          : w.hint;

        const card = el('div', { class: 'qcard' },
          el('div', { class: 'teach', },
            el('div', { class: 'teach__over' }, w.falseFriend ? 'внимание, ловушка' : 'ты это уже знаешь'),
            en(w.en, 't-en'),
            el('div', { class: 't-ipa', 'aria-hidden': 'true' }, w.ipa + '  ·  ' + w.tr),
            el('div', { class: 'teach__ru' }, w.answer),
            el('div', { class: 'teach__lesson' + (w.falseFriend ? ' teach__warn' : '') }, lesson),
          ));

        stage.replaceChildren(card,
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => { sound.tap(); stats.newWords++; queue.advance(); next(); },
          }, w.falseFriend ? 'Понял, не перепутаю' : 'Знаю'));

        enterCard(card);
        if (speech.available) setTimeout(() => speech.say(w.en), 320);
      }

      function renderExercise(item) {
        const w = item.word;
        const type = pickType(w, item, allowed, mode, soft);
        const shownAt = performance.now();
        let answered = false;

        const speakBtn = speech.available ? el('button', {
          class: 'qcard__speak', 'aria-label': `Произнести ${w.en}`,
          onClick: () => speech.say(w.en),
        }, '🔊') : null;

        let card, controls;

        if (type === 'audioChoice') {
          card = el('div', { class: 'qcard' },
            el('div', { class: 'qcard__hint' }, 'Слушай и выбери перевод'),
            el('button', { class: 'btn btn--primary', style: 'min-height:72px;font-size:28px',
                           onClick: () => speech.say(w.en) }, '▶'),
          );
          controls = choiceOptions(w, w.answer, 4, onAnswer);
          setTimeout(() => speech.say(w.en), 300);
        } else if (type === 'type') {
          card = el('div', { class: 'qcard' }, speakBtn,
            el('div', { class: 'qcard__hint' }, 'Напиши по-английски'),
            el('div', { class: 'qcard__ru' }, w.answer));
          controls = typeInput(w, onAnswer);
        } else if (type === 'reverse4') {
          card = el('div', { class: 'qcard' },
            el('div', { class: 'qcard__hint' }, 'Выбери английское слово'),
            el('div', { class: 'qcard__ru' }, w.answer));
          controls = choiceOptions(w, w.en, 4, onAnswer, x => x.en, true);
        } else {
          const n = (mode === 'sprint' || soft) ? (mode === 'sprint' ? 2 : 4) : 4;
          card = el('div', { class: 'qcard' }, speakBtn,
            en(w.en, 't-en'),
            el('div', { class: 't-ipa', 'aria-hidden': 'true' }, w.ipa));
          controls = choiceOptions(w, w.answer, n, onAnswer);
        }

        const skip = el('button', {
          class: 'qskip',
          onClick: () => onAnswer(null, { gaveUp: true }),
        }, 'не помню →');

        stage.replaceChildren(card, controls, skip);
        enterCard(card);
        if (controls.children.length) enterOptions(controls.children);

        function onAnswer(chosen, opts = {}) {
          if (answered) return;
          answered = true;
          const elapsed = performance.now() - shownAt;
          const typo = opts.typoOnly === true;
          const right = opts.gaveUp ? false : (opts.correct ?? (chosen && chosen.id === w.id));

          stats.answered++;
          stats.times.push(elapsed);
          if (right || typo) {
            if (item.phase !== 'retry') stats.correctFirstTry++;
            stats.combo++;
            stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
            if (stats.combo >= 3) {
              combo.hidden = false;
              combo.textContent = `×${stats.combo} КОМБО 🔥`;
              popCombo(combo);
            }
          } else {
            stats.mistakes++;
            stats.combo = 0;
            combo.hidden = true;
            // Ошибочное слово вернётся через три задания в этой же сессии.
            queue.scheduleRetry(item);
          }

          store.dispatch({
            type: 'ANSWER_GRADED',
            wordId: w.id, deck: w.deck, correct: right, typoOnly: typo,
            elapsedMs: elapsed, mode, exerciseType: type,
            usedHint: !!opts.gaveUp, isCognate: w.tier <= 2,
            comboAfter: stats.combo, attempt: item.phase === 'retry' ? 2 : 1, listens: 1,
          });
          renderSparks();
          showFeedback(w, right, typo, opts.gaveUp, chosen, controls, type);
        }
      }

      function choiceOptions(w, correctText, count, onAnswer, label = x => x.answer, compareEn = false) {
        const distract = pickDistractors(w, contentPoolFor(w), count - 1);
        const options = shuffle([w, ...distract]);
        const box = el('div', { class: 'options', role: 'radiogroup', 'aria-label': 'Варианты ответа' });
        options.forEach((o, i) => {
          const btn = el('button', {
            class: 'option', role: 'radio', 'aria-checked': 'false',
            dataset: { id: o.id },
            onClick: () => { markChoice(box, options, w, o); onAnswer(o); },
          },
            el('span', { class: 'option__key' }, String(i + 1)),
            compareEn ? en(label(o), 'grow') : el('span', { class: 'grow', text: label(o) }));
          box.append(btn);
        });
        return box;
      }

      function markChoice(box, options, w, chosen) {
        const idx = options.findIndex(o => o.id === chosen.id);
        const btn = box.children[idx];
        const right = chosen.id === w.id;
        btn.classList.add(right ? 'option--right' : 'option--wrong');
        btn.append(el('span', { class: 'option__mark' }, right ? '✓' : '→'));
        if (right) popCorrect(btn);
        else {
          shakeWrong(btn);
          const ri = options.findIndex(o => o.id === w.id);
          const rb = box.children[ri];
          setTimeout(() => {
            rb.classList.add('option--right');
            rb.append(el('span', { class: 'option__mark' }, '✓'));
          }, 300);
        }
        for (const b of box.children) b.disabled = true;
      }

      function typeInput(w, onAnswer) {
        const input = el('input', {
          class: 'option', type: 'text', inputmode: 'latin', autocapitalize: 'off',
          autocomplete: 'off', spellcheck: 'false', lang: 'en',
          placeholder: 'по-английски…', style: 'width:100%',
        });
        const submit = () => {
          const v = input.value.trim().toLowerCase();
          if (!v) return;
          const exact = v === w.en.toLowerCase();
          const typo = !exact && isTypo(v, w.en);
          input.disabled = true;
          input.classList.add(exact || typo ? 'option--right' : 'option--wrong');
          onAnswer(w, { correct: exact, typoOnly: typo });
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        const box = el('div', { class: 'options' }, input,
          el('button', { class: 'btn btn--primary', onClick: submit }, 'Проверить'));
        setTimeout(() => input.focus(), 120);
        return box;
      }

      function showFeedback(w, right, typo, gaveUp, chosen, controls, type) {
        feedback.className = 'feedback ' + (right || typo ? 'feedback--right' : 'feedback--wrong');
        feedback.hidden = false;

        const title = typo ? 'Считаю верным, это опечатка'
          : right ? pick(['Верно', 'Точно', 'Есть', 'Так и есть', 'В точку'])
          : gaveUp ? 'Честно' : pick(['Не совсем', 'Почти', 'Мимо']);

        const note = right && !typo
          ? `${w.en} — ${w.answer}`
          : `${w.en} — ${w.answer}. ${gaveUp ? 'Покажем ещё раз попозже.' : 'Верну его в конце, посмотрим ещё раз.'}`;

        feedback.replaceChildren(
          el('div', { class: 'feedback__title', role: 'status', 'aria-live': 'assertive' }, title),
          el('div', { class: 'feedback__note' }, note),
          w.tier >= 3 && (w.stressShift || w.syllableDrop)
            ? el('div', { class: 't-caption' }, `звучит так: ${w.tr}`) : null,
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => { sound.tap(); queue.advance(); next(); },
          }, 'Дальше'),
        );
        animate(feedback, [{ transform: 'translateY(100%)' }, { transform: 'none' }],
          { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
        if (!right && !typo && speech.available) setTimeout(() => speech.saySlow(w.en), 260);
      }

      function contentPoolFor(w) {
        return w.deck === 'deck2' ? content.deck2 : content.deck1;
      }

      function finish(completed) {
        const ms = Date.now() - startedAt;
        store.dispatch({
          type: 'SESSION_FINISHED',
          mode, completed, ms,
          mistakes: stats.mistakes, newWords: stats.newWords, isReview: false,
        });
        const median = stats.times.length
          ? stats.times.slice().sort((a, b) => a - b)[Math.floor(stats.times.length / 2)] : 9999;
        sessionResult = {
          mode, completed, ...stats, ms, medianAnswerMs: median,
        };
        speech.cancel();
        ctx.go('results');
      }

      return { destroy() { speech.cancel(); } };
    },
  };
}

/* Итоги передаются через модуль: сессия уничтожается, экран итогов
   монтируется отдельно и не должен лезть в чужое состояние. */
export let sessionResult = null;
export function takeResult() { const r = sessionResult; sessionResult = null; return r; }

function pickType(w, item, allowed, mode, soft) {
  if (mode === 'sprint') return 'choice2';
  if (mode === 'ether') return allowed.includes('audioChoice') ? 'audioChoice' : 'choice4';
  if (soft) return 'choice4';
  const box = item.rec?.box || 1;
  const options = [];
  if (box >= 1) options.push('choice4');
  if (box >= 2 && allowed.includes('reverse4')) options.push('reverse4');
  if (box >= 2 && allowed.includes('audioChoice') && speech.available) options.push('audioChoice');
  if (box >= 3 && allowed.includes('type')) options.push('type');
  return options[Math.floor(Math.random() * options.length)] || 'choice4';
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function mergeUnique(a, b) {
  const seen = new Set(a.map(x => x.id));
  return a.concat(b.filter(x => !seen.has(x.id)));
}

function emptyState(ctx) {
  return el('div', { class: 'screen center stack', style: 'justify-content:center' },
    el('div', { style: 'font-size:48px' }, '🌤'),
    el('h1', { class: 't-h1' }, 'На сегодня всё'),
    el('p', { class: 't-sm' }, 'Все слова повторены. Возвращайся завтра — или подними планку в профиле, если хочется ещё.'),
    el('button', { class: 'btn btn--primary btn--cta', onClick: () => ctx.go('home') }, 'На главную'));
}
