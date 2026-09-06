// Проверка целостности продакшн-данных: data/words.json, data/rules.json
import fs from 'fs';
const dir=new URL('.',import.meta.url).pathname;
const W=JSON.parse(fs.readFileSync(dir+'words.json','utf8'));
const R=JSON.parse(fs.readFileSync(dir+'rules.json','utf8'));
const ACUTE='́';
let fail=0, warn=0;
const ok=(c,m)=>{console.log((c?'  OK  ':'  FAIL')+'  '+m); if(!c)fail++;};
const line=t=>console.log('\n'+t+'\n'+'-'.repeat(t.length));

// количество слогов по IPA: разделители "." и знаки ударения (не в начале)
const syl=ipa=>{const s=ipa.replace(/\//g,'');
  return (s.match(/\./g)||[]).length + (s.slice(1).match(/[ˈˌ]/g)||[]).length + 1;};
const stem=w=>{const s=w.toLowerCase().replace(/ё/g,'е');
  return s.length>5? s.slice(0,s.length-2) : s.length>3? s.slice(0,s.length-1) : s;};

line('1. Состав и порядок массива words');
ok(W.words.length===200,`записей ровно 200 (факт: ${W.words.length})`);
const ids=W.words.map(w=>w.id);
console.log('       первые 5 id: '+ids.slice(0,5).join(', '));
console.log('       последние 5 id: '+ids.slice(-5).join(', '));
ok(ids.slice(0,5).join()==='w001,w002,w003,w004,w005','первые пять — w001…w005');
ok(ids.slice(-5).join()==='w196,w197,w198,w199,w200','последние пять — w196…w200');
ok(ids.every((id,i)=>id==='w'+String(i+1).padStart(3,'0')),'id идут строго по порядку w001…w200 без пропусков');
ok(new Set(ids).size===200,'дублей по id нет');
ok(W.version===2,`version = 2 (факт: ${W.version})`);

line('2. Дубли по en');
const dup=Object.entries(W.words.reduce((a,w)=>((a[w.en]=(a[w.en]||0)+1),a),{})).filter(([,n])=>n>1);
ok(dup.length===0,'дублей по en нет'+(dup.length?': '+dup.map(d=>d[0]).join(', '):''));

line('3. Непустые поля во всех записях');
const REQ=['id','en','ru','ru_bridge','ipa','tr','tier','topic','pos','ex_en','ex_ru','hint'];
const BOOL=['stressShift','syllableDrop','spellingTrap'];
let empties=[];
for(const w of W.words){
  for(const k of REQ) if(w[k]===undefined||w[k]===null||String(w[k]).trim()==='') empties.push(`${w.id}.${k}`);
  for(const k of BOOL) if(typeof w[k]!=='boolean') empties.push(`${w.id}.${k} (не boolean)`);
}
ok(empties.length===0,'все обязательные поля заполнены'+(empties.length?': '+empties.slice(0,20).join(', '):''));
console.log(`       флаги: stressShift ${W.words.filter(w=>w.stressShift).length}, syllableDrop ${W.words.filter(w=>w.syllableDrop).length}, spellingTrap ${W.words.filter(w=>w.spellingTrap).length} из 200`);

line('4. Ударение в tr: одно у многосложных, ноль у односложных');
const bad4=[];
for(const w of W.words){
  const n=(w.tr.match(new RegExp(ACUTE,'g'))||[]).length;
  const s=syl(w.ipa);
  if(s>1&&n!==1) bad4.push(`${w.id} ${w.en} ${w.ipa} tr=${w.tr} слогов ${s}, ударений ${n}`);
  if(s===1&&n!==0) bad4.push(`${w.id} ${w.en} односложное, но ударений ${n}`);
}
ok(bad4.length===0,'ударение проставлено верно во всех 200'+(bad4.length?':\n       '+bad4.join('\n       '):''));

line('5. Согласование «р» в tr с /r/ в ipa (британская неротическая)');
const bad5=[];
for(const w of [...W.words,...W.false_friends]){
  const hasR=/р/.test(w.tr), ipaR=/r/.test(w.ipa.replace(/\//g,''));
  if(hasR!==ipaR) bad5.push(`${w.id} ${w.en} ipa=${w.ipa} tr=${w.tr} (${hasR?'«р» есть в tr, но нет /r/':'/r/ есть, но «р» нет в tr'})`);
}
ok(bad5.length===0,'расхождений нет ни в одной из 230 записей'+(bad5.length?':\n       '+bad5.join('\n       '):''));

line('6. ex_en содержит своё слово');
const bad6=W.words.filter(w=>!w.ex_en.toLowerCase().includes(w.en.toLowerCase()));
ok(bad6.length===0,'все примеры содержат слово'+(bad6.length?': '+bad6.map(w=>w.id+' '+w.en+' / '+w.ex_en).join('; '):''));
const bad6f=W.false_friends.filter(f=>!f.ex_en.toLowerCase().includes(f.en.toLowerCase()));
ok(bad6f.length===0,'то же для 30 ложных друзей'+(bad6f.length?': '+bad6f.map(f=>f.id).join(', '):''));

line('7. ru встречается в ex_ru (та же или однокоренная форма)');
const bad7=W.words.filter(w=>!w.ex_ru.toLowerCase().replace(/ё/g,'е').includes(stem(w.ru)));
if(bad7.length) bad7.forEach(w=>console.log(`       ! ${w.id} ${w.en}: ru=«${w.ru}» ex_ru=«${w.ex_ru}»`));
ok(bad7.length===0,`несовпадений: ${bad7.length} (список выше — для ручной проверки)`);

line('8. Ложные друзья');
ok(W.false_friends.length===30,`записей ровно 30 (факт: ${W.false_friends.length})`);
const FREQ=['id','en','looks_like','actual_ru','ipa','tr','pos','ex_en','ex_ru','note','hint'];
const fEmpty=[];
W.false_friends.forEach(f=>FREQ.forEach(k=>{if(!f[k]||!String(f[k]).trim())fEmpty.push(f.id+'.'+k);}));
ok(fEmpty.length===0,'все поля заполнены'+(fEmpty.length?': '+fEmpty.join(', '):''));
const fids=W.false_friends.map(f=>f.id);
ok(fids.every((id,i)=>id==='f'+String(i+1).padStart(2,'0')),'id идут f01…f30');
const cross=W.false_friends.filter(f=>ids.length&&W.words.some(w=>w.en===f.en)).map(f=>f.en);
ok(cross.length===0,'пересечений с основной колодой по en нет'+(cross.length?': '+cross.join(', '):''));

line('9. Правила');
ok(R.rules.length===30,`правил ровно 30 (факт: ${R.rules.length})`);
ok(R.version===2,`version = 2 (факт: ${R.version})`);
const rEmpty=[];
R.rules.forEach(r=>['id','title','idea','ru_parallel','en_example','ru_example','gotcha','difficulty'].forEach(k=>{
  if(r[k]===undefined||r[k]===null||String(r[k]).trim()==='')rEmpty.push(r.id+'.'+k);}));
ok(rEmpty.length===0,'нет пустых полей и null-gotcha'+(rEmpty.length?': '+rEmpty.join(', '):''));
ok(true,'JSON обоих файлов валиден (файлы распарсились)');

console.log('\n'+'='.repeat(60));
console.log(fail===0?'ИТОГ: все проверки пройдены.':`ИТОГ: провалено проверок — ${fail}.`);
process.exit(fail?1:0);
