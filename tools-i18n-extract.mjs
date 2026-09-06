/* Извлекает все строки, обёрнутые в t(), в каталог для переводчиков.
 * Ключ — сама русская строка, как в gettext. */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (extname(p) === '.js') out.push(p);
  }
  return out;
}

const keys = new Map();
for (const f of walk('src')) {
  if (f.includes('i18n')) continue;
  const src = readFileSync(f, 'utf8');
  // Ключи приходят двумя путями: прямым вызовом t() и описанием эффекта
  // { i18n: '...' } из чистого редьюсера, который про язык не знает.
  for (const re of [/\bt\(\s*'((?:[^'\\]|\\.)*)'/g, /\bi18n:\s*'((?:[^'\\]|\\.)*)'/g]) {
    for (const m of src.matchAll(re)) {
      const key = m[1].replace(/\\'/g, "'");
      if (!keys.has(key)) keys.set(key, []);
      keys.get(key).push(f.replace('src/', ''));
    }
  }
}

// строки из доменного слоя переводятся на уровне экранов, но в каталог
// должны попасть: это названия медалей, ступеней планки, ответы на голос
const DOMAIN_STRINGS = [];
for (const f of ['src/domain/medals.js', 'src/domain/challenge.js', 'src/domain/referral.js',
                 'src/domain/scoring.js', 'src/screens/home.js', 'src/screens/session.js',
                 'src/app.js', 'src/screens/words.js']) {
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const v = m[1];
    if (/[А-Яа-яЁё]/.test(v) && !keys.has(v)) { keys.set(v, [f.replace('src/', '')]); DOMAIN_STRINGS.push(v); }
  }
}

const sorted = [...keys.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
mkdirSync('src/i18n/locales', { recursive: true });
writeFileSync('src/i18n/catalog.json', JSON.stringify({
  version: 1,
  source: 'ru',
  count: sorted.length,
  strings: sorted,
}, null, 1), 'utf8');

console.log('строк в каталоге:', sorted.length);
console.log('из доменного слоя:', DOMAIN_STRINGS.length);
const withVars = sorted.filter(s => /\{\w+\}/.test(s));
console.log('с подстановками:', withVars.length);
console.log('самая длинная:', sorted.reduce((a, b) => a.length > b.length ? a : b).slice(0, 90) + '…');
