/* Воспроизведение: приложение открыто с домашнего экрана (standalone),
   идёт вводная проверка, человек нажимает вариант. */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = process.cwd();
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .replace('<script type="module" src="src/app.js"></script>', '');
// start_url из манифеста: именно так открывается ярлык
const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on('jsdomError', (e) => jsdomErrors.push(e && (e.stack || e.message) || String(e)));
vc.on('error', (...a) => jsdomErrors.push(a.map(String).join(' ')));
const dom = new JSDOM(html, { url: 'https://example.test/index.html?src=pwa', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc });
const { window } = dom;

window.matchMedia = (q) => ({
  matches: /standalone/.test(q), media: q,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
});
Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
Object.defineProperty(window.navigator, 'languages', { value: ['ru-RU','ru'], configurable: true });
Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
window.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, play() {}, pause() {} }; };
window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect(){}, save(){}, restore(){}, translate(){}, rotate(){}, fillRect(){}, setTransform(){} });
class P { constructor(v=0){this.value=v;} setValueAtTime(){} exponentialRampToValueAtTime(){} linearRampToValueAtTime(){} }
class N { constructor(){ this.frequency=new P(440); this.detune=new P(0); this.gain=new P(1); this.type='sine'; } connect(){return this;} disconnect(){} start(){} stop(){} }
window.AudioContext = class { constructor(){ this.state='running'; this.currentTime=0; this.sampleRate=44100; this.destination=new N(); }
  createOscillator(){return new N();} createGain(){return new N();}
  createBiquadFilter(){const n=new N(); n.frequency=new P(1000); return n;}
  createDynamicsCompressor(){const n=new N(); for(const k of ['threshold','knee','ratio','attack','release']) n[k]=new P(0); return n;}
  createBuffer(c,l){return {getChannelData:()=>new Float32Array(l)};} createBufferSource(){return new N();}
  resume(){return Promise.resolve();} };
window.speechSynthesis = { getVoices: () => [], speak(){}, cancel(){}, addEventListener(){} };
window.SpeechSynthesisUtterance = class { constructor(t){this.text=t;} };
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.fetch = async (url) => {
  const p = join(ROOT, String(url).replace(/^\.?\//, ''));
  const text = readFileSync(p, 'utf8');
  return { ok: true, json: async () => JSON.parse(text), text: async () => text };
};
for (const k of ['window','document','location','localStorage','fetch','matchMedia','AudioContext',
                 'speechSynthesis','SpeechSynthesisUtterance','requestAnimationFrame','cancelAnimationFrame',
                 'CustomEvent','Event','EventTarget','Blob','URL','HTMLElement','Element','Node',
                 'BroadcastChannel','getComputedStyle','FileReader']) {
  if (window[k] === undefined) continue;
  try { globalThis[k] = window[k]; }
  catch { Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true }); }
}
try { globalThis.navigator = window.navigator; } catch {}

window.prompt = () => '';
window.alert = () => {};
const errors = [];
window.addEventListener('error', e => errors.push('window.onerror: ' + e.message));
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };
process.on('unhandledRejection', (r) => errors.push('unhandledRejection: ' + r));

const sleep = ms => new Promise(r => setTimeout(r, ms));
await import(pathToFileURL(join(ROOT, 'src/app.js')).href);
await sleep(500);

const root = window.document.getElementById('root');
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const store = window.__shodu && window.__shodu.store;

/* Пропускаем вводную проверку: интересуют экраны после неё. */
if (store) {
  store.state.flags.onboarded = true;
  store.state.profile.name = 'Аня';
  store.state.econ.gems = 900;
  store.state.day = 12;
  store.state.createdDay = 1;
  // немного прогресса, чтобы карточки со словами вообще появились
  // немного выученных слов: без них ни героя, ни карточки-доказательства
  const seed = process.env.EMPTY ? [] : Array.from({ length: 60 }, (_, i) => 'w' + String(i + 1).padStart(3, '0'));
  for (const [i, id] of seed.entries()) {
    store.state.srs.deck1[id] = { box: 3 + (i % 3), ok: 4, bad: 0, streak: 4, lastDay: 10 - (i % 5), due: 13 };
  }
  const ids = Object.keys(store.state.srs.deck1);
  store.state.days[12] = { ms: 90000, xp: 40, words: 6, touched: 6, sessions: 2 };
  store.state.streak = { current: 4, best: 6, lastDay: 12, freezes: 1, pausedDays: 0 };
}

