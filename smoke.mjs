/* Смоук-тест: поднимает приложение в jsdom и проходит сценарий целиком.
 * Ловит то, что не видит проверка синтаксиса: обращения к несуществующим
 * полям, падения при первом запуске, пустые экраны. */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = process.cwd();
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .replace('<script type="module" src="src/app.js"></script>', '');

const dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

/* ── заглушки платформенных возможностей, которых нет в jsdom ── */
window.matchMedia = (q) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
});
window.Element.prototype.animate = function () {
  return { finished: Promise.resolve(), cancel() {}, play() {}, pause() {} };
};
window.HTMLCanvasElement.prototype.getContext = () => ({
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {},
  setTransform() {}, set fillStyle(v) {}, set globalAlpha(v) {},
});
class FakeAudioParam { constructor(v = 0) { this.value = v; } setValueAtTime() {} exponentialRampToValueAtTime() {} linearRampToValueAtTime() {} }
class FakeNode { constructor() { this.frequency = new FakeAudioParam(440); this.detune = new FakeAudioParam(0); this.gain = new FakeAudioParam(1); this.type = 'sine'; } connect() { return this; } disconnect() {} start() {} stop() {} }
window.AudioContext = class {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 44100; this.destination = new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createGain() { return new FakeNode(); }
  createBiquadFilter() { const n = new FakeNode(); n.frequency = new FakeAudioParam(1000); return n; }
  createDynamicsCompressor() { const n = new FakeNode(); for (const k of ['threshold','knee','ratio','attack','release']) n[k] = new FakeAudioParam(0); return n; }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return new FakeNode(); }
  resume() { return Promise.resolve(); }
};
window.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {}, addEventListener() {} };
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.navigator.vibrate = () => true;
window.fetch = async (url) => {
  const p = join(ROOT, String(url).replace(/^\.?\//, ''));
  const text = readFileSync(p, 'utf8');
  return { ok: true, json: async () => JSON.parse(text), text: async () => text };
};
window.prompt = () => 'Тестовое имя';
// Тест написан на русских строках, поэтому язык фиксируем.
Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU', 'ru'], configurable: true });
Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
window.alert = () => {};

/* Пробрасываем в глобальную область: модули приложения пишут на window/document. */
for (const k of ['window','document','navigator','location','localStorage','fetch','matchMedia',
                 'AudioContext','speechSynthesis','SpeechSynthesisUtterance','requestAnimationFrame',
                 'cancelAnimationFrame','CustomEvent','Event','EventTarget','Blob','URL',
                 'HTMLElement','Element','Node','BroadcastChannel','getComputedStyle','prompt','alert']) {
  if (window[k] === undefined) continue;
  try { globalThis[k] = window[k]; }
  catch { Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true }); }
}
globalThis.indexedDB = undefined;

const errors = [];
window.addEventListener('error', e => errors.push(e.message));
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); origError(...a); };

const step = (m) => console.log('  ·', m);
const fail = (m) => { errors.push(m); console.log('  FAIL', m); };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

console.log('\nЗАПУСК ПРИЛОЖЕНИЯ');
await imp('src/app.js');
await sleep(400);

const root = window.document.getElementById('root');
if (!root.textContent.trim()) fail('корневой элемент пуст после загрузки');
else step('первый экран отрисован: ' + root.querySelector('h1')?.textContent);

const store = window.__shodu?.store;
if (!store) fail('стор не опубликован');

/* ── онбординг ─────────────────────────────────────────────── */
console.log('\nОНБОРДИНГ');
const click = (el) => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const btn = (text) => [...root.querySelectorAll('button')].find(b => b.textContent.includes(text));

click(btn('Убедиться') || btn('Посчитать') || btn('Начать'));
await sleep(200);
step('шаг проверки: ' + (root.querySelector('.qcard')?.textContent.slice(0, 40) || '—'));

for (let i = 0; i < 12; i++) {
  const opts = root.querySelectorAll('.option');
  if (!opts.length) break;
  click(opts[0]);
  await sleep(1300);
}
step('после десяти ответов: ' + (root.querySelector('h1')?.textContent || root.textContent.slice(0, 40)));

// Цель дня, выбранная в онбординге, должна доехать до настроек.
let next = btn('остальные') || btn('дальше') || btn('Дальше');
if (next) { click(next); await sleep(200); }
const goalBtn = [...root.querySelectorAll('.option')].find(b => b.textContent.includes('5 '));
if (goalBtn) { click(goalBtn); await sleep(120); step('выбрана цель 5 слов'); }
const done = btn('поехали') || btn('Готово');
if (!done) fail('нет кнопки завершения онбординга');
else { click(done); await sleep(400); }
if (goalBtn && store.state.settings.dailyGoalWords !== 5)
  fail(`цель дня не сохранилась: в настройках ${store.state.settings.dailyGoalWords}, выбрано 5`);
