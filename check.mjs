/* Проверки целостности проекта. Запуск: node check.mjs
 * Держит три инварианта, каждый из которых уже был нарушен однажды. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

let failures = 0;
const ok = (m) => console.log('  OK  ', m);
const bad = (m) => { failures++; console.log('  FAIL', m); };

/* Убираем комментарии и строковые литералы, чтобы не ловить упоминания в тексте. */
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (extname(p) === '.js') out.push(p);
  }
  return out;
}

console.log('\n1. Слой domain не знает про DOM и хранилище');
for (const f of walk('src/domain')) {
  const code = stripNonCode(readFileSync(f, 'utf8'));
  const hits = [...code.matchAll(/\b(document|window|localStorage|indexedDB|navigator)\b/g)].map(m => m[1]);
  if (hits.length) bad(`${f}: ${[...new Set(hits)].join(', ')}`);
  else ok(f);
}

console.log('\n2. Цвет ошибки: --error не используется для ответа');
for (const f of [...walk('src'), ...readdirSync('src/ui').filter(n => n.endsWith('.css')).map(n => join('src/ui', n))]) {
  const src = readFileSync(f, 'utf8');
  if (f.endsWith('tokens.css')) continue;
  if (/var\(--error/.test(src)) bad(`${f}: используется var(--error), для ответа нужен --answer-wrong`);
}
ok('проверено');

console.log('\n3. Данные');
const words = JSON.parse(readFileSync('data/words.json', 'utf8'));
const core = JSON.parse(readFileSync('data/core-words.json', 'utf8'));
const rules = JSON.parse(readFileSync('data/rules.json', 'utf8'));

words.words.length === 200 ? ok('колода 1: 200 слов') : bad(`колода 1: ${words.words.length}`);
core.words.length === 120 ? ok('колода 2: 120 слов') : bad(`колода 2: ${core.words.length}`);
rules.rules.length === 300 ? ok('правил: 300') : bad(`правил: ${rules.rules.length}`);
words.false_friends.length === 30 ? ok('ложных друзей: 30') : bad(`ложных друзей: ${words.false_friends.length}`);

const d1 = new Set(words.words.map(w => w.en.toLowerCase()));
const cross = core.words.filter(w => d1.has(w.en.toLowerCase()));
cross.length === 0 ? ok('колоды не пересекаются') : bad(`пересечение: ${cross.map(w => w.en).join(', ')}`);

const dupes = words.words.length - d1.size;
dupes === 0 ? ok('дублей в колоде 1 нет') : bad(`дублей: ${dupes}`);

const all = new Set([...d1, ...core.words.map(w => w.en.toLowerCase())]);
const stray = [];
for (const w of core.words)
  for (const t of (w.ex_en.toLowerCase().match(/[a-z']+/g) || []))
    if (!all.has(t)) stray.push(`${w.id}:${t}`);
stray.length === 0 ? ok('примеры колоды 2 целиком из словаря') : bad(`вне словаря: ${stray.join(' ')}`);

// Порядок колоды 1 — часть формата экспорта, он не должен меняться.
const firstIds = words.words.slice(0, 3).map(w => w.id).join(',');
const lastIds = words.words.slice(-3).map(w => w.id).join(',');
firstIds === 'w001,w002,w003' && lastIds === 'w198,w199,w200'
  ? ok('порядок колоды 1 не сдвинут')
  : bad(`порядок сдвинут: ${firstIds} … ${lastIds}`);


// Инварианты данных, каждый из которых был нарушен и починен.
const DECK_FILES = ['data/words.json', 'data/core-words.json', 'data/deck3-cognates.json',
                    'data/deck4-actions.json', 'data/deck5-nouns.json', 'data/deck6-topup.json',
                    'data/deck7-tion.json'];
const allDeckWords = DECK_FILES.flatMap(f => (JSON.parse(readFileSync(f, 'utf8')).words || []));
const uniqueEn = new Set(allDeckWords.map(w => String(w.en).toLowerCase()));
/* Число берётся из индекса колод, а не зашито: база растёт, и
   расхождение должно ловиться, а не требовать правки проверки. */
const expectedTotal = JSON.parse(readFileSync('data/deck-index.json', 'utf8')).total;
uniqueEn.size + words.false_friends.length === expectedTotal
  ? ok(`в базе ровно ${expectedTotal} уникальных слов`)
  : bad(`в базе ${uniqueEn.size + words.false_friends.length} слов, в индексе ${expectedTotal}`);

const rhoticAll = allDeckWords.filter(w => w.tr && w.ipa && /р/.test(w.tr) && !/r/.test(w.ipa));
rhoticAll.length === 0 ? ok('транскрипция согласована с IPA во всех колодах')
  : bad(`ротичность разъехалась в ${rhoticAll.length} записях: ${rhoticAll.slice(0,4).map(w => w.en).join(', ')}`);

const stressAll = allDeckWords.filter(w => w.tr && (w.tr.match(/\u0301/g) || []).length > 1);
stressAll.length === 0 ? ok('одно ударение на слово во всех колодах')
  : bad(`двойных ударений: ${stressAll.length}`);

const rhotic = words.words.filter(w => /р/.test(w.tr) && !/r/.test(w.ipa));
rhotic.length === 0 ? ok('транскрипция согласована с IPA по «р»')
  : bad(`ротичность разъехалась: ${rhotic.slice(0, 5).map(w => w.id + ':' + w.tr).join(' ')}`);

const multiStress = words.words.filter(w => (w.tr.match(/\u0301/g) || []).length > 1);
multiStress.length === 0 ? ok('одно ударение на слово')
  : bad(`двойных ударений: ${multiStress.map(w => w.id).join(' ')}`);

const noBridge = words.words.filter(w => w.ru_bridge === undefined);
noBridge.length === 0 ? ok('слово-мостик отделено от точного перевода')
  : bad(`нет ru_bridge у ${noBridge.length} записей`);

const flagless = words.words.filter(w => w.stressShift === undefined || w.syllableDrop === undefined || w.spellingTrap === undefined);
flagless.length === 0 ? ok('флаги формы проставлены')
  : bad(`нет флагов у ${flagless.length} записей`);

const mismatched = words.words.filter(w => {
  const stem = w.ru.toLowerCase().replace(/[аеёиоуыэюяьйъ]+$/, '');
  return stem.length >= 3 && !w.ex_ru.toLowerCase().includes(stem.slice(0, Math.max(3, stem.length - 1)));
});
mismatched.length === 0 ? ok('точный перевод согласован с примером')
  : bad(`расходятся: ${mismatched.slice(0, 5).map(w => w.id).join(' ')}`);

const ffIncomplete = words.false_friends.filter(f => !f.id || !f.ipa || !f.tr || !f.ex_en || !f.hint);
ffIncomplete.length === 0 ? ok('ложные друзья пригодны для всех механик')
  : bad(`неполных ложных друзей: ${ffIncomplete.length}`);


// Правила должны держать идею приложения: сначала полное совпадение
// с русским, примеры собраны из слов, которые человек и так узнаёт.
const sameness = rules.rules.map(r => r.sameness);
const sorted = sameness.every((v, i) => i === 0 || sameness[i - 1] >= v);
sorted ? ok('правила отсортированы по совпадению с русским')
  : bad('порядок правил не соответствует совпадению с русским');
sameness.slice(0, 40).every(v => v === 5)
  ? ok('первые сорок правил — полное совпадение')
  : bad('в первых сорока правилах есть неполные совпадения');

const deckWords = new Set(allDeckWords.map(w => String(w.en).toLowerCase()));
let tokens = 0, known = 0;
for (const r of rules.rules) {
  for (const ex of [r.en_example, r.en_example2]) {
    for (const tk of (String(ex || '').toLowerCase().match(/[a-z']+/g) || [])) {
      tokens++;
      if (deckWords.has(tk)) known++;
    }
  }
}
const share = tokens ? known / tokens : 0;
share >= 0.8
  ? ok(`в примерах правил ${Math.round(share * 100)}% слов из словаря приложения`)
  : bad(`в примерах правил только ${Math.round(share * 100)}% слов из словаря`);

console.log('\n4. Локализация');
try {
  const cat = JSON.parse(readFileSync('src/i18n/catalog.json', 'utf8'));
  const keys = new Set(cat.strings);
  const locDir = 'src/i18n/locales';
  const files = readdirSync(locDir).filter(f => f.endsWith('.json'));
  files.length ? ok(`локалей: ${files.length}`) : bad('нет ни одного файла перевода');
  for (const f of files) {
    const d = JSON.parse(readFileSync(join(locDir, f), 'utf8'));
    const missing = [...keys].filter(k => !(k in d));
    const empty = Object.entries(d).filter(([, v]) => !String(v).trim()).map(([k]) => k);
    const badVars = Object.entries(d).filter(([k, v]) => {
      const a = (k.match(/\{\w+\}/g) || []).sort().join(',');
      const b = (String(v).match(/\{\w+\}/g) || []).sort().join(',');
      return a !== b;
    }).map(([k]) => k);
    if (missing.length > keys.size * 0.05) bad(`${f}: не хватает ${missing.length} из ${keys.size} строк`);
    else if (empty.length) bad(`${f}: пустых строк ${empty.length}`);
    else if (badVars.length) bad(`${f}: подстановки разъехались в ${badVars.length} строках`);
    else ok(`${f}: ${Object.keys(d).length} строк, подстановки на месте`);
  }
} catch (e) { bad('локали не прочитались: ' + e.message); }

console.log(failures === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ\n' : `\nПРОВАЛОВ: ${failures}\n`);
process.exit(failures ? 1 : 0);
