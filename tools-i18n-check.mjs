/* Проверка переводов против каталога.
 *
 * Проверяет ровно то, что можно проверить механически:
 *  1) JSON валиден;
 *  2) множество ключей совпадает с каталогом, ни одного лишнего и ни одного пропущенного;
 *  3) ни одна строка не пустая и ни одна не равна русскому оригиналу;
 *  4) набор подстановок {…} в переводе совпадает с набором в оригинале;
 *  5) хвостовой пробел сохранён там, где строка склеивается со следующей.
 */
import { readFileSync } from 'node:fs';

const LOCALES = ['en', 'es', 'pt', 'fr', 'it'];
const catalog = JSON.parse(readFileSync('src/i18n/catalog.json', 'utf8')).strings;
const catalogSet = new Set(catalog);

const vars = (s) => (s.match(/\{\w+\}/g) || []).slice().sort().join(',');

let failures = 0;
console.log(`каталог: ${catalog.length} строк\n`);

for (const code of LOCALES) {
  const path = `src/i18n/locales/${code}.json`;
  let dict;
  try {
    dict = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.log(`${code}: JSON НЕВАЛИДЕН — ${e.message}`);
    failures++;
    continue;
  }

  const keys = Object.keys(dict);
  const missing = catalog.filter(k => !(k in dict));
  const extra = keys.filter(k => !catalogSet.has(k));
  const empty = keys.filter(k => String(dict[k]).trim() === '');
  const same = keys.filter(k => dict[k] === k);
  const badVars = keys.filter(k => vars(k) !== vars(String(dict[k])));
  const tailSpace = catalog
    .filter(k => k.endsWith(' ') && k in dict)
    .filter(k => !String(dict[k]).endsWith(' '));

  const ok = !missing.length && !extra.length && !empty.length
    && !same.length && !badVars.length && !tailSpace.length && keys.length === catalog.length;

  console.log(`${code}.json  JSON: ок  ключей: ${keys.length}/${catalog.length}  ` +
    `пропущено: ${missing.length}  лишних: ${extra.length}  ` +
    `пустых: ${empty.length}  равных оригиналу: ${same.length}  ` +
    `подстановки разошлись: ${badVars.length}  потерян хвостовой пробел: ${tailSpace.length}  ` +
    `→ ${ok ? 'ЧИСТО' : 'ЕСТЬ НАРУШЕНИЯ'}`);

  const dump = (label, list) => {
    if (!list.length) return;
    console.log(`  ${label}:`);
    for (const k of list.slice(0, 20)) {
      console.log(`    ${JSON.stringify(k)}  →  ${JSON.stringify(dict[k])}`);
      if (label.includes('подстановки')) {
        console.log(`      оригинал: [${vars(k)}]   перевод: [${vars(String(dict[k]))}]`);
      }
    }
    if (list.length > 20) console.log(`    …ещё ${list.length - 20}`);
  };
  dump('пропущенные ключи', missing.map(k => k));
  dump('лишние ключи', extra);
  dump('пустые строки', empty);
  dump('равны русскому оригиналу', same);
  dump('подстановки разошлись', badVars);
  dump('потерян хвостовой пробел', tailSpace);

  if (!ok) failures++;
}

console.log(`\nитог: ${failures === 0 ? 'все пять файлов чистые' : `файлов с нарушениями — ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
