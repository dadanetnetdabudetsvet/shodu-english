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

import { el, en, setChildren } from '../ui/dom.js';
import { buildSession, SessionQueue, newRecord, maintenance } from '../domain/srs.js';
import { selectByChallenge, allowedExerciseTypes, allowedSources, tierOf } from '../domain/challenge.js';
import { isSoftMode, MAX_LIVES } from '../domain/streak.js';
import { poolForChallenge, pickDistractors, shuffle, isTypo } from '../data/content.js';
import { enterCard, enterOptions, popCorrect, shakeWrong, popCombo, fillBar, animate } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';
import { haptics } from '../core/haptics.js';
import { t } from '../i18n/index.js';

/* Названия переводятся при отрисовке, а не при загрузке модуля:
   на уровне модуля язык ещё не выбран, и они остались бы русскими. */
const MODE_TITLES = { build: 'Занятие', sprint: 'Блиц', ether: 'На слух' };

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const mode = ctx.params[0] || 'build';
      let teardown = () => {};
      start();
      return { destroy() { speech.cancel(); teardown(); } };

      /* Сессия пересобирается на месте: из тупика человек выходит
         кнопкой прямо здесь, а не уходом на главную. */
      function start(extraPractice = false) {
      const s0 = store.state;
      const startedAt = Date.now();

      /* Подбор слов: приоритет у алгоритма повторений, сложность управляет
         только свободными слотами. */
      const sources = allowedSources(s0.challenge.index);
      const basePool = poolForChallenge(content, sources);
      const withRecs = basePool.map(w => ({
        id: w.id, word: w,
        rec: (s0.srs[w.deck === 'core' ? 'deck2' : 'deck1'] || {})[w.id] || newRecord(),
      }));
      const banded = selectByChallenge(withRecs, s0.challenge.index);
      const pool = mergeUnique(withRecs.filter(p => p.rec.box >= 1 && p.rec.dueDay <= s0.day), banded);

      const target = mode === 'sprint' ? 24 : 14;
      let items = extraPractice
        ? maintenance(withRecs, target, s0.day)
        : buildSession(pool, {
            day: s0.day, mode, size: mode === 'sprint' ? 30 : 18,
            newBudget: Math.max(0, (s0.settings.dailyGoalWords || 10) - (s0.days[s0.day]?.words || 0)),
          });

      /* Полоса планки сужает подбор, и на маленьком словаре занятие
         выходило в три задания. Добор идёт из ПОЛНОГО набора знакомых
         слов, а не из полосы: лучше показать знакомое слово лишний раз,
         чем выдать огрызок сессии. */
      if (items.length < 8) {
        items = items.concat(maintenance(withRecs, 8 - items.length, s0.day, items));
      }

      /* Знакомых слов может быть меньше, чем нужно на занятие: у человека
         в первый день их шесть. Тогда слова идут по второму кругу, а не
         превращают занятие в огрызок из трёх заданий. Больше двух
         показов одного слова за сессию не даём: это уже зубрёжка. */
      if (items.length && items.length < 8) {
        const round2 = items.map(x => ({ ...x, secondPass: true }));
        items = items.concat(round2).slice(0, Math.max(8, items.length));
      }

      if (!items.length) {
        root.replaceChildren();
        root.append(deadEndFix({
          mode, ctx, store, content,
          hasAnyProgress: pool.some(p => p.rec.box >= 1),
          onRetry: (opts) => start(opts && opts.extraPractice),
        }));
        return;
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

      const modeTag = el('div', { class: 't-caption', style: 'text-align:center' },
        t(MODE_TITLES[mode] || 'Занятие'));

      const gear = el('button', {
        class: 'session__gear', 'aria-label': t('Сложность'),
        onClick: openDifficulty,
      }, '🎚');

      const top = el('div', { class: 'session__top' },
        el('button', { class: 'session__close', 'aria-label': t('Выйти'), onClick: confirmExit }, '✕'),
        el('div', { class: 'bar bar--thin grow', role: 'progressbar',
                    'aria-label': t('Слово 1 из {v0}', { v0: queue.total }) }, bar),
        counter,
        mode === 'build' ? sparks : null,
        gear,
      );

      /* Сложность меняется прямо во время занятия: раньше за этим надо
         было уходить в профиль, то есть бросать занятие. Изменение
         вступает в силу со следующего задания. */
      function openDifficulty() {
        sound.swipe();
        const cur = store.state.challenge.index;
        const val = el('div', { class: 't-h2 t-num center' }, String(cur));
        const name = el('div', { class: 't-caption center' }, t(tierOf(cur).name));
        const input = el('input', {
          type: 'range', min: '0', max: '30', value: String(cur),
          style: 'width:100%', 'aria-label': t('Ручка сложности'),
          onInput: (e) => {
            val.textContent = e.target.value;
            name.textContent = t(tierOf(Number(e.target.value)).name);
          },
        });
        const sheet = el('div', {
          class: 'card stack', role: 'dialog', 'aria-modal': 'true',
          style: 'position:fixed;left:12px;right:12px;bottom:12px;z-index:95;max-width:536px;margin:0 auto',
        },
          el('div', { style: 'font-weight:600' }, t('Сложность 🎚')),
          val, name, input,
          el('div', { class: 't-caption center' }, t('Подействует со следующего задания.')),
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => {
              store.dispatch({ type: 'CHALLENGE_SET', index: Number(input.value) });
              sound.select();
              close();
            },
          }, t('Готово ✓')),
          el('button', { class: 'btn btn--ghost', onClick: close }, t('Отмена')),
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:94', onClick: close });
        document.body.append(back, sheet);
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        function close() { sheet.remove(); back.remove(); document.removeEventListener('keydown', onKey); }
      }

      const wrap = el('div', { class: 'session' }, top, modeTag, combo, stage, feedback);
      root.replaceChildren(wrap);   // пересборка на месте не должна копить экраны
      renderSparks();
      next();

      /* ── отрисовка ───────────────────────────────────────────── */

      function renderSparks() {
        if (mode !== 'build') return;
        const lives = store.state.lives.count;
        setChildren(sparks, ...Array.from({ length: MAX_LIVES }, (_, i) =>
          el('span', { class: 'spark' + (i < lives ? '' : ' spark--out') })));
        sparks.setAttribute('aria-label', t('Жизней: {v0} из {v1}', { v0: lives, v1: MAX_LIVES }));
      }

      function next() {
        feedback.hidden = true;
        const item = queue.current;
        if (!item) { finish(true); return; }

        counter.textContent = `${queue.shownIndex}/${queue.total}`;
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
          : w.stressShift ? t('Осторожно: ударение не там, где в русском. {v0}', { v0: w.tr })
          : w.syllableDrop ? t('Слогов меньше, чем кажется: {v0}', { v0: w.tr })
          : w.hint;

        const card = el('div', { class: 'qcard' },
          el('div', { class: 'teach', },
            el('div', { class: 'teach__over' }, w.falseFriend ? t('внимание, ловушка') : t('ты это уже знаешь')),
            en(w.en, 't-en'),
            el('div', { class: 't-ipa', 'aria-hidden': 'true' }, w.ipa + '  ·  ' + w.tr),
            el('div', { class: 'teach__ru' }, w.answer),
            el('div', { class: 'teach__lesson' + (w.falseFriend ? ' teach__warn' : '') }, lesson),
          ));

        setChildren(stage, card,
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => { sound.tap(); stats.newWords++; queue.advance(); next(); },
          }, w.falseFriend ? t('Понял, не перепутаю 🪤') : t('Знаю это ✅')));

        enterCard(card);
        if (speech.available) setTimeout(() => speech.say(w.en), 320);
      }

      function renderExercise(item) {
        const w = item.word;
        const type = pickType(w, item, allowed, mode, soft);
        const shownAt = performance.now();
        let answered = false;

        const speakBtn = speech.available ? el('button', {
          class: 'qcard__speak', 'aria-label': t('Произнести {v0}', { v0: w.en }),
          onClick: () => speech.say(w.en),
        }, '🔊') : null;

        let card, controls;

        if (type === 'audioChoice') {
          card = el('div', { class: 'qcard' },
            el('div', { class: 'qcard__hint' }, t('Слушай и выбери перевод')),
            el('button', { class: 'btn btn--primary', style: 'min-height:72px;font-size:28px',
                           onClick: () => speech.say(w.en) }, '▶'),
          );
          controls = choiceOptions(w, w.answer, 4, onAnswer);
          setTimeout(() => speech.say(w.en), 300);
        } else if (type === 'type') {
          card = el('div', { class: 'qcard' }, speakBtn,
            el('div', { class: 'qcard__hint' }, t('Напиши по-английски')),
            el('div', { class: 'qcard__ru' }, w.answer));
          controls = typeInput(w, onAnswer);
        } else if (type === 'reverse4') {
          card = el('div', { class: 'qcard' },
            el('div', { class: 'qcard__hint' }, t('Выбери английское слово')),
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
        }, t('не помню 🤷'));

        /* Звук бывает нельзя включить: в транспорте, рядом со спящим,
           на работе. Аудиозадание должно пропускаться без потерь, а не
           заставлять выбирать наугад. */
        const noAudio = type === 'audioChoice' ? el('button', {
          class: 'qskip', style: 'margin-top:-6px',
          onClick: () => onAnswer(null, { gaveUp: true, silent: true }),
        }, t('не могу слушать 🔇')) : null;

        setChildren(stage, card, controls, skip, noAudio);
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
              combo.textContent = t('×{v0} КОМБО 🔥', { v0: stats.combo });
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
            // «Не могу слушать» — это обстоятельства, а не незнание:
            // слово возвращается в очередь, но коробка не падает.
            softMiss: !!opts.silent,
          });
          renderSparks();
          if (opts.silent) {
            // Молча дальше: без разбора, потому что разбор здесь звуковой.
            setTimeout(() => { queue.advance(); next(); }, 220);
            return;
          }
          showFeedback(w, right, typo, opts.gaveUp, chosen, controls, type);
        }
      }

      function choiceOptions(w, correctText, count, onAnswer, label = x => x.answer, compareEn = false) {
        const distract = pickDistractors(w, contentPoolFor(w), count - 1);
        const options = shuffle([w, ...distract]);
        const box = el('div', { class: 'options', role: 'radiogroup', 'aria-label': t('Варианты ответа') });
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
          placeholder: t('по-английски…'), style: 'width:100%',
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
          el('button', { class: 'btn btn--primary', onClick: submit }, t('Проверить ✓')));
        setTimeout(() => input.focus(), 120);
        return box;
      }

      function showFeedback(w, right, typo, gaveUp, chosen, controls, type) {
        feedback.className = 'feedback ' + (right || typo ? 'feedback--right' : 'feedback--wrong');
        feedback.hidden = false;

        const title = typo ? t('Считаю верным, это опечатка')
          : right ? pick([t('Верно'), t('Точно'), t('Есть'), t('Так и есть'), t('В точку')])
          : gaveUp ? t('Честно') : pick([t('Не совсем'), t('Почти'), t('Мимо')]);

        const note = right && !typo
          ? `${w.en} — ${w.answer}`
          : t('{v0} — {v1}. {v2}', {
              v0: w.en, v1: w.answer,
              v2: gaveUp ? t('Покажем ещё раз попозже.') : t('Верну его в конце, посмотрим ещё раз.'),
            });

        setChildren(feedback, 
          el('div', { class: 'feedback__title', role: 'status', 'aria-live': 'assertive' }, title),
          el('div', { class: 'feedback__note' }, note),
          w.tier >= 3 && (w.stressShift || w.syllableDrop)
            ? el('div', { class: 't-caption' }, t('звучит так: {v0}', { v0: w.tr })) : null,
          el('button', {
            class: 'btn btn--primary btn--cta',
            onClick: () => { sound.tap(); queue.advance(); next(); },
          }, right || typo
              ? pick([t('Красота, дальше →'), t('Ещё давай →'), t('Идём дальше →'), t('Поехали дальше →')])
              : t('Понял, дальше →')),
        );
        animate(feedback, [{ transform: 'translateY(100%)' }, { transform: 'none' }],
          { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
        if (!right && !typo && speech.available) setTimeout(() => speech.saySlow(w.en), 260);
      }

      /* Дистракторы берём из той же колоды: путать существительное
         с наречием бессмысленно, различать похожие слова одного класса —
         и есть учебная работа. */
      function contentPoolFor(w) {
        const same = content.all.filter(x => x.deck === w.deck);
        return same.length >= 8 ? same : content.all;
      }

      /* Выход подтверждается, а половина занятия засчитывается как день.
         Раньше касание крестика на семнадцатом задании из восемнадцати
         стирало день целиком. */
      function confirmExit() {
        const half = queue.pos >= Math.ceil(queue.total / 2);
        if (queue.pos === 0) { finish(false); return; }
        const sheet = el('div', {
          class: 'card stack', role: 'dialog', 'aria-modal': 'true',
          style: 'position:fixed;left:12px;right:12px;bottom:12px;z-index:90;max-width:536px;margin:0 auto',
        },
          el('div', { style: 'font-weight:600' }, t('Уходим?')),
          el('div', { class: 't-sm' }, half
            ? t('Больше половины уже сделано — день засчитаю.')
            : t('Всё, что успел, сохранится. День засчитается со второй половины.')),
          el('button', { class: 'btn btn--primary btn--cta', onClick: () => { close(); } }, t('Остаюсь ⚡')),
          el('button', { class: 'btn btn--ghost', onClick: () => { close(); finish(half); } }, t('Всё, на сегодня хватит')),
        );
        const back = el('div', { style: 'position:fixed;inset:0;background:var(--overlay);z-index:89', onClick: close });
        document.body.append(back, sheet);
        function close() { sheet.remove(); back.remove(); }
      }

      let finished = false;
      function finish(completed) {
        if (finished) return;      // переход асинхронный, тап успевает трижды
        finished = true;
        const ms = Date.now() - startedAt;
        const bestBefore = store.state.profile.sprintBest || 0;
        const isRecord = mode === 'sprint' && stats.correctFirstTry > bestBefore;
        if (isRecord) store.dispatch({ type: 'PROFILE_SET', patch: { sprintBest: stats.correctFirstTry } });
        store.dispatch({
          type: 'SESSION_FINISHED',
          mode, completed, ms, newRecord: isRecord,
          mistakes: stats.mistakes, newWords: stats.newWords, isReview: extraPractice,
        });
        const median = stats.times.length
          ? stats.times.slice().sort((a, b) => a - b)[Math.floor(stats.times.length / 2)] : 9999;
        sessionResult = {
          mode, completed, ...stats, ms, medianAnswerMs: median,
        };
        speech.cancel();
        ctx.go('results');
      }

      teardown = () => {};
      }
    },
  };
}

