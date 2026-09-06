/* Проверка файлов локализации. Запуск: node tools-i18n-check.mjs
 *
 * Ловит четыре класса поломок, каждый из которых виден пользователю:
 * пропущенный ключ (человек увидит русскую строку), пустое значение,
 * потерянную подстановку (человек увидит «{v0}» или число исчезнет)
 * и строку, оставшуюся русской.
 *
 * Совпадения с оригиналом перечислены явно: между русским и украинским
 * есть слова, которые совпадают буква в букву, и это не брак перевода.
 */
import { readFileSync, existsSync } from 'node:fs';

const LANGS = ['de', 'pl', 'uk', 'tr', 'id'];

/* Слова, которые в целевом языке пишутся так же, как в русском.
   Каждое исключение обосновано, список закрыт. */
const SAME_AS_SOURCE_OK = {
  '*': {
    '+{v0} 💎': 'в строке нет слов: число, плюс и эмодзи одинаковы во всех языках',
  },
  uk: {
    'слова': 'форма числівника 2–4: «два слова» — так само, як у російській',
    'слово': 'форма числівника 1: «одне слово» — так само, як у російській',
  },
};

const catalog = JSON.parse(readFileSync('src/i18n/catalog.json', 'utf8'));
const keys = catalog.strings;
const keySet = new Set(keys);
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

console.log(`каталог: ${keys.length} строк (поле count: ${catalog.count})`);
if (keys.length !== catalog.count) fail(`count=${catalog.count}, а строк ${keys.length}`);
if (keys.length !== new Set(keys).size) fail('в каталоге есть повторяющиеся ключи');

for (const lang of LANGS) {
  const path = `src/i18n/locales/${lang}.json`;
  console.log(`\n── ${lang} ─ ${path}`);
  if (!existsSync(path)) { fail('файла нет'); continue; }

  let dict;
  try { dict = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { fail('невалидный JSON: ' + e.message); continue; }
  ok('JSON валиден');

  const own = Object.keys(dict);
  const missing = keys.filter(k => !(k in dict));
  const extra = own.filter(k => !keySet.has(k));
  if (own.length === keys.length && !missing.length && !extra.length) {
    ok(`ключей ${own.length}, множество совпадает с каталогом`);
  } else {
    fail(`ключей ${own.length} против ${keys.length} в каталоге`);
    if (missing.length) fail(`нет перевода у ${missing.length}: ` + missing.slice(0, 10).map(s => JSON.stringify(s)).join(', '));
    if (extra.length) fail(`лишние ключи (${extra.length}): ` + extra.slice(0, 10).map(s => JSON.stringify(s)).join(', '));
  }

  const empty = own.filter(k => !String(dict[k]).trim());
  empty.length ? fail(`пустых значений: ${empty.length} — ` + empty.map(s => JSON.stringify(s)).join(', '))
               : ok('пустых значений нет');

  const same = own.filter(k => dict[k] === k);
  const allowed = { ...(SAME_AS_SOURCE_OK['*'] || {}), ...(SAME_AS_SOURCE_OK[lang] || {}) };
  const unexpected = same.filter(k => !(k in allowed));
  if (unexpected.length) fail(`совпадает с русским (${unexpected.length}): ` + unexpected.map(s => JSON.stringify(s)).join(', '));
  else ok(`не переведённых строк нет` + (same.length ? `; совпадений по языку: ${same.length} — ` + same.map(k => `${JSON.stringify(k)} (${allowed[k]})`).join('; ') : ''));

  const broken = own.filter(k => vars(k) !== vars(dict[k]));
  if (broken.length) {
    fail(`подстановки разошлись (${broken.length}):`);
    for (const k of broken) console.log(`        ${JSON.stringify(k)} {${vars(k)}} → ${JSON.stringify(dict[k])} {${vars(dict[k])}}`);
  } else ok('набор подстановок {…} совпадает во всех строках');

  /* Р9: не больше одного восклицательного знака и одного эмодзи на строку. */
  const emoji = /\p{Extended_Pictographic}/gu;
  const loud = own.filter(k => (dict[k].match(/!/g) || []).length > 1);
  const noisy = own.filter(k => (dict[k].match(emoji) || []).length > 1);
  const added = own.filter(k => (dict[k].match(emoji) || []).length > (k.match(emoji) || []).length);
  loud.length ? fail(`больше одного «!»: ` + loud.map(k => JSON.stringify(dict[k])).join(', ')) : ok('не больше одного «!» на строку');
  noisy.length ? fail(`больше одного эмодзи: ` + noisy.map(k => JSON.stringify(dict[k])).join(', ')) : ok('не больше одного эмодзи на строку');
  added.length ? fail(`эмодзи добавлены сверх оригинала: ` + added.map(k => JSON.stringify(dict[k])).join(', ')) : ok('новых эмодзи сверх оригинала нет');

  /* Английские слова-материал не должны появляться в служебных строках. */
  const trailing = keys.filter(k => /\s$/.test(k) && !/\s$/.test(dict[k]));
  trailing.length ? fail('потерян хвостовой пробел (строки склеиваются): ' + trailing.map(s => JSON.stringify(s)).join(', '))
                  : ok('хвостовые пробелы сохранены');
}

console.log(failures ? `\nПРОВАЛЕНО проверок: ${failures}` : '\nВсе проверки пройдены.');
process.exit(failures ? 1 : 0);
