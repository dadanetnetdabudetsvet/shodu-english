/* Корневой редьюсер. Чистая функция: время приходит в действии полем at,
 * побочные эффекты возвращаются описанием, а не исполняются здесь. */

import { dayNumber } from '../core/day.js';
import { grade, newRecord, isKnown, isLearning } from '../domain/srs.js';
import { answerXp, sessionBonusXp, SOFT_MODE_XP_FACTOR, GEMS, milestoneFor,
         levelForXp, levelProgress } from '../domain/scoring.js';
import { refreshStreak, completeDay, costsLife, loseLife, regenLives,
         isSoftMode, grantEmergencyFreeze } from '../domain/streak.js';
import { applyVote, autoAdjust, setManual, clampIndex } from '../domain/challenge.js';
import { makeSelfCode, verifyProof, rewardFor, NEWCOMER_GEMS } from '../domain/referral.js';
import { evaluateMedals } from '../domain/medals.js';
import { weekDone } from '../domain/streak.js';
import { fx } from './store.js';
import { t } from '../i18n/index.js';

export function rootReducer(state, action) {
  switch (action.type) {

    case 'DAY_TICK': {
      const day = dayNumber(action.at);
      if (day === state.day) return { state, effects: [] };
      const { streak, events } = refreshStreak(state.streak, day);
      const effects = [];
      let next = { ...state, day, streak, lives: regenLives(state.lives, action.at, true) };

      for (const e of events) {
        if (e.type === 'freezeUsed') {
          // Правило Р6: валюта не тратится молча.
          effects.push(fx.toast(
            e.count === 1 ? t('Заморозка спасла ритм за вчера.') : t('Заморозки спасли ритм за {v0} дня.', { v0: e.count }),
            'info'));
        }
        if (e.type === 'paused') {
          effects.push(fx.toast('Ритм на паузе. Он вернётся с первого же занятия.', 'info'));
        }
        if (e.type === 'softRestart') {
          // Ноль на счётчике не показывается. Показывается рекорд.
          effects.push(fx.toast(`Лучший ритм: ${e.best} дней. Он остаётся твоим.`, 'info'));
        }
      }
      // Заморозка при угрозе ритму выдаётся безусловно, без оглядки на баланс.
      if (next.streak.current >= 3 && next.streak.freezes === 0) {
        next = { ...next, streak: grantEmergencyFreeze(next.streak) };
      }
      return { state: next, effects: [...effects, fx.save()] };
    }

    case 'ANSWER_GRADED': {
      const { wordId, deck, correct, elapsedMs, mode, exerciseType,
              usedHint, typoOnly, isCognate, comboAfter, attempt, listens, softMiss } = action;
      const day = state.day;
      const key = deck === 'core' ? 'deck2' : 'deck1';
      const srs = { ...state.srs, [key]: { ...state.srs[key] } };
      const rec = { ...(srs[key][wordId] || newRecord()) };
      const boxBefore = rec.box;

      if (softMiss && !correct) {
        /* Строка уехала по времени. «Не успел» — это не «не знал»:
           ронять коробку за скорость значит подкручивать оценку знания. */
        rec.seen++; rec.lastDay = day; rec.dueDay = day;
      } else {
        grade(rec, correct || typoOnly, elapsedMs, {
          day, mode, exerciseType, boxBefore, isCognate,
        });
      }
      srs[key][wordId] = rec;

      const soft = isSoftMode(state.lives);
      let xp = answerXp(mode, {
        correct: correct || typoOnly, comboAfter, attempt, listens, exerciseType,
        taps: action.taps || 0,
      });
      /* Правило Р8: подсказка не наказывается, это половина очков, а не ноль.
         Раньше сдача давала строго ноль, потому что множитель применялся
         только к уже ненулевому значению. */
      if (usedHint) xp = Math.max(1, Math.round(answerXp(mode, { correct: true, comboAfter: 0, attempt: 2, listens: 3, exerciseType }) / 2));
      if (soft) xp = Math.round(xp * SOFT_MODE_XP_FACTOR);

      let lives = state.lives;
      const effects = [];

      if (!correct && !typoOnly) {
        if (costsLife({ mode, rec: { ok: boxBefore >= 3 ? 3 : rec.ok - 1 }, usedHint, typoOnly })) {
          lives = loseLife(lives, action.at);
          effects.push(fx.sound('lifeLost'));
        }
        // У ошибки нет звука. Правило Р1.
      } else {
        effects.push(fx.sound('correct'), fx.haptic('correct'));
        if (comboAfter >= 3) effects.push(fx.sound('combo', comboAfter));
      }

      const econ = { ...state.econ, xpTotal: state.econ.xpTotal + xp };
      const levelBefore = levelForXp(state.econ.xpTotal);
      const levelAfter = levelForXp(econ.xpTotal);
      if (levelAfter > levelBefore) {
        econ.gems += GEMS.levelUp;
        effects.push(fx.sound('levelUp'), fx.confetti({ count: 70 }));
      }

      const days = { ...state.days };
      const d = { ...(days[day] || emptyDay()) };
      d.answered++;
      /* Дневная цель считает ЗАТРОНУТЫЕ слова, а не только новые.
         Новые слова кончаются примерно на двенадцатый день, и цель
         становилась недостижимой навсегда ровно в тот момент, когда
         складывается привычка. */
      d.touched = (d.touched || 0) + 1;
      if (correct || typoOnly) d.correct++;
      if (attempt <= 1 && (correct || typoOnly)) d.firstTry++;
      d.xp += xp;
      days[day] = d;

      return {
        state: { ...state, srs, econ, lives, days, profile: { ...state.profile, level: levelAfter } },
        effects: [...effects, fx.save()],
      };
    }

    case 'SESSION_FINISHED': {
      const day = state.day;
      const { mode, completed, mistakes, newWords, ms, isReview, newRecord: rec } = action;
      const days = { ...state.days };
      const d = { ...(days[day] || emptyDay()) };
      d.sessions++;
      // Отметка режима: связка дня чередует их по давности.
      const lastModes = { ...(state.lastModes || {}), [mode]: day };
      d.ms += ms;
      d.words += newWords;
      days[day] = d;

      const bonus = sessionBonusXp({
        mode, completed, mistakes, sessionsToday: d.sessions, isReview, newRecord: rec,
      });
      const econ = { ...state.econ, xpTotal: state.econ.xpTotal + bonus };

      const effects = [fx.sound('sessionDone')];
      let streak = state.streak;

      if (completed) {
        const res = completeDay(state.streak, day);
        streak = res.streak;
        for (const e of res.events) {
          if (e.type === 'freezeEarned') effects.push(fx.toast('Заморозка получена. Ритм под защитой.', 'info'));
        }
        const ms2 = milestoneFor(streak.current);
        if (ms2) {
          econ.gems += ms2.gems;
          streak = { ...streak, freezes: Math.min(2, streak.freezes + ms2.freezes) };
          effects.push(fx.sound('medal'), fx.confetti({ count: 90 }));
        }
      }

      // Дневная цель измеряется в словах: новые плюс повторённые.
      const goal = state.settings.dailyGoalWords || 10;
      const wordsToday = (d.words || 0) + Math.floor((d.touched || 0) / 2);
      if (wordsToday >= goal && !d.goalPaid) {
        d.goalPaid = true;
        econ.gems += GEMS.dailyGoal;
        effects.push(fx.sound('gems', 5));
      }

      /* Медали выдаются здесь, а не при заходе в профиль. Раньше человек,
         который не открывал профиль, не получал ни одной медали и ни одного
         алмаза за них. */
      const counters = medalCounters({ ...state, days, streak });
      const fresh = evaluateMedals(counters, state.medals);
      const medals = { ...state.medals };
      for (const m of fresh) {
        medals[m.id] = day;
        econ.gems += m.gems;
        effects.push(fx.toast(`Медаль: ${m.name} · +${m.gems} 💎`, 'info'));
      }
      if (fresh.length) effects.push(fx.sound('medal'), fx.confetti({ count: 70 }));

      const level = levelForXp(econ.xpTotal);
      return {
        state: { ...state, days, econ, streak, medals, lastModes,
                 profile: { ...state.profile, level },
                 lastMedals: fresh.map(m => m.id) },
        effects: [...effects, fx.save()],
      };
    }

    case 'REFERRAL_INIT': {
      const r = { ...state.referral };
      let changed = false;
      if (!r.selfCode) { r.selfCode = makeSelfCode(); changed = true; }
      if (action.ref && !r.invitedBy && action.ref !== r.selfCode) { r.invitedBy = action.ref; changed = true; }
      if (!changed) return { state, effects: [] };
      return { state: { ...state, referral: r }, effects: [fx.save()] };
    }

    /* Бонус новичку выдаётся за первое ЗАВЕРШЁННОЕ занятие,
       а не за установку: иначе это приглашение к накрутке. */
    case 'REFERRAL_NEWCOMER_PAID': {
      const r = state.referral;
      if (!r.invitedBy || r.newcomerPaid) return { state, effects: [] };
      return {
        state: {
          ...state,
          referral: { ...r, newcomerPaid: true },
          econ: { ...state.econ, gems: state.econ.gems + NEWCOMER_GEMS },
        },
        effects: [fx.sound('gems', 5), fx.toast(`Бонус за приглашение: +${NEWCOMER_GEMS} алмазов`, 'info'), fx.save()],
      };
    }

    case 'REFERRAL_CONFIRM': {
      const r = state.referral;
      const res = verifyProof(r.selfCode, action.proof, r.friends);
      if (!res.ok) return { state, effects: [fx.toast(res.reason, 'warn')] };
      const nth = r.friends.length + 1;
      const gems = rewardFor(nth);
      return {
        state: {
          ...state,
          referral: { ...r, friends: [...r.friends, res.friendCode] },
          econ: { ...state.econ, gems: state.econ.gems + gems },
        },
        effects: [
          fx.sound('medal'), fx.confetti({ count: 90 }),
          fx.toast(`Друг зачтён. +${gems} алмазов`, 'info'), fx.save(),
        ],
      };
    }

    case 'CHALLENGE_VOTE':
      return {
        state: { ...state, challenge: applyVote(state.challenge, action.vote, state.day) },
        effects: [fx.save()],
      };

    case 'CHALLENGE_AUTO':
      return {
        state: { ...state, challenge: autoAdjust(state.challenge, action.stats, state.day) },
        effects: [fx.save()],
      };

    case 'CHALLENGE_SET':
      return {
        state: { ...state, challenge: setManual(state.challenge, clampIndex(action.index), state.day) },
        effects: [fx.save()],
      };

    case 'SETTINGS_SET': {
      const settings = { ...state.settings, ...action.patch };
      return { state: { ...state, settings }, effects: [{ type: 'settings' }, fx.save()] };
    }

    case 'PROFILE_SET':
      return {
        state: { ...state, profile: { ...state.profile, ...action.patch } },
        effects: [fx.save()],
      };

    case 'ONBOARDED':
      return {
        state: {
          ...state,
          flags: { ...state.flags, onboarded: true },
          baseline: action.baseline || null,
        },
        effects: [fx.save()],
      };

    case 'RULE_READ':
      return {
        state: { ...state, rulesRead: { ...state.rulesRead, [action.id]: state.day } },
        effects: [fx.save()],
      };

    default:
      return { state, effects: [] };
  }
}

