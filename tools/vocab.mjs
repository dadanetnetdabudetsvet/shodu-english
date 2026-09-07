import fs from 'node:fs';
const D = '/Users/admin/Documents/shodu-english/data/';
const load = f => JSON.parse(fs.readFileSync(D + f, 'utf8'));

export const deck1 = load('words.json').words;                // 200 cognates, tiers 1-4
export const deck2 = load('core-words.json').words;           // 120 service words
export const deck3 = load('deck3-cognates.json').words;       // 150 cognates, tiers 3-5
export const deck4 = load('deck4-actions.json').words;        // 250 actions/adjectives/adverbs
export const deck5 = load('deck5-nouns.json').words;          // 250 nouns
export const deck6 = load('deck6-topup.json').words;          // 49 top-up

const norm = s => String(s).toLowerCase().trim();

export const CORE123 = new Set();   // decks 1+2+3 — the required dictionary
for (const d of [deck1, deck2, deck3]) for (const w of d) CORE123.add(norm(w.en));
export const APP456 = new Set();    // decks 4+5+6 — same app, later decks
for (const d of [deck4, deck5, deck6]) for (const w of d) APP456.add(norm(w.en));

// Irregular / suppletive forms of lemmas that live in decks 1-3.
export const IRREGULAR = {
  // be
  'been':'be','being':'be','wasn’t':'was','wasnt':'was',
  // deck2 verbs
  'went':'go','gone':'go','goes':'go','going':'go',
  'came':'come','coming':'come',
  'knew':'know','known':'know','knows':'know','knowing':'know',
  'saw':'see','seen':'see','sees':'see','seeing':'see',
  'said':'say','says':'say','saying':'say',
  'took':'take','taken':'take','takes':'take','taking':'take',
  'gave':'give','given':'give','gives':'give','giving':'give',
  'made':'make','makes':'make','making':'make',
  'got':'get','gotten':'get','gets':'get','getting':'get',
  'ate':'eat','eaten':'eat','eats':'eat','eating':'eat',
  'drank':'drink','drunk':'drink','drinks':'drink','drinking':'drink',
  'bought':'buy','buys':'buy','buying':'buy',
  'wrote':'write','written':'write','writes':'write','writing':'write',
  'read':'read','reads':'read','reading':'read',
  'had':'have','having':'have',
  'did':'do','does':'do','done':'do','doing':'do',
  'better':'good','best':'good','worse':'bad','worst':'bad',
  'children':'child','men':'man','women':'woman','feet':'foot','teeth':'tooth',
  'people':'people','police':'police',
  'lived':'live','lives':'live','living':'live',
  'worked':'work','works':'work','working':'work',
  'wanted':'want','wants':'want','wanting':'want',
  'needed':'need','needs':'need','needing':'need',
  'liked':'like','likes':'like','liking':'like',
  'loved':'love','loves':'love','loving':'love',
  'helped':'help','helps':'help','helping':'help',
  'opened':'open','opens':'open','opening':'open',
  'played':'play','plays':'play','playing':'play',
  'started':'start','starts':'start','starting':'start',
  'checked':'check','checks':'check','checking':'check',
  'planned':'plan','plans':'plan','planning':'plan',
  'visited':'visit','visits':'visit','visiting':'visit',
  'finished':'finish','finishes':'finish','finishing':'finish',
  'created':'create','creates':'create','creating':'create',
  'organized':'organize','organizes':'organize','organizing':'organize',
  'informed':'inform','informs':'inform','informing':'inform',
  'discussed':'discuss','discusses':'discuss','discussing':'discuss',
  'printed':'print','prints':'print','printing':'print',
  'produced':'produce','produces':'produce','producing':'producing',
  'copied':'copy','copies':'copy','copying':'copy',
  'recorded':'record','records':'record',
  'matched':'match','matches':'match',
  'coded':'code','codes':'code',
  'toured':'tour','tours':'tour',
  'risked':'risk','risks':'risk',
  'stressed':'stress','types':'type','typed':'type',
  'guides':'guide','guided':'guide',
  'models':'model','modelled':'model',
  'balances':'balance','figured':'figure','figures':'figure',
  'lighter':'light','lightest':'light',
  'younger':'young','youngest':'young',
  'newer':'new','newest':'new','older':'old','oldest':'old',
  'bigger':'big','biggest':'big','smaller':'small','smallest':'small',
  'hotter':'hot','hottest':'hot','colder':'cold','coldest':'cold',
  'warmer':'warm','warmest':'warm','faster':'fast','fastest':'fast',
  'slower':'slow','slowest':'slow','cheaper':'cheap','cheapest':'cheap',
  'nicer':'nice','nicest':'nice','busier':'busy','busiest':'busy',
  'happier':'happy','happiest':'happy','longer':'long','longest':'long',
  'shorter':'short','shortest':'short','easier':'easy','easiest':'easy',
  'nearer':'nearest','later':'late','latest':'late','freer':'free',
  'nearest':'near','farther':'far','furthest':'far',
  'normally':'normal','specially':'special','socially':'social',
  'formally':'formal','globally':'global','locally':'local','legally':'legal',
  'generally':'general','naturally':'natural','perfectly':'perfect',
  'correctly':'correct','individually':'individual','professionally':'professional',
  'physically':'physical','musically':'musical','medically':'medical',
  'privately':'private','centrally':'central','nationally':'national',
  'originally':'original','comfortably':'comfortable','modernly':'modern',
  'quietly':'quiet','loudly':'loud',
  "i'm":'i',"it's":'it',"isn't":'is',"aren't":'are',"don't":'do',"doesn't":'do',
  "can't":'can',"won't":'will',"let's":'let',"that's":'that',"i've":'i',"we're":'we',
  "you're":'you',"he's":'he',"she's":'she',"they're":'they',"there's":'there',
  "hasn't":'has',"haven't":'have',"didn't":'do',"wasn't":'was',"weren't":'were',
};