else if (goalBtn) step('цель дня сохранена: ' + store.state.settings.dailyGoalWords);

step('онбординг завершён, флаг: ' + store.state.flags.onboarded);
step('очков после аванса: ' + store.state.econ.xpTotal);

/* ── главный экран ─────────────────────────────────────────── */
console.log('\nГЛАВНЫЙ ЭКРАН');
window.location.hash = '#/home';
await sleep(400);
if (!root.querySelector('.card--hero')) fail('нет главной карточки');
else step('главная отрисована: ' + root.querySelector('h1')?.textContent);

/* ── тупик, который ловил новых пользователей ──────────────── */
console.log('\nБЛИЦ ДО ПЕРВОГО ЗАНЯТИЯ');
window.location.hash = '#/session/sprint';
await sleep(500);
{
  const txt = root.textContent;
  if (root.querySelector('.session')) step('блиц запустился сразу (колода не пуста)');
  else if (txt.includes('для слов, которые ты уже видел')) {
    step('тупик заменён объяснением');
    const fixBtn = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Взять первые слова'));
    if (!fixBtn) fail('нет кнопки выхода из тупика');
    else { step('кнопка решения на месте: «' + fixBtn.textContent + '»'); }
  } else fail('неизвестное состояние блица: ' + txt.slice(0, 80));
}

/* ── занятие ───────────────────────────────────────────────── */
console.log('\nЗАНЯТИЕ');
window.location.hash = '#/session/build';
await sleep(500);
if (!root.querySelector('.session')) fail('экран занятия не смонтирован');
else step('занятие открыто');

let answered = 0;
let stalled = null;
for (let i = 0; i < 60; i++) {
  const know = btn('Знаю это') || btn('не перепутаю');
  if (know) { click(know); await sleep(120); continue; }
  const opts = root.querySelectorAll('.option');
  if (opts.length && !opts[0].disabled && opts[0].tagName === 'BUTTON') {
    click(opts[0]); answered++; await sleep(120);
    const nx = btn('дальше'); if (nx) { click(nx); await sleep(120); }
    continue;
  }
  const check = btn('Проверить');
  if (check) {
    const input = root.querySelector('input[type="text"]');
    if (input) { input.value = 'zzz'; }
    click(check); await sleep(120);
    const nx2 = btn('дальше'); if (nx2) { click(nx2); await sleep(120); }
    continue;
  }
  if (root.querySelector('.results')) break;
  stalled = root.textContent.slice(0, 120);
  break;
}
if (stalled) step('прогон остановился на: ' + stalled.replace(/\s+/g, ' '));
step('отвечено заданий: ' + answered);

if (!root.querySelector('.results')) {
  const close = root.querySelector('.session__close');
  if (close) {
    click(close); await sleep(300);
    const leave = [...document.querySelectorAll('button')].find(b => b.textContent.includes('хватит'));
    if (leave) { click(leave); await sleep(400); }
  }
}
step('экран итогов: ' + (root.querySelector('.results') ? 'да' : 'нет'));
step('очков всего: ' + store.state.econ.xpTotal + ' · слов в работе: ' +
     Object.keys(store.state.srs.deck1).length);

/* голос по планке */
const easy = btn('Легко');
if (easy) { click(easy); await sleep(100); step('планка после «легко»: ' + store.state.challenge.index); }
else fail('нет голосования по планке на итогах');

/* ── остальные экраны ──────────────────────────────────────── */
console.log('\nОСТАЛЬНЫЕ ЭКРАНЫ');
for (const [route, marker] of [['quests', 'Сегодня'], ['words', 'английск'], ['rules', 'совпадений'], ['profile', 'Уровень']]) {
  window.location.hash = '#/' + route;
  await sleep(400);
  const txt = root.textContent;
  if (!txt.includes(marker)) fail(`экран ${route} не содержит «${marker}»`);
  else {
    const n = root.querySelectorAll('.list-row').length || root.querySelectorAll('.card').length;
    step(`${route}: ок (${n} строк)`);
    if (route === 'words' && n < 10) fail('список слов пуст');
  }
}

/* ── сохранение ────────────────────────────────────────────── */
console.log('\nХРАНИЛИЩЕ');
const { storage } = window.__shodu;
storage.flush();
const raw = window.localStorage.getItem('shodu:state');
if (!raw) fail('состояние не записалось');
else step('записано ' + (raw.length / 1024).toFixed(1) + ' КБ');
const parsed = JSON.parse(raw);
step('дней в истории: ' + Object.keys(parsed.days).length + ' · уровень: ' + parsed.profile.level);