const ROUTES = ['home', 'today', 'words', 'rules', 'quests', 'profile', 'install'];
const problems = [];

for (const r of ROUTES) {
  errors.length = 0; jsdomErrors.length = 0;
  window.location.hash = '#/' + r;
  window.dispatchEvent(new window.Event('hashchange'));
  await sleep(450);
  const text = root.textContent.replace(/\s+/g, ' ').trim();
  const bad = [...errors, ...jsdomErrors];
  const nulls = text.includes('null') || text.includes('undefined');
  console.log(
    (bad.length || nulls ? '  ПЛОХО ' : '  ок    ') + r.padEnd(9),
    '| узлов:', String(root.querySelectorAll('*').length).padStart(4),
    '| текста:', String(text.length).padStart(5),
    nulls ? '| ЕСТЬ null/undefined В ТЕКСТЕ' : '');
  if (bad.length) { problems.push(r + ': ' + bad.join(' | ').slice(0, 400)); }
  if (nulls) {
    problems.push(r + ': в тексте null/undefined');
    const i = Math.max(text.indexOf('null'), text.indexOf('undefined'));
    console.log('      вокруг:', JSON.stringify(text.slice(Math.max(0, i - 90), i + 60)));
  }
  if (r === 'home') console.log('      текст home:', JSON.stringify(text.slice(0, 200)));
}

/* Открываем лист правила: он рисуется поверх и в обход экрана. */
errors.length = 0; jsdomErrors.length = 0;
window.location.hash = '#/rules';
window.dispatchEvent(new window.Event('hashchange'));
await sleep(400);
const ruleBtn = root.querySelector('.rule');
if (ruleBtn) {
  click(ruleBtn);
  await sleep(300);
  const sheet = window.document.querySelector('.rsheet');
  console.log(sheet ? '  ок     лист правила открылся, узлов: ' + sheet.querySelectorAll('*').length
                    : '  ПЛОХО  лист правила не открылся');
  if (!sheet) problems.push('лист правила не открылся');
  const closeBtn = sheet && sheet.querySelector('.rsheet__x');
  if (closeBtn) { click(closeBtn); await sleep(200); }
  if (window.document.querySelector('.rsheet')) problems.push('лист правила не закрылся');
} else problems.push('карточек правил нет');

/* Карточка премиума: должна быть и в профиле, и в лавке. */
window.location.hash = '#/profile';
window.dispatchEvent(new window.Event('hashchange'));
await sleep(400);
const prem = root.querySelector('.prem');
console.log(prem ? '  ок     карточка «Сходу Всё» в профиле: ' + prem.querySelector('.prem__price-old').textContent
                 : '  ПЛОХО  карточки «Сходу Всё» в профиле нет');
if (!prem) problems.push('нет карточки премиума в профиле');
console.log('  слотов под друзей:', root.querySelectorAll('.prem__slot').length);

/* Множественный выбор подборок. */
const setcards = [...root.querySelectorAll('.setcard')];
console.log('  плиток подборок:', setcards.length);
if (setcards.length >= 3) {
  click(setcards[1]); await sleep(250);
  const a = (store.state.settings.wordSet || {}).themes || [];
  const cards2 = [...root.querySelectorAll('.setcard')];
  click(cards2[2]); await sleep(250);
  const b = (store.state.settings.wordSet || {}).themes || [];
  const cards3 = [...root.querySelectorAll('.setcard')];
  click(cards3[1]); await sleep(250);
  const c = (store.state.settings.wordSet || {}).themes || [];
  console.log('  выбор подборок:', JSON.stringify(a), '→', JSON.stringify(b), '→', JSON.stringify(c));
  if (b.length !== 2) problems.push('вторая подборка не добавилась: ' + JSON.stringify(b));
  if (c.length !== 1) problems.push('повторное нажатие не сняло подборку: ' + JSON.stringify(c));
}

/* ── «Сходу Всё»: три друга открывают всё ─────────────────────── */
const { makeProof } = await import(pathToFileURL(join(ROOT, 'src/domain/referral.js')).href);
const { isActive, sizeBounds } = await import(pathToFileURL(join(ROOT, 'src/domain/premium.js')).href);
const { isOwned, SECTIONS } = await import(pathToFileURL(join(ROOT, 'src/domain/shop.js')).href);

