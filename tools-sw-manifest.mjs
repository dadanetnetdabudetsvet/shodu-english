/* Пересобирает список предварительного кэша в service-worker.js по факту
 * файлов на диске. Ручной список расходился с проектом на каждой правке. */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = [
  './', './index.html', './manifest.json',
  ...walk('src').filter(f => ['.js', '.css', '.json'].includes(extname(f))).map(f => './' + f),
  ...walk('data').filter(f => extname(f) === '.json').map(f => './' + f),
  ...walk('assets').filter(f => ['.png', '.svg'].includes(extname(f))).map(f => './' + f),
].filter(f => !f.includes('/verify.mjs'));

const sw = readFileSync('service-worker.js', 'utf8');

/* Версия кэша поднимается автоматически по содержимому файлов: при
   ручном бампе про него забывали, и установленное приложение
   продолжало отдавать старую версию из кэша навсегда. */
import { createHash } from 'node:crypto';
const hash = createHash('sha1');
for (const f of files) {
  try { hash.update(readFileSync(f.replace('./', '') || 'index.html')); } catch { hash.update(f); }
}
const version = 'v' + hash.digest('hex').slice(0, 10);
const list = files.map(f => `  '${f}',`).join('\n');
const next = sw
  .replace(/const SHELL = \[[\s\S]*?\n\];/, `const SHELL = [\n${list}\n];`)
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
writeFileSync('service-worker.js', next);

/* Ту же версию кладём в приложение. Без неё отчёт «выскочило
   сообщение» не говорит, какая сборка его показала, и разбор
   начинается с угадывания. */
writeFileSync('src/core/version.js',
  `/* Собирается автоматически в tools-sw-manifest.mjs. Руками не править. */\n`
  + `export const BUILD = '${version}';\n`);

const bytes = files.reduce((a, f) => {
  try { return a + statSync(f.replace('./', '')).size; } catch { return a; }
}, 0);
console.log('версия кэша:', version);
console.log('файлов в кэше:', files.length);
console.log('суммарный вес:', (bytes / 1024 / 1024).toFixed(2), 'МБ');