/* Итоги передаются через модуль: сессия уничтожается, экран итогов
   монтируется отдельно и не должен лезть в чужое состояние. */
export let sessionResult = null;
export function takeResult() { const r = sessionResult; sessionResult = null; return r; }
/** Новые режимы живут в своих экранах, но отдают итог сюда же. */
export function setResult(r) { sessionResult = r; }

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

/* Экран, который раньше был тупиком.
 *
 * Прежний текст отправлял человека «поднять сложность в профиле» — то есть
 * уйти с экрана, найти настройку и вернуться. Это ровно то место, где
 * люди закрывают приложение.
 *
 * Теперь каждая причина пустой колоды имеет кнопку, решающую её здесь же
 * и в одно касание. Главная кнопка на экране всегда одна. */
function deadEndFix({ mode, ctx, store, content, hasAnyProgress, onRetry }) {
  const s = store.state;
  const modeName = { sprint: t('Блиц'), ether: t('Режим «На слух»'), build: t('Занятие') }[mode] || t('Занятие');

  // Причина первая: человек ещё ничего не учил, а блиц и слух работают
  // только по знакомым словам. Это самый частый вход в тупик.
  if (!hasAnyProgress) {
    return el('div', { class: 'screen center stack', style: 'justify-content:center;gap:var(--sp-4)' },
      el('div', { style: 'font-size:48px' }, '🌱'),
      el('h1', { class: 't-h1' }, t('{v0} — для слов, которые ты уже видел', { v0: modeName })),
      el('p', { class: 't-sm' },
        t('Сейчас их ещё нет. Возьмём первый десяток, это минуты четыре. ') +
        t('После этого сюда можно возвращаться сколько угодно.')),
      el('button', {
        class: 'btn btn--primary btn--cta',
        onClick: () => { sound.sessionStart(); ctx.go('session/build'); },
      }, t('Взять первые слова 🌱')),
      el('button', { class: 'btn btn--ghost', onClick: () => ctx.go('home') }, t('Не сейчас')),
    );
  }

  // Причина вторая: на сегодня всё повторено. Это не проблема, а успех,
  // но выход всё равно должен быть здесь, а не в настройках.
  const bar = tierOfIndex(store);
  return el('div', { class: 'screen center stack', style: 'justify-content:center;gap:var(--sp-4)' },
    el('div', { style: 'font-size:48px' }, '🌤'),
    el('h1', { class: 't-h1' }, t('Всё повторено')),
    el('p', { class: 't-sm' }, t('На сегодня слова закончились. Можно остановиться — или взять ещё, прямо отсюда.')),

    el('button', {
      class: 'btn btn--primary btn--cta',
      onClick: () => { sound.sessionStart(); onRetry({ extraPractice: true }); },
    }, t('Ещё разок ⚡')),

    el('div', { class: 'card stack', style: 'gap:var(--sp-2);width:100%' },
      el('div', { class: 'row row--between' },
        el('div', { class: 't-sm' }, t('Сложность {v0} · {v1}', { v0: s.challenge.index, v1: t(bar.name) })),
        el('div', { class: 't-caption' }, t('сложность подбора'))),
      el('div', { class: 't-caption' }, t('Выше сложность — в подбор попадают слова потруднее и новые типы заданий.')),
      el('button', {
        class: 'btn',
        onClick: () => {
          sound.tap();
          store.dispatch({ type: 'CHALLENGE_SET', index: Math.min(30, s.challenge.index + 3) });
          onRetry();
        },
      }, t('Поднять сложность 📈')),
    ),

    mode !== 'build' ? el('button', {
      class: 'btn', onClick: () => { sound.sessionStart(); ctx.go('session/build'); },
    }, t('Взять новые слова 🌱')) : null,

    el('button', { class: 'btn btn--ghost', onClick: () => ctx.go('home') }, t('Хватит на сегодня 👌')),
  );
}

function tierOfIndex(store) {
  return tierOf(store.state.challenge.index);
}
