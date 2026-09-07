import fs from 'node:fs';
import { CORE123, APP456, lemmaOf, tokenize } from './vocab.mjs';

const P = '/Users/admin/Documents/shodu-english/data/rules.json';
const raw = fs.readFileSync(P, 'utf8');
let doc, jsonOk = true;
try { doc = JSON.parse(raw); } catch (e) { jsonOk = false; console.log('JSON INVALID:', e.message); process.exit(1); }
const R = doc.rules;
const fail = [];
const ok = s => console.log('  OK   ' + s);
const bad = s => { console.log('  FAIL ' + s); fail.push(s); };

console.log('='.repeat(72));
console.log('ПРОВЕРКА data/rules.json  (версия ' + doc.version + ')');
console.log('='.repeat(72));

// ---------- 1. структура ----------
console.log('\n[1] СТРУКТУРА');
jsonOk ? ok('JSON валиден') : bad('JSON невалиден');
R.length === 300 ? ok('записей ровно 300') : bad('записей ' + R.length + ', а должно быть 300');
doc.version === 4 ? ok('версия файла = 4') : bad('версия файла = ' + doc.version);

const FIELDS = ['id','order','sameness','level','topic','title','idea','ru_parallel',
  'en_example','ru_example','en_example2','ru_example2','gotcha','difficulty','why_easy'];
let shapeBad = 0, emptyBad = [];
for (const r of R) {
  const keys = Object.keys(r);
  if (keys.length !== FIELDS.length || FIELDS.some((f, i) => keys[i] !== f)) shapeBad++;
  for (const f of FIELDS) {
    if (f === 'gotcha') continue;
    const v = r[f];
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) emptyBad.push(r.id + '.' + f);
  }
}
shapeBad === 0 ? ok('во всех записях ровно 15 полей в исходном порядке') : bad(shapeBad + ' записей с иной схемой полей');
emptyBad.length === 0 ? ok('все обязательные поля непустые (gotcha может быть null)') : bad('пустые поля: ' + emptyBad.join(', '));

// ---------- 2. id и order ----------
console.log('\n[2] ИДЕНТИФИКАТОРЫ И ПОРЯДОК');
const V3 = JSON.parse(fs.readFileSync('/Users/admin/Documents/shodu-english/tools/rules.v3.json','utf8'));
const oldIds = new Set(V3.rules.map(r => r.id));
const newIds = R.map(r => r.id);
const idsSame = newIds.length === oldIds.size && newIds.every(i => oldIds.has(i)) && new Set(newIds).size === 300;
idsSame ? ok('множество id не изменилось, 300 уникальных') : bad('id изменились');
const orders = R.map(r => r.order).sort((a,b)=>a-b);
const isPerm = orders.every((v,i) => v === i+1);
isPerm ? ok('order — перестановка 1..300') : bad('order не является перестановкой 1..300');

// ---------- 3. sameness ----------
console.log('\n[3] СОРТИРОВКА ПО СОВПАДЕНИЮ С РУССКИМ');
const byOrder = R.slice().sort((a,b) => a.order - b.order);
let mono = true, firstBreak = null;
for (let i = 1; i < byOrder.length; i++) {
  if (byOrder[i].sameness > byOrder[i-1].sameness) { mono = false; firstBreak = firstBreak ?? i+1; }
}
mono ? ok('sameness не возрастает по всей последовательности') : bad('нарушение монотонности на позиции ' + firstBreak);
const first40 = byOrder.slice(0, 40);
first40.every(r => r.sameness === 5)
  ? ok('первые 40 правил имеют sameness 5')
  : bad('среди первых 40 есть sameness != 5: ' + first40.filter(r=>r.sameness!==5).map(r=>r.id).join(','));
const inRange = R.every(r => Number.isInteger(r.sameness) && r.sameness >= 1 && r.sameness <= 5);
inRange ? ok('sameness — целое от 1 до 5 у всех') : bad('sameness вне диапазона 1..5');

const dist = {}; for (const r of R) dist[r.sameness] = (dist[r.sameness]||0)+1;
console.log('  Распределение по sameness:');
for (const s of [5,4,3,2,1]) {
  const n = dist[s]||0;
  console.log('    ' + s + ' — ' + String(n).padStart(3) + '  ' + '#'.repeat(Math.round(n/2)));
}
const lv = {}; for (const r of R) lv[r.level] = (lv[r.level]||0)+1;
console.log('  Распределение по уровням: ' + Object.entries(lv).map(([k,v])=>k+'='+v).join(', '));
console.log('  Уровни внутри sameness:');
for (const s of [5,4,3,2,1]) {
  const g = R.filter(r=>r.sameness===s); const m={};
  for (const r of g) m[r.level]=(m[r.level]||0)+1;
  console.log('    sameness ' + s + ': ' + ['a1','a2','b1','b2'].map(l=>l+'='+(m[l]||0)).join(' '));
}

