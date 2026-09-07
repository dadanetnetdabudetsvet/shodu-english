/* Определение платформы для инструкции по установке.
 *
 * Способ поставить приложение на домашний экран отличается на каждой
 * связке система плюс браузер, и универсальной инструкции не бывает.
 * Показать не тот путь хуже, чем не показать никакого: человек честно
 * ищет кнопку, которой у него нет, и делает вывод, что не справился.
 */

export function platform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  // На iOS все браузеры используют движок Safari, поэтому отличать их
  // приходится по названию, а не по возможностям.
  const iosOtherBrowser = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua);
  const isSamsung = /SamsungBrowser/.test(ua);
  const isFirefox = /Firefox/.test(ua) && !isIOS;

  if (installed()) return 'installed';
  if (isIOS && iosOtherBrowser) return 'ios-other';
  if (isIOS) return 'ios';
  if (isAndroid && isSamsung) return 'samsung';
  if (isAndroid && isFirefox) return 'firefox-android';
  if (isAndroid) return 'android';
  return 'desktop';
}

/** Уже стоит на домашнем экране. */
export function installed() {
  if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) return true;
  if (navigator.standalone) return true;
  try { return new URL(location.href).searchParams.get('src') === 'pwa'; }
  catch { return false; }
}

/* Android умеет предложить установку сам. Событие приходит один раз,
   поэтому его надо поймать заранее и придержать. */
let deferred = null;
export function watchPrompt(onReady) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (onReady) onReady();
  });
  window.addEventListener('appinstalled', () => { deferred = null; });
}

export function canPrompt() { return !!deferred; }

export async function prompt() {
  if (!deferred) return false;
  deferred.prompt();
  const res = await deferred.userChoice.catch(() => null);
  deferred = null;
  return !!(res && res.outcome === 'accepted');
}

/* Шаги по платформам. Каждый шаг рисуется схемой экрана, а не
   скриншотом: настоящий снимок чужой системы мы сделать не можем,
   а схема показывает то же самое и не устаревает с версией. */
export const STEPS = {
  ios: {
    title: 'На айфоне это три касания',
    note: 'Работает только в Safari. В других браузерах кнопки нет — это ограничение самой системы.',
    steps: [
      { art: 'share', text: 'Нажми «Поделиться» — квадрат со стрелкой вверх, внизу экрана.' },
      { art: 'list', text: 'Пролистай список вниз до пункта «На экран “Домой”».' },
      { art: 'add', text: 'Нажми «Добавить» в правом верхнем углу.' },
    ],
  },
  'ios-other': {
    title: 'Сначала открой в Safari',
    note: 'На айфоне добавить на домашний экран умеет только Safari. Это ограничение системы, а не браузера.',
    steps: [
      { art: 'copy', text: 'Скопируй ссылку кнопкой ниже.' },
      { art: 'safari', text: 'Открой Safari и вставь ссылку в адресную строку.' },
      { art: 'share', text: 'Дальше «Поделиться» → «На экран “Домой”» → «Добавить».' },
    ],
  },
  android: {
    title: 'На андроиде это два касания',
    note: 'Если появится кнопка «Установить», можно нажать прямо здесь.',
    steps: [
      { art: 'menu', text: 'Нажми три точки в правом верхнем углу браузера.' },
      { art: 'install', text: 'Выбери «Установить приложение» или «Добавить на главный экран».' },
      { art: 'add', text: 'Подтверди кнопкой «Установить».' },
    ],
  },
  samsung: {
    title: 'В браузере Samsung это два касания',
    note: '',
    steps: [
      { art: 'menu', text: 'Нажми три полоски внизу справа.' },
      { art: 'install', text: 'Выбери «Добавить страницу на» → «Главный экран».' },
      { art: 'add', text: 'Подтверди кнопкой «Добавить».' },
    ],
  },
  'firefox-android': {
    title: 'В Firefox это два касания',
    note: '',
    steps: [
      { art: 'menu', text: 'Нажми три точки справа от адресной строки.' },
      { art: 'install', text: 'Выбери «Установить».' },
      { art: 'add', text: 'Подтверди кнопкой «Добавить».' },
    ],
  },
  desktop: {
    title: 'На компьютере это одно нажатие',
    note: 'Приложение откроется в своём окне, без вкладок и адресной строки.',
    steps: [
      { art: 'urlbar', text: 'Нажми значок установки справа в адресной строке.' },
      { art: 'install', text: 'Или открой меню браузера и найди «Установить».' },
      { art: 'add', text: 'Подтверди кнопкой «Установить».' },
    ],
  },
  installed: {
    title: 'Уже стоит',
    note: 'Приложение открыто с домашнего экрана. Слова живут дольше именно так.',
    steps: [],
  },
};
