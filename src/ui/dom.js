import { t, currentLanguage } from '../i18n/index.js';
/* Маленькие помощники вместо фреймворка. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Английский текст обязан нести lang="en", иначе синтезатор читает по-русски. */
export function en(text, cls = '') {
  return el('span', { class: cls, lang: 'en', text });
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/* Формы проходят через переводчик по одной: подстановка русского
   литерала внутрь переводимой строки оставила бы русский хвост
   в любом языке. */
export const words = (n) => t('{v0} {v1}', { v0: n, v1: plural(n, t('слово'), t('слова'), t('слов')) });
export const days = (n) => t('{v0} {v1}', { v0: n, v1: plural(n, t('день'), t('дня'), t('дней')) });

export function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? t('Доброй ночи') : h < 12 ? t('Доброе утро') : h < 18 ? t('Добрый день') : t('Добрый вечер');
  // Разделитель тоже переводится: в китайском и японском запятая своя.
  return name ? t('{v0}, {v1}', { v0: part, v1: name }) : part;
}

export function fmtMinutes(ms) {
  const m = Math.round(ms / 60000);
  return t('{v0} {v1}', { v0: m, v1: plural(m, t('минута'), t('минуты'), t('минут')) });
}

/** Ловушка фокуса для шторок и модальных окон. */
export function trapFocus(container) {
  const sel = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll(sel)].filter(x => !x.disabled && x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

/**
 * Безопасная замена содержимого.
 *
 * Родной replaceChildren принимает узлы и строки, а всё остальное
 * приводит к строке: `null` превращается в видимое слово «null».
 * Условная вёрстка вида `cond ? el(...) : null` из-за этого печатала
 * мусор прямо в интерфейсе.
 */
export function setChildren(node, ...children) {
  node.replaceChildren(
    ...children.flat().filter(c => c != null && c !== false && c !== '')
  );
  return node;
}
