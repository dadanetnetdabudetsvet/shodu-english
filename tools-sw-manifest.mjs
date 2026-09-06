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
const list = files.map(f => `  '${f}',`).join('\n');
const next = sw.replace(/const SHELL = \[[\s\S]*?\n\];/,
  `const SHELL = [\n${list}\n];`);
writeFileSync('service-worker.js', next);

const bytes = files.reduce((a, f) => {
  try { return a + statSync(f.replace('./', '')).size; } catch { return a; }
}, 0);
console.log('файлов в кэше:', files.length);
console.log('суммарный вес:', (bytes / 1024 / 1024).toFixed(2), 'МБ');
