/* Вводная проверка в приложении с домашнего экрана.
 *
 * Именно здесь был отчёт «выбираю слово, и ничего не происходит».
 * Проверка проходит весь опрос до конца и следит за тем, что вопрос
 * сменяется, ответы записываются и ни один обработчик не падает.
 *
 * Запуск: node standalone-check.mjs
 */
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
const problems = [];

console.log('ВВОДНАЯ ПРОВЕРКА С ДОМАШНЕГО ЭКРАНА');
console.log('  режим standalone:', window.matchMedia('(display-mode: standalone)').matches,
            '| navigator.standalone:', window.navigator.standalone);

const start = root.querySelector('.btn--cta') || [...root.querySelectorAll('button')].pop();
if (!start) { problems.push('нет кнопки начала'); }
else { click(start); await sleep(500); }

const store = window.__shodu && window.__shodu.store;
if (!store) problems.push('хранилище недоступно');

const opts = root.querySelectorAll('.option');
console.log('  вариантов на первом вопросе:', opts.length);
if (opts.length < 2) problems.push('варианты ответа не появились');
if (opts[0] && opts[0].disabled) problems.push('вариант ответа заблокирован');

/* Нажимаем и ждём: у неверного ответа переход занимает 1200 мс. */
const qText = () => (root.querySelector('.qcard__hint') || {}).textContent || '';
const word = () => (root.querySelector('.t-en') || {}).textContent || '';
const before = { q: qText(), w: word(), n: Object.keys(store.state.srs.deck1).length };
click(opts[0]);
await sleep(2000);
const after = { q: qText(), w: word(), n: Object.keys(store.state.srs.deck1).length };
console.log('  вопрос:', before.q, '→', after.q);
console.log('  слово :', before.w, '→', after.w);
console.log('  записано слов:', before.n, '→', after.n);
if (after.w === before.w) problems.push('слово не сменилось после ответа');
if (after.n <= before.n) problems.push('ответ не записался в прогресс');

/* Доводим опрос до конца. */
for (let i = 0; i < 14; i++) {
  const o = root.querySelectorAll('.option');
  if (!o.length) break;
  click(o[i % o.length]);
  await sleep(1400);
}
const total = Object.keys(store.state.srs.deck1).length;
console.log('  слов в прогрессе в конце:', total);
if (total < 10) problems.push('опрос не дошёл до конца: слов ' + total);

const bad = [...errors, ...jsdomErrors];
console.log('  ошибок от jsdom:', jsdomErrors.length, '| ошибок в консоли:', errors.length);
if (bad.length) problems.push(bad.join(' | ').slice(0, 500));

console.log('');
if (problems.length) { console.log('ПРОБЛЕМЫ:'); problems.forEach(p => console.log(' -', p)); }
else console.log('ВВОДНАЯ ПРОВЕРКА РАБОТАЕТ');
process.exit(problems.length ? 1 : 0);