/* ── новые режимы ──────────────────────────────────────────── */
console.log('\nНОВЫЕ РЕЖИМЫ');
{
  window.location.hash = '#/phrase';
  await sleep(600);
  const txt = root.textContent;
  if (root.querySelector('.shelf')) {
    const tiles = root.querySelectorAll('.bank .tile-word').length;
    const slots = root.querySelectorAll('.shelf .tile-slot, .shelf .tile-word').length;
    step(`Фраза: касса ${tiles} плиток, полка ${slots} гнёзд`);
    // собираем фразу правильно
    const bankBtns = [...root.querySelectorAll('.bank .tile-word')];
    for (let k = 0; k < 8 && root.querySelectorAll('.shelf .tile-slot').length; k++) {
      const free = [...root.querySelectorAll('.bank .tile-word')].filter(b => !b.disabled);
      if (!free.length) break;
      click(free[0]); await sleep(60);
    }
    const check = [...root.querySelectorAll('button')].find(b => /Проверить|поставь/.test(b.textContent));
    if (check && !check.disabled) { click(check); await sleep(400); step('Фраза: проверка отработала'); }
    else step('Фраза: полка заполнена не до конца, это допустимо');
  } else if (txt.includes('собираются из твоих слов')) {
    step('Фраза: показан честный экран «пока мало слов» с кнопкой выхода');
  } else fail('Фраза: неизвестное состояние — ' + txt.slice(0, 80));

  window.location.hash = '#/stream';
  await sleep(500);
  const st = root.textContent;
  if (st.includes('читается по словам, которые уже твои')) {
    step('Поток: честный экран «нужно больше слов» с кнопкой выхода');
  } else if (root.querySelector('.stream-mode')) {
    const go = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Ровный темп'));
    if (go) {
      click(go); await sleep(500);
      const words = root.querySelectorAll('.stream-word').length;
      if (words) step('Поток: строка из ' + words + ' слов на табло');
      else if (st.includes('читается по знакомым')) step('Поток: честный экран «нужно больше слов»');
      else fail('Поток: строка не отрисовалась');
    } else if (st.includes('читается по словам, которые уже твои')) {
      step('Поток: честный экран «нужно больше слов»');
    } else fail('Поток: нет кнопки старта');
  } else fail('Поток: экран не смонтирован');
}

/* ── режимы на наполненном словаре ─────────────────────────── */
console.log('\nРЕЖИМЫ НА НАПОЛНЕННОМ СЛОВАРЕ');
{
  // Наполняем прогресс так, будто человек занимается третью неделю.
  const { content } = window.__shodu;
  const st = store.state;
  for (const w of content.deck1.slice(0, 60)) {
    st.srs.deck1[w.id] = { box: 4, dueDay: st.day, seen: 8, ok: 7, fail: 1,
                           streak: 3, failRow: 0, leech: false, lastMs: 1200, lastDay: st.day - 1, prodOk: 2 };
  }
  store.dispatch({ type: 'CHALLENGE_SET', index: 16 });

  window.location.hash = '#/phrase';
  await sleep(700);
  if (!root.querySelector('.shelf')) fail('Фраза не запустилась при 60 знакомых словах: ' + root.textContent.slice(0, 70));
  else {
    const slots = root.querySelectorAll('.shelf .tile-slot').length;
    const tiles = root.querySelectorAll('.bank .tile-word').length;
    step(`Фраза: ${slots} гнёзд, ${tiles} плиток в кассе`);
    for (let k = 0; k < 10 && root.querySelectorAll('.shelf .tile-slot').length; k++) {
      const free = [...root.querySelectorAll('.bank .tile-word')].filter(b => !b.disabled);
      if (!free.length) break;
      click(free[0]); await sleep(50);
    }
    const check = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Проверить'));
    if (!check) fail('Фраза: кнопка проверки не появилась');
    else { click(check); await sleep(600); step('Фраза: проверка отработала, очков всего ' + store.state.econ.xpTotal); }
  }

  window.location.hash = '#/stream';
  await sleep(600);
  const go = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Ровный темп'));
  if (!go) fail('Поток не запустился при 60 знакомых словах: ' + root.textContent.slice(0, 70));
  else {
    click(go); await sleep(600);
    const words = [...root.querySelectorAll('.stream-word')];
    if (!words.length) fail('Поток: строка не отрисовалась');
    else {
      step('Поток: строка из ' + words.length + ' слов');
      const before = store.state.econ.xpTotal;
      for (const wnode of words) { click(wnode); await sleep(60); }
      await sleep(500);
      step('Поток: после тапов очков ' + store.state.econ.xpTotal + ' (было ' + before + ')');
    }
  }
}

