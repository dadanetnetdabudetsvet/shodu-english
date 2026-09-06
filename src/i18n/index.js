/* Локализация.
 *
 * Ключом служит сама русская строка, как в gettext. Это дороже по
 * размеру файлов, но исключает целый класс ошибок: невозможно оставить
 * в интерфейсе пустой ключ или забыть строку в каталоге. Отсутствующий
 * перевод честно показывает русский оригинал, а не «missing.key.42».
 *
 * Язык определяется по браузеру и запоминается, если человек выбрал
 * его руками.
 */

export const LANGUAGES = [
  { code: 'ru', name: 'Русский',        english: 'Russian',    dir: 'ltr' },
  { code: 'en', name: 'English',        english: 'English',    dir: 'ltr' },
  { code: 'es', name: 'Español',        english: 'Spanish',    dir: 'ltr' },
  { code: 'uk', name: 'Українська',     english: 'Ukrainian',  dir: 'ltr' },
  { code: 'uz', name: 'Oʻzbekcha',      english: 'Uzbek',      dir: 'ltr' },
  { code: 'kk', name: 'Қазақша',        english: 'Kazakh',     dir: 'ltr' },
  { code: 'zh', name: '中文',            english: 'Chinese',    dir: 'ltr' },
  { code: 'hi', name: 'हिन्दी',            english: 'Hindi',      dir: 'ltr' },
  { code: 'ar', name: 'العربية',          english: 'Arabic',     dir: 'rtl' },
  { code: 'pt', name: 'Português',      english: 'Portuguese', dir: 'ltr' },
  { code: 'fr', name: 'Français',       english: 'French',     dir: 'ltr' },
  { code: 'de', name: 'Deutsch',        english: 'German',     dir: 'ltr' },
  { code: 'ja', name: '日本語',           english: 'Japanese',   dir: 'ltr' },
  { code: 'tr', name: 'Türkçe',         english: 'Turkish',    dir: 'ltr' },
  { code: 'it', name: 'Italiano',       english: 'Italian',    dir: 'ltr' },
  { code: 'ko', name: '한국어',           english: 'Korean',     dir: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian', dir: 'ltr' },
  { code: 'vi', name: 'Tiếng Việt',     english: 'Vietnamese', dir: 'ltr' },
  { code: 'pl', name: 'Polski',         english: 'Polish',     dir: 'ltr' },
  { code: 'bn', name: 'বাংলা',           english: 'Bengali',    dir: 'ltr' },
];

export const DEFAULT_LANG = 'ru';
const CODES = new Set(LANGUAGES.map(l => l.code));

let current = DEFAULT_LANG;
let dict = {};
const listeners = new Set();

/** Язык браузера, приведённый к поддерживаемому. */
export function detectLanguage() {
  const prefs = (navigator.languages && navigator.languages.length)
    ? navigator.languages : [navigator.language || DEFAULT_LANG];
  for (const raw of prefs) {
    const base = String(raw).toLowerCase().split('-')[0];
    if (CODES.has(base)) return base;
    // Отдельные случаи, где базовый код не совпадает с нашим списком.
    if (base === 'be' || base === 'ky' || base === 'tg') return 'ru';
    if (base === 'pt') return 'pt';
    if (base === 'zh') return 'zh';
  }
  return DEFAULT_LANG;
}

export function currentLanguage() { return current; }
export function languageInfo(code = current) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
}

/** Загрузка словаря. Русский встроен: он и есть источник строк. */
export async function setLanguage(code) {
  const next = CODES.has(code) ? code : DEFAULT_LANG;
  if (next === DEFAULT_LANG) {
    dict = {};
  } else {
    try {
      const res = await fetch(`./src/i18n/locales/${next}.json`);
      dict = res.ok ? await res.json() : {};
    } catch {
      dict = {};                      // офлайн и без кэша — покажем русский
    }
  }
  current = next;
  const info = languageInfo(next);
  document.documentElement.lang = next;
  document.documentElement.dir = info.dir;
  for (const fn of listeners) fn(next);
  return next;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Перевод с подстановкой: t('Сегодня {n} из {goal} слов', { n: 3, goal: 10 })
 * Английские слова, которые учит человек, через t() не проходят никогда.
 */
export function t(ru, vars) {
  let out = (dict && dict[ru]) || ru;
  if (vars) {
    out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }
  return out;
}

/**
 * Множественное число. Русская форма задаётся тремя вариантами,
 * перевод может иметь свои правила — берём их из Intl.
 */
export function plural(n, forms) {
  const rules = pluralRules();
  const cat = rules ? rules.select(n) : fallbackSelect(n);
  const key = `${forms.key}#${cat}`;
  const translated = dict && dict[key];
  if (translated) return translated;
  // Русский источник: one / few / many
  const ruCat = fallbackSelect(n);
  return forms[ruCat] || forms.many || forms.other || '';
}

let _rules = null, _rulesLang = null;
function pluralRules() {
  if (_rulesLang !== current) {
    try { _rules = new Intl.PluralRules(current); } catch { _rules = null; }
    _rulesLang = current;
  }
  return _rules;
}

function fallbackSelect(n) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return 'many';
  if (b > 1 && b < 5) return 'few';
  if (b === 1) return 'one';
  return 'many';
}

/** Число с разделителем разрядов по правилам языка. */
export function num(n) {
  try { return new Intl.NumberFormat(current).format(n); }
  catch { return String(n); }
}
