/* Прогон в настоящем WebKit — том же движке, что в Safari на айфоне.
 *
 * jsdom и Chrome оба показывали чистый результат, а человек видел
 * ошибку. Разница только в движке, поэтому проверка гоняет приложение
 * в WebKit с эмуляцией айфона и приложения с домашнего экрана.
 *
 * Запуск: npm i --no-save playwright && npx playwright install webkit
 *         node safari-check.mjs [адрес]
 */
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';

const URL_ = process.argv[2] || 'http://127.0.0.1:5199/index.html?src=pwa';
const SEED = process.env.SEED ? readFileSync(process.env.SEED, 'utf8') : null;

const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'ru-RU' });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', (e) => errs.push('ИСКЛЮЧЕНИЕ: ' + (e.stack || e.message)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('КОНСОЛЬ: ' + m.text()); });
page.on('requestfailed', (r) => errs.push('ЗАПРОС: ' + r.url().split('/').pop() + ' — ' + (r.failure() || {}).errorText));
if (SEED) await page.addInitScript(SEED);

const problems = [];
const alarm = () => page.evaluate(`(() => { const t=document.getElementById('toast');
  return t && !t.hidden ? t.textContent.slice(0,80) : ''; })()`);
const hideToast = () => page.evaluate(`(() => { const t=document.getElementById('toast');
  if (t) { t.hidden = true; t.replaceChildren(); } })()`).catch(() => {});

async function step(label, fn) {
  errs.length = 0;
  await hideToast();
  try { await fn(); } catch (e) { errs.push('ШАГ УПАЛ: ' + e.message); }
  const a = await alarm().catch(() => '');
  const bad = errs.length || /не отозвалось|отозв|not answer/i.test(a || '');
  console.log((bad ? '  ТРЕВОГА ' : '  ок      ') + label + (a ? ' | тост: ' + a.slice(0, 46) : ''));
  for (const e of errs) console.log('      ' + e.split('\n').slice(0, 4).join(' / ').slice(0, 400));
  if (bad) problems.push(label + (errs[0] ? ': ' + errs[0].slice(0, 300) : ': сторож сработал'));
}

await page.goto(URL_, { waitUntil: 'load' });
await page.waitForTimeout(7000);
console.log('первый экран:', (await page.evaluate(
  `document.getElementById('root').textContent.replace(/\\s+/g,' ').slice(0,70)`)));

const press = async (times) => {
  for (let i = 0; i < times; i++) {
    await page.evaluate(`(() => {
      const o=[...document.querySelectorAll('.option:not([disabled])')];
      if(o.length){const b=o[0];b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));b.click();return;}
      const bs=[...document.querySelectorAll('button:not([disabled])')]
        .filter(b=>!b.closest('#toast')&&!b.className.includes('gear')&&!b.className.includes('speak')&&b.offsetParent!==null);
      if(bs.length){const b=bs[bs.length-1];b.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));b.click();}
    })()`).catch(() => {});
    await page.waitForTimeout(1200);
  }
};

console.log('\n══ экраны ══');
for (const r of ['home', 'today', 'words', 'rules', 'quests', 'profile', 'install', 'recheck']) {
  await step(r, async () => {
    await page.evaluate(`location.hash='#/${r}'`);
    await page.waitForTimeout(1700);
  });
}

console.log('\n══ режимы занятий ══');
for (const r of ['session/build', 'session/sprint', 'session/ether', 'phrase', 'stream']) {
  await step(r, async () => {
    await page.evaluate(`location.hash='#/${r}'`);
    await page.waitForTimeout(2400);
    await press(6);
  });
}

console.log('\n══ подборки слов ══');
for (const [name, idx] of [['для поездок', 1], ['для айти', 4], ['обратно по умолчанию', 0]]) {
  await step(name, async () => {
    await page.evaluate(`location.hash='#/profile'`);
    await page.waitForTimeout(1600);
    await page.evaluate(`(() => { const b=document.querySelectorAll('.setcard')[${idx}]; if(b) b.click(); })()`);
    await page.waitForTimeout(700);
    await page.evaluate(`location.hash='#/session/sprint'`);
    await page.waitForTimeout(2400);
    await press(4);
  });
}

const rec = await page.evaluate(`localStorage.getItem('shodu:lastError')`).catch(() => null);
console.log('\nЗАПИСЬ О ПОЛОМКЕ:', rec ? String(rec).slice(0, 500) : 'нет');
console.log(problems.length ? `\nПРОБЛЕМ: ${problems.length}` : '\nWEBKIT: НИ ОДНОЙ ТРЕВОГИ');
await browser.close();
process.exit(problems.length ? 1 : 0);