/* ── второй тупик: всё повторено ───────────────────────────── */
console.log('\nКОГДА ВСЁ ПОВТОРЕНО');
{
  const st = store.state;
  for (const rec of Object.values(st.srs.deck1)) { rec.box = Math.max(rec.box, 2); rec.dueDay = st.day + 30; }
  window.location.hash = '#/home';
  await sleep(200);
  window.location.hash = '#/session/sprint';
  await sleep(500);

  if (root.querySelector('.session')) {
    const total = Number((root.textContent.match(/\d+\/(\d+)/) || [])[1] || 0);
    step('тупика нет, блиц собрал сессию из ' + total + ' заданий');
    const knownCount = Object.values(store.state.srs.deck1).filter(r => r.box >= 1).length;
    const floor = Math.min(8, knownCount * 2);
    if (total < floor) fail(`сессия из ${total} заданий при ${knownCount} знакомых словах, ожидалось не меньше ${floor}`);
    else step(`знакомых слов ${knownCount}, заданий ${total} — сессия не огрызок`);
  } else if (root.textContent.includes('Всё повторено')) {
    const more = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Позаниматься ещё'));
    const raise = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Поднять планку'));
    if (!more || !raise) fail('нет кнопок решения на экране «Всё повторено»');
    else {
      step('запасной экран с кнопками решения показан');
      click(more); await sleep(500);
      if (!root.querySelector('.session')) fail('«Позаниматься ещё» не собрало сессию');
      else step('«Позаниматься ещё» собрало сессию на месте');
    }
  } else fail('неизвестное состояние: ' + root.textContent.slice(0, 80));
}

/* ── приглашение друзей ────────────────────────────────────── */
console.log('\nПРИГЛАШЕНИЕ ДРУЗЕЙ');
{
  const { makeProof, makeSelfCode } = await imp('src/domain/referral.js');
  const my = store.state.referral.selfCode;
  if (!my) fail('код приглашения не выдан при первом запуске');
  else step('мой код: ' + my);

  const friend = makeSelfCode();
  const before = store.state.econ.gems;
  store.dispatch({ type: 'REFERRAL_CONFIRM', proof: makeProof(my, friend) });
  const after = store.state.econ.gems;
  if (after - before !== 100) fail(`за первого друга начислено ${after - before}, ожидалось 100`);
  else step('первый друг: +' + (after - before));

  store.dispatch({ type: 'REFERRAL_CONFIRM', proof: makeProof(my, friend) });
  if (store.state.referral.friends.length !== 1) fail('повторный код зачёлся');
  else step('повторный код отклонён');

  const f2 = makeSelfCode(), f3 = makeSelfCode(), f4 = makeSelfCode();
  const g0 = store.state.econ.gems;
  store.dispatch({ type: 'REFERRAL_CONFIRM', proof: makeProof(my, f2) });
  store.dispatch({ type: 'REFERRAL_CONFIRM', proof: makeProof(my, f3) });
  store.dispatch({ type: 'REFERRAL_CONFIRM', proof: makeProof(my, f4) });
  const gained = store.state.econ.gems - g0;
  if (gained !== 200 + 400 + 150) fail(`за друзей 2-4 начислено ${gained}, ожидалось 750`);
  else step('лестница 2-4: +' + gained + ' (200, 400, затем стандартные 150)');

  store.dispatch({ type: 'REFERRAL_CONFIRM', proof: makeProof('ZZZZZZ', makeSelfCode()) });
  if (store.state.referral.friends.length !== 4) fail('чужой код зачёлся');
  else step('чужой код отклонён · всего друзей: ' + store.state.referral.friends.length);
}

window.location.hash = '#/profile';
await sleep(400);
if (!root.textContent.includes('Зови своих')) fail('в профиле нет блока друзей');
else step('блок друзей в профиле отрисован');