// Regular English inflection: strip a suffix, see if the stem is a known lemma.
export function lemmaOf(word, dict) {
  const w = norm(word);
  if (dict.has(w)) return { lemma: w, kind: 'exact' };
  if (IRREGULAR[w] && dict.has(IRREGULAR[w])) return { lemma: IRREGULAR[w], kind: 'irregular' };
  const tries = [];
  if (w.endsWith('ies')) tries.push([w.slice(0, -3) + 'y', 'plural/3sg']);
  if (w.endsWith('es')) tries.push([w.slice(0, -2), 'plural/3sg']);
  if (w.endsWith('s')) tries.push([w.slice(0, -1), 'plural/3sg']);
  if (w.endsWith('ed')) { tries.push([w.slice(0, -2), 'past'], [w.slice(0, -1), 'past'], [w.slice(0, -3) + 'y', 'past']); }
  if (w.endsWith('ing')) { tries.push([w.slice(0, -3), 'ing'], [w.slice(0, -3) + 'e', 'ing']); }
  if (w.endsWith('er')) tries.push([w.slice(0, -2), 'comparative'], [w.slice(0, -1), 'comparative']);
  if (w.endsWith('est')) tries.push([w.slice(0, -3), 'superlative'], [w.slice(0, -2), 'superlative']);
  if (w.endsWith('ly')) tries.push([w.slice(0, -2), 'adverb']);
  if (w.length > 4 && /(.)\1(ed|ing)$/.test(w)) {
    const base = w.replace(/(.)\1(ed|ing)$/, '$1');
    tries.push([base, 'doubled']);
  }
  for (const [cand, kind] of tries) if (dict.has(cand)) return { lemma: cand, kind };
  return null;
}

export function tokenize(sentence) {
  return String(sentence)
    .replace(/[.,!?;:"“”—–()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}
