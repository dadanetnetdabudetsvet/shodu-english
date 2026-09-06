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

click(btn('Начать'));
await sleep(200);
step('шаг проверки: ' + (root.querySelector('.qcard')?.textContent.slice(0, 40) || '—'));

for (let i = 0; i < 12; i++) {
  const opts = root.querySelectorAll('.option');
  if (!opts.length) break;
  click(opts[0]);
  await sleep(1300);
}
step('после десяти ответов: ' + (root.querySelector('h1')?.textContent || root.textContent.slice(0, 40)));

let next = btn('Дальше');
if (next) { click(next); await sleep(200); }
const done = btn('Готово');
if (!done) fail('нет кнопки завершения онбординга');
else { click(done); await sleep(400); }

step('онбординг завершён, флаг: ' + store.state.flags.onboarded);
step('очков после аванса: ' + store.state.econ.xpTotal);

/* ── главный экран ─────────────────────────────────────────── */
console.log('\nГЛАВНЫЙ ЭКРАН');
window.location.hash = '#/home';
await sleep(400);
if (!root.querySelector('.card--hero')) fail('нет главной карточки');
else step('главная отрисована: ' + root.querySelector('h1')?.textContent);

/* ── занятие ───────────────────────────────────────────────── */
console.log('\nЗАНЯТИЕ');
window.location.hash = '#/session/build';
await sleep(500);
if (!root.querySelector('.session')) fail('экран занятия не смонтирован');
else step('занятие открыто');

let answered = 0;
for (let i = 0; i < 40; i++) {
  const know = btn('Знаю') || btn('Понял, не перепутаю');
  if (know) { click(know); await sleep(120); continue; }
  const opts = root.querySelectorAll('.option');
  if (opts.length && !opts[0].disabled && opts[0].tagName === 'BUTTON') {
    click(opts[0]); answered++; await sleep(120);
    const nx = btn('Дальше'); if (nx) { click(nx); await sleep(120); }
    continue;
  }
  const check = btn('Проверить');
  if (check) {
    const input = root.querySelector('input[type="text"]');
    if (input) { input.value = 'zzz'; }
    click(check); await sleep(120);
    const nx = btn('Дальше'); if (nx) { click(nx); await sleep(120); }
    continue;
  }
  if (root.querySelector('.results')) break;
  break;
}
step('отвечено заданий: ' + answered);

if (!root.querySelector('.results')) {
  const close = root.querySelector('.session__close');
  if (close) { click(close); await sleep(400); }
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
for (const [route, marker] of [['words', 'Слова'], ['rules', 'Правила'], ['profile', 'Уровень']]) {
  window.location.hash = '#/' + route;
  await sleep(400);
  const txt = root.textContent;
  if (!txt.includes(marker)) fail(`экран ${route} не содержит «${marker}»`);
  else step(`${route}: ок (${root.querySelectorAll('.card').length} карточек)`);
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
if (!root.textContent.includes('Друзья')) fail('в профиле нет блока друзей');
else step('блок друзей в профиле отрисован');

console.log('\n' + (errors.length ? `ОШИБОК: ${errors.length}\n` + errors.slice(0, 12).join('\n') : 'ОШИБОК НЕТ'));
process.exit(errors.length ? 1 : 0);