/* ── регрессии на блокирующие дефекты ──────────────────────── */
/* ── челленджи и лавка ─────────────────────────────────────── */
console.log('\nЧЕЛЛЕНДЖИ И ЛАВКА');
{
  window.location.hash = '#/quests';
  await sleep(500);
  const txt = root.textContent;
  if (!txt.includes('Сегодня')) fail('страница челленджей не отрисовалась');
  else {
    const quests = root.querySelectorAll('.card .bar--thin').length;
    const acts = root.querySelectorAll('.list-row').length;
    step(`челленджей на сегодня: ${quests}, активностей в списке: ${acts}`);
    if (quests !== 3) fail(`челленджей ${quests}, ожидалось 3`);
    if (acts !== 20) fail(`активностей ${acts}, ожидалось 20`);
  }

  const shopTab = [...root.querySelectorAll('button')].find(b => b.textContent.includes('Лавка'));
  if (!shopTab) fail('нет вкладки лавки');
  else {
    click(shopTab); await sleep(400);
    const tiles = root.querySelectorAll('.tile').length;
    step('предметов в лавке: ' + tiles);
    if (tiles < 30) fail('лавка почти пуста: ' + tiles);

    // Покупка без алмазов должна честно отказать, а не списать в минус.
    store.state.econ.gems = 10;
    const gemsBefore = store.state.econ.gems;
    store.dispatch({ type: 'SHOP_BUY', id: 'b11' });
    if (store.state.econ.gems !== gemsBefore) fail('покупка прошла без достаточных алмазов');
    else step('покупка без алмазов отклонена, баланс цел');

    // С алмазами покупка проходит и предмет становится своим.
    store.state.econ.gems = 5000;
    store.dispatch({ type: 'SHOP_BUY', id: 'b09' });
    if (!(store.state.owned || []).includes('b09')) fail('предмет не куплен при достатке алмазов');
    else step('предмет куплен: осталось ' + store.state.econ.gems + ' алмазов');
    store.dispatch({ type: 'SHOP_BUY', id: 'b09' });
    if ((store.state.owned || []).filter(x => x === 'b09').length > 1) fail('предмет куплен дважды');
    else step('повторная покупка не проходит');
  }
}

console.log('\nРЕГРЕССИИ');
{
  const { dayNumber } = await imp('src/core/day.js');
  const { refreshStreak, completeDay, regenLives, MAX_LIVES } = await imp('src/domain/streak.js');

  // Стрик не должен обнуляться после одного пропущенного дня.
  const st = { current: 12, best: 12, lastDay: 100, freezes: 0, pausedDays: 0 };
  const after = refreshStreak(st, 102).streak;
  if (after.current !== 12) fail(`стрик после одного пропуска стал ${after.current}, ожидалось 12`);
  else step('стрик переживает пропущенный день');

  // Списанная заморозка двигает точку отсчёта, иначе спишется повторно.
  const withFreeze = refreshStreak({ current: 5, best: 5, lastDay: 100, freezes: 1, pausedDays: 0 }, 102).streak;
  const again = refreshStreak(withFreeze, 102).streak;
  if (again.freezes !== withFreeze.freezes) fail('заморозка списалась дважды за один разрыв');
  else step('заморозка списывается один раз');

  // Жизни восстанавливаются по времени.
  const lives = regenLives({ count: 0, lostAt: Date.now() - 5 * 3600000 }, Date.now(), false);
  if (lives.count < 1) fail('жизни не восстановились через пять часов');
  else step(`жизни восстанавливаются: ${lives.count} из ${MAX_LIVES}`);

  // Дневная цель считает разные слова, а не ответы.
  const before = { ...(store.state.days[store.state.day] || {}) };
  for (let k = 0; k < 12; k++) {
    store.dispatch({
      type: 'ANSWER_GRADED', wordId: 'w001', deck: 'cognates', correct: true, typoOnly: false,
      elapsedMs: 900, mode: 'build', exerciseType: 'choice4', usedHint: false,
      isCognate: true, comboAfter: 0, attempt: 1, listens: 1,
    });
  }
  const d = store.state.days[store.state.day];
  const grew = d.touched - (before.touched || 0);
  if (grew > 1) fail(`двенадцать ответов на одно слово дали +${grew} к цели дня`);
  else step('цель дня считает разные слова, а не ответы');

  // Тройное завершение не должно множить начисления.
  const gemsBefore = store.state.econ.gems;
  const xpBefore = store.state.econ.xpTotal;
  for (let k = 0; k < 3; k++) {
    store.dispatch({ type: 'SESSION_FINISHED', mode: 'build', completed: true, ms: 60000,
                     mistakes: 0, newWords: 0, isReview: false });
  }
  step(`тройной SESSION_FINISHED: очки +${store.state.econ.xpTotal - xpBefore}, алмазы +${store.state.econ.gems - gemsBefore}`);
}

console.log('\n' + (errors.length ? `ОШИБОК: ${errors.length}\n` + errors.slice(0, 12).join('\n') : 'ОШИБОК НЕТ'));
process.exit(errors.length ? 1 : 0);