function emptyDay() {
  return { ms: 0, xp: 0, words: 0, touched: 0, sessions: 0, correct: 0, answered: 0, firstTry: 0, goalPaid: false };
}

/** Счётчики для медалей. Считаются из состояния, ничего не выдумывают. */
export function medalCounters(state) {
  let answersCorrect = 0, corrected = 0, known = 0;
  for (const deck of ['deck1', 'deck2']) {
    for (const rec of Object.values(state.srs[deck] || {})) {
      answersCorrect += rec.ok || 0;
      corrected += Math.min(rec.ok || 0, rec.fail || 0);
      if (isKnown(rec)) known++;
    }
  }
  const days = Object.values(state.days || {});
  return {
    answersCorrect, corrected, known,
    sessions: days.reduce((a, d) => a + (d.sessions || 0), 0),
    cleanSessions: days.filter(d => d.answered > 0 && d.answered === d.correct).length,
    streakBest: state.streak.best || 0,
    weekBest: weekDone(state.days || {}, state.day),
    trapsKnown: 0,
    friends: (state.referral?.friends || []).length,
    returnedAfter: state.flags?.returnedAfter || 0,
  };
}

/* ── производные величины для экранов ──────────────────────────── */

export function countKnown(state) {
  let known = 0, learning = 0;
  for (const deck of ['deck1', 'deck2']) {
    for (const rec of Object.values(state.srs[deck] || {})) {
      if (isKnown(rec)) known++;
      else if (isLearning(rec)) learning++;
    }
  }
  return { known, learning };
}

export function levelInfo(state) {
  return levelProgress(state.econ.xpTotal);
}