/* Страница установки в обычном браузере: в standalone она показывает
   короткую ветку «уже стоит» и её оформление не проверить. */
Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true });
const notStandalone = (q) => ({ matches: false, media: q,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.matchMedia = notStandalone;
globalThis.matchMedia = notStandalone;
// ?src=pwa тоже считается установкой: убираем его
window.history.replaceState(null, '', '/index.html');
window.location.hash = '#/install';
window.dispatchEvent(new window.Event('hashchange'));
await sleep(450);
const mock = root.querySelector('.hm__screen');
const steps = root.querySelectorAll('.inst-step');
const pings = root.querySelectorAll('.step__ping');
const gains = root.querySelectorAll('.inst-gain');
console.log('');
console.log('УСТАНОВКА (обычный браузер)');
console.log('  макет домашнего экрана:', mock ? 'есть, иконок ' + root.querySelectorAll('.hm__app').length : 'НЕТ');
console.log('  шагов:', steps.length, '| подсветок цели:', pings.length, '| плиток выгод:', gains.length);
if (!mock) problems.push('нет макета домашнего экрана на странице установки');
if (!steps.length) problems.push('нет шагов на странице установки');
if (steps.length && !pings.length) problems.push('шаги без подсветки цели');
for (const st of steps) {
  if (!st.querySelector('.inst-step__art, svg')) problems.push('шаг без схемы');
}
console.log('  текст:');
for (const st of steps) console.log('    ·', st.querySelector('.inst-step__text').textContent);

/* Печатаем сам текст экранов: копирайт проверяется глазами. */
if (process.env.DUMP) {
  for (const r of ['today', 'profile']) {
    window.location.hash = '#/' + r;
    window.dispatchEvent(new window.Event('hashchange'));
    await sleep(450);
    console.log('\n───── ' + r.toUpperCase() + ' ─────');
    const walk = (node, depth) => {
      for (const c of node.children) {
        const own = [...c.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
        if (own) console.log('  '.repeat(Math.min(depth, 6)) + own);
        walk(c, depth + 1);
      }
    };
    walk(root, 0);
  }
}

console.log('');
console.log('«СХОДУ ВСЁ»');
const my = store.state.referral.selfCode;
console.log('  до приглашений: активно =', isActive(store.state),
            '| длина занятия', JSON.stringify(sizeBounds(store.state)));
for (const friend of ['AAA111', 'BBB222', 'CCC333']) {
  store.dispatch({ type: 'REFERRAL_CONFIRM', proof: makeProof(my, friend) });
  await sleep(60);
}
const st = store.state;
console.log('  друзей зачтено:', st.referral.friends.length, '| активно =', isActive(st),
            '| в состоянии premium.active =', st.premium.active);
if (!isActive(st)) problems.push('трое друзей не открыли «Сходу Всё»');

const paid = SECTIONS.flatMap(x => x.items).filter(i => i.price > 0 && i.id !== 'freeze');
const lockedNow = paid.filter(i => !isOwned(st.owned, i, isActive(st)));
console.log('  платных вещей:', paid.length, '| закрытыми осталось:', lockedNow.length);
if (lockedNow.length) problems.push('гардероб не открылся целиком: ' + lockedNow.length);

const b = sizeBounds(st);
console.log('  длина занятия стала:', JSON.stringify(b));
if (b.min !== 5 || b.max !== 40) problems.push('границы длины занятия не расширились');

/* Заморозка пополняется раз в неделю сама. */
store.state.streak.freezes = 0;
store.state.premium.lastFreezeDay = st.day - 9;
const beforeF = store.state.streak.freezes;
store.dispatch({ type: 'DAY_TICK', at: new Date(Date.now() + 26 * 3600 * 1000) });
await sleep(80);
console.log('  заморозок было', beforeF, '→ стало', store.state.streak.freezes);
if (store.state.streak.freezes <= beforeF) problems.push('недельная заморозка не пришла');

/* Знак у имени и сетка полугода. */
window.location.hash = '#/profile';
window.dispatchEvent(new window.Event('hashchange'));
await sleep(400);
const badge = root.querySelector('.prem-badge');
console.log(badge ? '  знак у имени: ' + badge.textContent : '  ПЛОХО знака у имени нет');
if (!badge) problems.push('нет знака «Сходу Всё» у имени');

window.location.hash = '#/home';
window.dispatchEvent(new window.Event('hashchange'));
await sleep(400);
const weekCell = root.querySelector('.topbar__cell');
if (weekCell) { click(weekCell); await sleep(300); }
const grid = window.document.querySelector('.year__grid');
console.log(grid ? '  сетка полугода: клеток ' + grid.children.length
                 : '  ПЛОХО сетки полугода нет');
if (!grid || grid.children.length !== 182) problems.push('сетка полугода не 182 клетки');
const anySheet = window.document.querySelector('[role="dialog"]');
if (anySheet) { const c = [...anySheet.querySelectorAll('button')].pop(); if (c) click(c); }

/* Каждый язык должен собираться целиком: подстановки на месте, ни
   одного «{v0}» в готовом тексте, ни одного undefined. */
const LANGS = (process.env.LANGS || 'en,de,ja,ar,tr,uk').split(',');
/* ── сторож поломок ────────────────────────────────────────────────
   Он обязан молчать на шуме (обрыв загрузки при перезагрузке) и
   говорить на настоящей поломке. Первая версия молчать не умела и
   сообщала о беде на ровном месте. */
console.log('');
console.log('СТОРОЖ ПОЛОМОК');
/* Тост — один постоянный элемент #toast, который прячется, а не
   удаляется. Удалять его в проверке нельзя: модуль держит ссылку. */
const toastNode = window.document.getElementById('toast');
const toastText = () => (toastNode && !toastNode.hidden)
  ? toastNode.textContent.replace(/\s+/g, ' ').trim() : null;
const clearToasts = () => { if (toastNode) { toastNode.hidden = true; toastNode.replaceChildren(); } };

const NOISE = [
  ['обрыв модуля', new TypeError('Importing a module script failed.')],
  ['отмена', Object.assign(new Error('cancelled'), { name: 'AbortError' })],
  ['сеть', new TypeError('Load failed')],
];
NOISE.push(['падение не у нас', Object.assign(new TypeError('x is not a function'),
  { stack: 'TypeError\n    at http://cdn.example/thirdparty.js:1:1' })]);
for (const [label, reason] of NOISE) {
  clearToasts();
  window.dispatchEvent(Object.assign(new window.Event('unhandledrejection'), { reason }));
  await sleep(120);
  const t = toastText();
  console.log((t ? '  ПЛОХО ' : '  ок    ') + 'молчит на шуме: ' + label + (t ? ' → ' + t : ''));
  if (t) problems.push('сторож сработал на шуме: ' + label);
}

/* Настоящая поломка: исключение из НАШЕГО кода. Стек подделываем
   вручную — в проверке он указывал бы на саму проверку. */
clearToasts();
const ourError = new TypeError('u.render is not a function');
ourError.stack = 'TypeError: u.render is not a function\n    at mount (http://x/src/screens/home.js:42:9)';
window.dispatchEvent(Object.assign(new window.Event('unhandledrejection'), { reason: ourError }));
await sleep(150);
const realToast = toastText();
console.log((realToast ? '  ок    ' : '  ПЛОХО ') + 'говорит на настоящей поломке'
            + (realToast ? ' → ' + realToast : ''));
if (!realToast) problems.push('сторож промолчал на настоящей поломке');
else if (!/Перезапустить|restart|Restart/i.test(realToast)) problems.push('в сообщении нет выхода');
clearToasts();

console.log('');
console.log('ЯЗЫКИ');
for (const lg of LANGS) {
  store.dispatch({ type: 'SETTINGS_SET', patch: { lang: lg } });
  await sleep(150);
  let worst = 0, holes = 0, nulls = 0;
  for (const r of ['home', 'today', 'quests', 'profile', 'rules']) {
    window.location.hash = '#/' + r;
    window.dispatchEvent(new window.Event('hashchange'));
    await sleep(260);
    const text = root.textContent.replace(/\s+/g, ' ');
    worst = Math.max(worst, text.length);
    holes += (text.match(/\{v\d\}/g) || []).length;
    nulls += (text.match(/undefined|\bnull\b/g) || []).length;
  }
  const bad = holes || nulls;
  console.log((bad ? '  ПЛОХО ' : '  ок    ') + lg.padEnd(3),
              '| незакрытых подстановок:', holes, '| undefined/null:', nulls);
  if (holes) problems.push(lg + ': незакрытые подстановки ' + holes);
  if (nulls) problems.push(lg + ': undefined/null в тексте');
}
store.dispatch({ type: 'SETTINGS_SET', patch: { lang: 'ru' } });

console.log('');
if (problems.length) { console.log('ПРОБЛЕМЫ:'); problems.forEach(p => console.log(' -', p)); }
else console.log('ВСЕ ЭКРАНЫ ЧИСТЫЕ');
process.exit(problems.length ? 1 : 0);