// ---------- 4. словарь примеров ----------
console.log('\n[4] СЛОВАРЬ ПРИМЕРОВ');

// Служебные и грамматические слова, которые сами являются предметом своего совпадения.
// Каждое закрытого класса: артикли, модальные, союзы, предлоги, местоимения, числа.
const GRAMMAR = new Set([
  'under','about','without','by','before','after','between','behind','front','next','until','during',
  'across','through','over','up','down','off','out','into','than','as','so','if','while','although','since',
  'unless','soon','either','neither','both','each','other','another','every','any','some','no',
  'nobody','nothing','somebody','anything','whose','which','one','ones','mine','yours','its',
  'myself','yourself','himself','herself','itself','those','many','few','little','lot','much',
  'must','should','shall','may','might','could','would','won','wouldn','shouldn','mustn','needn',
  'let','used','able','going','been','being','having','get','got',
  'always','never','often','sometimes','usually','already','yet','still','just','again','too','also',
  'well','ago','enough','only','soon','back','ever','hardly','lately','rarely','more','most',
  'three','five','ten','seven','two','thirteen','thirty','hundred','thousand','first','fifth',
  'half','past','hour','clock','time','day','years','o',
]);
// Слова, которых нет в колодах 1-3, но которые нужны конкретному совпадению как его предмет.
const PROPER = new Set(['anna','italy','may','monday','english','mr','dr','smith','brown','picasso','baikal','volga','lake','paris','london','moscow']);


// Слова вне всех колод приложения, допущенные осознанно: каждое является
// предметом самого совпадения, и заменить его нечем.
const SUBJECT_EXCEPTIONS = {
  home:     { rules: ['r167','r186'], why: 'само слово и есть предмет совпадения: go home без предлога, at home без артикля' },
  pick:     { rules: ['r163'], why: 'фразовый глагол pick up — предмет совпадения' },
  picked:   { rules: ['r163'], why: 'фразовый глагол pick up — предмет совпадения' },
  arm:      { rules: ['r298'], why: 'идиома costs an arm and a leg — предмет совпадения' },
  commence: { rules: ['r300'], why: 'смысл совпадения в том, что латинский синоним звучит официальнее start' },
};

const stat = { core: 0, app: 0, grammar: 0, proper: 0, unknown: 0, total: 0 };
const unknownWords = new Map();   // word -> Set(ruleId)
const outsideCore = new Map();    // word -> {rules:Set, bucket}
let pureCore = 0, pureCorePlusGrammar = 0, exampleCount = 0;

for (const r of byOrder) {
  for (const f of ['en_example', 'en_example2']) {
    exampleCount++;
    const toks = tokenize(r[f]);
    let allCore = true, allCoreOrGrammar = true;
    for (const t of toks) {
      stat.total++;
      const low = t.toLowerCase().replace(/[‘’]/g, "'");
      const inCore = lemmaOf(t, CORE123);
      if (inCore) { stat.core++; continue; }
      allCore = false;
      const key = low;
      if (GRAMMAR.has(low.replace(/'.*$/, '')) || GRAMMAR.has(low)) {
        stat.grammar++;
        if (!outsideCore.has(key)) outsideCore.set(key, { rules: new Set(), bucket: 'служебное/грамматическое' });
        outsideCore.get(key).rules.add(r.id); continue;
      }
      if (PROPER.has(low)) {
        stat.proper++;
        if (!outsideCore.has(key)) outsideCore.set(key, { rules: new Set(), bucket: 'имя собственное' });
        outsideCore.get(key).rules.add(r.id); continue;
      }
      allCoreOrGrammar = false;
      const inApp = lemmaOf(t, APP456);
      if (inApp) {
        stat.app++;
        if (!outsideCore.has(key)) outsideCore.set(key, { rules: new Set(), bucket: 'колода 4/5/6 приложения' });
        outsideCore.get(key).rules.add(r.id); continue;
      }
      stat.unknown++;
      const dec = SUBJECT_EXCEPTIONS[low];
      if (!(dec && dec.rules.includes(r.id))) {
        if (!unknownWords.has(key)) unknownWords.set(key, new Set());
        unknownWords.get(key).add(r.id);
      }
      if (!outsideCore.has(key)) outsideCore.set(key, { rules: new Set(), bucket: 'ВНЕ ВСЕХ КОЛОД' });
      outsideCore.get(key).rules.add(r.id);
    }
    if (allCore) pureCore++;
    if (allCoreOrGrammar) pureCorePlusGrammar++;
  }
}

const pct = (a,b) => (100*a/b).toFixed(1) + '%';
console.log('  Всего словоупотреблений в примерах: ' + stat.total);
console.log('    из колод 1+2+3 (когнаты и служебные):  ' + String(stat.core).padStart(4) + '  ' + pct(stat.core, stat.total));
console.log('    служебное/грамматическое вне колод:    ' + String(stat.grammar).padStart(4) + '  ' + pct(stat.grammar, stat.total));
console.log('    имена собственные:                     ' + String(stat.proper).padStart(4) + '  ' + pct(stat.proper, stat.total));
console.log('    из колод 4/5/6 приложения:             ' + String(stat.app).padStart(4) + '  ' + pct(stat.app, stat.total));
console.log('    вне всех колод приложения:             ' + String(stat.unknown).padStart(4) + '  ' + pct(stat.unknown, stat.total));
console.log('  Примеров всего: ' + exampleCount);
console.log('    целиком из колод 1+2+3:                ' + pureCore + '  (' + pct(pureCore, exampleCount) + ')');
console.log('    целиком из колод 1+2+3 + служебных:    ' + pureCorePlusGrammar + '  (' + pct(pureCorePlusGrammar, exampleCount) + ')');

if (unknownWords.size === 0) ok('незадекларированных слов вне всех колод нет');
else bad('слов вне всех колод и вне списка исключений: ' + unknownWords.size + ' (' + [...unknownWords.keys()].join(', ') + ')');
console.log('  Осознанные исключения (слово и есть предмет совпадения):');
for (const [w, d] of Object.entries(SUBJECT_EXCEPTIONS)) console.log('    ' + w.padEnd(10) + d.rules.join(' ').padEnd(12) + d.why);

console.log('\n  НАРУШИТЕЛИ — все слова примеров, которых нет в колодах 1+2+3, по корзинам:');
const buckets = {};
for (const [w, info] of outsideCore) (buckets[info.bucket] = buckets[info.bucket] || []).push([w, info.rules.size]);
for (const b of Object.keys(buckets).sort()) {
  const items = buckets[b].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([w, n]) => w + '×' + n);
  console.log('    ' + b + ' — ' + items.length + ' слов, ' + items.reduce((a,s)=>a+ +s.split('×')[1],0) + ' употреблений:');
  let line = '      ';
  for (const it of items) {
    if (line.length + it.length + 2 > 100) { console.log(line); line = '      '; }
    line += it + '  ';
  }
  if (line.trim()) console.log(line);
}

// ---------- 5. заголовки ----------
console.log('\n[5] ЗАГОЛОВКИ');
const BANNED = ['урок','задани','домашк','тест','ошибочк','молодец','не сдавайся','правил','изучи','изуча','запомн','выучи','вызубр'];
const longTitles = [], bannedTitles = [];
for (const r of R) {
  const words = r.title.trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
  if (words.length > 6) longTitles.push(r.id + ' (' + words.length + '): ' + r.title);
  const low = r.title.toLowerCase();
  for (const b of BANNED) if (low.includes(b)) bannedTitles.push(r.id + ' [' + b + ']: ' + r.title);
}
longTitles.length === 0 ? ok('все заголовки не длиннее шести слов') : bad('длинные заголовки: ' + longTitles.join(' | '));
bannedTitles.length === 0 ? ok('запрещённых слов в заголовках нет') : bad('запрещённые слова: ' + bannedTitles.join(' | '));
const dupT = {}; for (const r of R) dupT[r.title] = (dupT[r.title]||0)+1;
const dups = Object.entries(dupT).filter(([,n]) => n>1);
dups.length === 0 ? ok('заголовки не повторяются') : bad('повторы заголовков: ' + dups.map(([t])=>t).join(' | '));
const maxLen = Math.max(...R.map(r => r.title.length));
console.log('  Средняя длина заголовка: ' + (R.reduce((a,r)=>a+r.title.trim().split(/\s+/).filter(w=>/[\p{L}\p{N}]/u.test(w)).length,0)/300).toFixed(2) + ' слова, максимум символов: ' + maxLen);

// ---------- 6. честность ----------
console.log('\n[6] ЧЕСТНОСТЬ');
const HARD = /(русск|аналог|нельзя|нет вовсе|нет ни|против|наперекор|не совпад|придётся|обратн|исключен|запрещ|не работает|не подсказ|не переводится|не бывает|не имеет|наоборот|отличие|иначе|перестро|двух английских|двумя английскими)/i;
const s5NoGotcha = R.filter(r => r.sameness === 5 && r.gotcha === null).length;
const s5Soft = R.filter(r => r.sameness === 5 && r.gotcha !== null);
const s5Hard = s5Soft.filter(r => /(нельзя|наперекор|против привычки|аналога в русском нет)/i.test(r.gotcha));
console.log('  sameness 5: ' + s5NoGotcha + ' с gotcha = null, ' + s5Soft.length + ' с мягким пояснением');
s5Hard.length === 0 ? ok('у правил с sameness 5 нет жёстких оговорок') : bad('жёсткие оговорки при sameness 5: ' + s5Hard.map(r=>r.id).join(','));
const s12 = R.filter(r => r.sameness <= 2);
const s12NoG = s12.filter(r => !r.gotcha || r.gotcha.trim() === '');
s12NoG.length === 0 ? ok('у всех ' + s12.length + ' правил с sameness 1–2 gotcha заполнена') : bad('без gotcha при sameness<=2: ' + s12NoG.map(r=>r.id).join(','));
const s12Weak = s12.filter(r => !HARD.test(r.gotcha));
s12Weak.length === 0 ? ok('все gotcha при sameness 1–2 называют отличие прямо') : bad('слишком мягкие gotcha: ' + s12Weak.map(r=>r.id).join(','));
const bannedBody = [];
for (const r of R) for (const f of ['idea','ru_parallel','gotcha','why_easy']) {
  const v = r[f]; if (!v) continue;
  for (const b of ['урок','задани','домашк','ошибочк','молодец','не сдавайся']) if (v.toLowerCase().includes(b)) bannedBody.push(r.id+'.'+f+' ['+b+']');
}
bannedBody.length === 0 ? ok('в текстах нет запрещённых спекой слов') : bad('запрещённые слова в текстах: ' + bannedBody.join(', '));

// ---------- 7. примеры ----------
console.log('\n[7] ПРИМЕРЫ');
const lenBad = [];
for (const r of byOrder) for (const f of ['en_example','en_example2']) {
  const n = tokenize(r[f]).length;
  if (n > 9) lenBad.push(r.id + '.' + f + ' (' + n + ' слов): ' + r[f]);
}
lenBad.length === 0 ? ok('ни один пример не длиннее девяти слов') : bad('длинные примеры: ' + lenBad.join(' | '));
const wlens = byOrder.flatMap(r => [tokenize(r.en_example).length, tokenize(r.en_example2).length]);
const avg = (wlens.reduce((a,b)=>a+b,0)/wlens.length).toFixed(2);
const short = wlens.filter(n => n>=3 && n<=6).length;
console.log('  Средняя длина примера: ' + avg + ' слова; в диапазоне 3–6 слов: ' + short + ' из ' + wlens.length + ' (' + pct(short, wlens.length) + ')');
const noRu = R.filter(r => !/[а-яё]/i.test(r.ru_example) || !/[а-яё]/i.test(r.ru_example2));
noRu.length === 0 ? ok('у всех примеров есть русский перевод') : bad('без русского перевода: ' + noRu.map(r=>r.id).join(','));

// ---------- 8. правила, чей пример не собрался целиком из когнатов ----------
console.log('\n[8] ПРАВИЛА, ЧЕЙ ПРИМЕР НЕ СОБРАЛСЯ ЦЕЛИКОМ ИЗ КОГНАТОВ');
const notPure = [];
for (const r of byOrder) {
  const words = [];
  for (const f of ['en_example','en_example2']) for (const t of tokenize(r[f])) {
    const low = t.toLowerCase().replace(/[\u2018\u2019]/g, "'");
    if (lemmaOf(t, CORE123)) continue;
    if (GRAMMAR.has(low.replace(/'.*$/, '')) || GRAMMAR.has(low)) continue;
    if (PROPER.has(low)) continue;
    words.push(low);
  }
  if (words.length) notPure.push({ id: r.id, order: r.order, s: r.sameness, topic: r.topic, title: r.title, words: [...new Set(words)] });
}
console.log('  Таких правил: ' + notPure.length + ' из 300 (' + pct(notPure.length, 300) + ')');
for (const n of notPure) {
  console.log('    #' + String(n.order).padStart(3) + ' ' + n.id.padEnd(5) + ' s' + n.s + '  ' + n.words.join(', ').padEnd(26) + '| ' + n.title);
}

console.log('\n' + '='.repeat(72));
console.log(fail.length === 0 ? 'ИТОГ: все проверки пройдены.' : 'ИТОГ: провалено проверок — ' + fail.length);
console.log('='.repeat(72));
