/* Точка входа. Собирает хранилище, стор, исполнителей эффектов и роутер. */

import { storage } from './core/storage.js';
import { today } from './core/day.js';
import { sound } from './core/sound.js';
import { speech } from './core/speech.js';
import { haptics } from './core/haptics.js';
import { setMotionLevel } from './core/motion.js';
import { confetti } from './core/confetti.js';
import { registerServiceWorker, hardReload, isReloading, takeUpdateBeforeBoot } from './core/sw-update.js';
import { loadContent } from './data/content.js';
import { readRefFromUrl } from './domain/referral.js';
import { watchPrompt } from './core/install.js';
import { detectLanguage, setLanguage, onLanguageChange, t } from './i18n/index.js';
import { createStore } from './ui/store.js';
import { createRouter } from './ui/router.js';
import { rootReducer } from './ui/reducer.js';
import { toast } from './ui/toast.js';
import { BUILD } from './core/version.js';

const root = document.getElementById('root');
const tabbar = document.getElementById('tabbar');

async function boot() {
  /* Если обновление уже готово — ставим его прежде всего и уходим:
     страница сейчас перезагрузится, и собирать нечего. */
  if (await takeUpdateBeforeBoot()) return;

  const state = storage.load();

  // Язык: сохранённый выбор человека, иначе язык браузера.
  await setLanguage(state.settings.lang || detectLanguage());

  applySettings(state.settings);
  localizeTabbar();
  onLanguageChange(localizeTabbar);

  const content = await loadContent();
  const store = createStore(state, rootReducer);
  window.__shodu = { store, content, storage };   // для отладки с телефона

  // Код приглашения снимается с адреса при самом первом открытии.
  store.dispatch({ type: 'REFERRAL_INIT', ref: readRefFromUrl(location.href) });

  wireEffects(store, content);
  wireStoragePersistence(store);
  wirePlatformWarnings();

  const router = createRouter({
    root,
    fallback: state.flags.onboarded ? 'home' : 'welcome',
    routes: {
      welcome: () => import('./screens/welcome.js').then(m => m.screen(store, content)),
      home:    () => import('./screens/home.js').then(m => m.screen(store, content)),
      session: () => import('./screens/session.js').then(m => m.screen(store, content)),
      phrase:  () => import('./screens/phrase.js').then(m => m.screen(store, content)),
      stream:  () => import('./screens/stream.js').then(m => m.screen(store, content)),
      recheck: () => import('./screens/recheck.js').then(m => m.screen(store, content)),
      quests:  () => import('./screens/quests.js').then(m => m.screen(store, content)),
      today:   () => import('./screens/today.js').then(m => m.screen(store, content)),
      install: () => import('./screens/install.js').then(m => m.screen(store, content)),
      results: () => import('./screens/results.js').then(m => m.screen(store, content)),
      words:   () => import('./screens/words.js').then(m => m.screen(store, content)),
      rules:   () => import('./screens/rules.js').then(m => m.screen(store, content)),
      profile: () => import('./screens/profile.js').then(m => m.screen(store, content)),
    },
    onChange: (name) => {
      const inSession = ['session', 'phrase', 'stream', 'welcome', 'results', 'recheck'].includes(name);
      tabbar.hidden = inSession;
      for (const el of tabbar.querySelectorAll('[data-tab]')) {
        el.toggleAttribute('aria-current', el.dataset.tab === name);
        if (el.dataset.tab === name) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      }
      if (!inSession) sound.screen();
    },
    /* Экран не загрузился дважды подряд. Это единственный случай,
       когда человек действительно упирается в пустоту, и здесь ему
       нужен не отчёт об ошибке, а выход. */
    onFail: () => {
      toast('Что-то не отозвалось. Прогресс на месте.', {
        action: { label: t('Перезапустить'), fn: () => hardReload() },
        sticky: true,
      });
    },
  });

  /* Пересчёт дня делается ДО первой отрисовки и до того, как что-то
     перезапишет state.day. Раньше день присваивался здесь же, и
     редьюсер выходил на первой строке: стрик не пересчитывался,
     жизни не восстанавливались. */
  store.dispatch({ type: 'DAY_TICK' });

  if (!location.hash) location.hash = state.flags.onboarded ? '#/home' : '#/welcome';
  await router.render();

  // Звук разблокируется первым же касанием: контекст стартует
  // приостановленным и не зазвучит без пользовательского жеста.
  const unlock = () => { sound.unlock(); speech.init(); };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  /* Браузер усыпляет звук после бездействия, поэтому будим его на
     каждом касании, а не только на первом. Это дешевле, чем ловить
     жалобы «через полчаса звук пропал». */
  document.addEventListener('pointerdown', () => sound.unlock(), { passive: true });

  // Предложение установки от браузера приходит один раз, поэтому его
  // ловим сразу и придерживаем до нужного экрана.
  watchPrompt();

  registerServiceWorker({
    onUpdateReady: (apply) => {
      toast('Доступна новая версия', {
        action: { label: t('Обновить'), fn: () => { storage.flush(); storage.flush(); apply(); } },
        sticky: true,
      });
    },
  });

  watchForBreakage();
}

/* Сторож молчащих поломок.
 *
 * Молчащая поломка — худшее, что может случиться: человек нажимает, и
 * ничего не происходит, а винит он себя. Настоящая поломка обязана
 * выйти на экран вместе с выходом из неё.
 *
 * Но сообщать о чужом шуме нельзя тем более. Первая версия сторожа
 * реагировала на любой отказ промиса и первым делом сообщила о беде
 * там, где её не было. Поэтому правило теперь узкое и проверяемое:
 * говорим только тогда, когда упал НАШ собственный код. Отказ из
 * чужого места, обрыв загрузки при уходе со страницы, шум браузера —
 * всё это записывается, но человека не трогает.
 *
 * Тот отчёт, ради которого сторож заводился, — нажатие, от которого
 * ничего не происходит, — это исключение из нашего обработчика, и оно
 * проходит фильтр целиком.
 */
const QUIET_MS = 2500;
const BOOTED_AT = Date.now();
const K_LAST_ERROR = 'shodu:lastError';

/** Падение пришло из нашего кода, а не из чужого места? */
function isOurs(reason, filename) {
  const from = String(filename || (reason && reason.stack) || '');
  if (!from) return false;
  return from.includes('/src/') || from.includes('/service-worker.js');
}

/* Обрыв загрузки при уходе со страницы. Браузеры называют это
   по-разному, поэтому список, а не одно имя. */
function isLoadAbort(reason) {
  const name = reason && reason.name;
  if (name === 'AbortError' || name === 'NetworkError') return true;
  const text = String((reason && (reason.message || reason)) || '');
  return /Importing a module script failed|Load failed|error loading dynamically imported module|NetworkError|cancell?ed|aborted/i.test(text);
}

/* Причина записывается всегда, даже когда мы молчим: без этого
   разбираться в отчёте «выскочило сообщение» нечем. Видно её в
   настройках, в разделе «Дополнительно». */
function remember(kind, reason, filename) {
  try {
    localStorage.setItem(K_LAST_ERROR, JSON.stringify({
      at: new Date().toISOString(),
      kind,
      build: BUILD,
      text: String((reason && (reason.stack || reason.message)) || reason || '').slice(0, 700),
      where: String(filename || '').slice(0, 200),
      shown: false,
    }));
  } catch { /* некуда записать — не страшно */ }
}

let breakageShown = false;
function watchForBreakage() {
  const handle = (kind, reason, filename) => {
    remember(kind, reason, filename);
    if (breakageShown) return;
    if (isReloading()) return;                       // мы сами перезагружаемся
    if (isLoadAbort(reason)) return;                 // страница уходит, это не беда
    if (Date.now() - BOOTED_AT < QUIET_MS) return;   // шум запуска
    if (!isOurs(reason, filename)) return;           // упало не у нас
    breakageShown = true;
    try { storage.flush(); } catch { /* сохранить не вышло — не страшно */ }
    try {
      const rec = JSON.parse(localStorage.getItem(K_LAST_ERROR) || '{}');
      rec.shown = true;
      localStorage.setItem(K_LAST_ERROR, JSON.stringify(rec));
    } catch { /* не записалось — не страшно */ }
    toast('Что-то не отозвалось. Прогресс на месте.', {
      action: { label: t('Перезапустить'), fn: () => hardReload() },
      sticky: true,
    });
  };

  window.addEventListener('error', (e) => {
    if (!e || !(e.error || e.message)) return;
    handle('error', e.error || e.message, e.filename);
  });
  window.addEventListener('unhandledrejection', (e) => handle('rejection', e && e.reason, ''));
  window.addEventListener('pagehide', () => { breakageShown = true; }, { once: true });
}

/* Подписи навигации живут в разметке, поэтому переводятся отдельно.
   Раньше они не попадали в каталог и на любом языке оставались русскими. */
function localizeTabbar() {
  const labels = { today: 'Сегодня', home: 'Дом', quests: 'Челлендж', words: 'Слова', rules: 'Правила', profile: 'Профиль' };
  for (const item of tabbar.querySelectorAll('[data-tab]')) {
    const node = item.querySelector('.tabbar__label');
    if (node) node.textContent = t(labels[item.dataset.tab] || '');
  }
}

function applySettings(s) {
  const html = document.documentElement;
  /* Купленный цвет применяется поверх токенов. Оттенки нажатия
     выводятся из него же, чтобы кнопка не выглядела плоской. */
  if (s.accent && s.accent !== 'a00') {
    import('./domain/shop.js').then(({ ACCENTS }) => {
      const found = ACCENTS.find(a => a.id === s.accent);
      if (!found) return;
      html.style.setProperty('--accent', found.color);
      html.style.setProperty('--accent-hover', found.color);
      html.style.setProperty('--btn-edge-accent', shade(found.color, -0.22));
      html.style.setProperty('--sh-accent-glow', `0 8px 26px ${found.color}55`);
    });
  } else {
    for (const v of ['--accent', '--accent-hover', '--btn-edge-accent', '--sh-accent-glow']) {
      html.style.removeProperty(v);
    }
  }
  html.setAttribute('data-theme', s.theme === 'auto' ? '' : s.theme);
  if (s.theme === 'auto') html.removeAttribute('data-theme');
  html.setAttribute('data-fontscale', s.fontScale || 'm');
  setMotionLevel(s.motion || 'full');
  sound.setEnabled(s.sound !== false);
  sound.setVolume(s.volume ?? 0.9);
  haptics.setEnabled(s.haptics !== false);
  speech.enabled = s.speech !== false;
  speech.rate = s.speechRate ?? 0.95;
}

/* Эффекты исполняются в одном месте. Редьюсеры остаются чистыми. */
function wireEffects(store, content) {
  store.onEffect('sound', (e) => { const f = sound[e.name]; if (typeof f === 'function') f.call(sound, e.arg); });
  store.onEffect('haptic', (e) => haptics.fire(e.name));
  store.onEffect('speak', (e) => speech.say(e.text, e.opts));
  store.onEffect('confetti', (e) => confetti.burst(e.opts || {}));
  store.onEffect('toast', (e) => {
    // Редьюсер чист и языка не знает: он передаёт ключ и подстановки,
    // а перевод и подстановок, и самой фразы делается здесь.
    let text = e.text;
    if (text && text.i18n) {
      const vars = { ...(text.vars || {}) };
      for (const k of (text.tr || [])) if (k in vars) vars[k] = t(String(vars[k]));
      text = t(text.i18n, vars);
    }
    toast(text, { kind: e.kind });
  });
  store.onEffect('navigate', (e) => { location.hash = '#/' + String(e.route).replace(/^#?\/?/, ''); });
  store.onEffect('save', () => storage.touch());
  store.onEffect('settings', () => applySettings(store.state.settings));
}

/* Состояние сохраняется отложенно, но обязательно перед уходом страницы. */
function wireStoragePersistence(store) {
  store.subscribe(s => s, () => {
    storage.state = store.state;
    storage.touch();
  });
  storage.addEventListener('nostorage', (e) => {
    toast(e.detail?.quota
      ? t('Слова на месте. Пока держу их только в этой вкладке.')
      : t('Браузер не даёт сохранять. Прогресс держится только в этой вкладке.'),
      { kind: 'warn', sticky: true });
  });
  storage.addEventListener('corrupt', () => {
    // Раньше битый документ означал молчаливую потерю: событие
    // отправлялось и никто его не слушал.
    toast(t('Часть записи не прочиталась. Взял последнюю целую копию.'), { kind: 'warn', ms: 7000 });
  });
  storage.addEventListener('readonly', () => {
    toast('Прогресс записан более новой версией приложения. Пока только чтение.', { kind: 'warn', sticky: true });
  });
  storage.addEventListener('external', () => {
    // Раньше показывался тост, а состояние оставалось прежним:
    // человек видел сообщение и никаких изменений.
    store.hydrate(storage.state);
    toast(t('Прогресс обновился в другой вкладке.'), { kind: 'info' });
  });
}

function wirePlatformWarnings() {
  // Синтезатор зависает после ухода вкладки в фон: отменяем принудительно.
  document.addEventListener('visibilitychange', () => { if (document.hidden) speech.cancel(); });
}

/** Затемнение цвета для нижней грани кнопки. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * (1 + amount));
  const g = clamp(((n >> 8) & 255) * (1 + amount));
  const b = clamp((n & 255) * (1 + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

boot().catch((err) => {
  console.error(err);
  root.innerHTML = `<div class="screen"><h1 class="t-h1">${t('Экран не собрался')}</h1>
    <p class="t-sm">${t('Прогресс на месте. Попробуй перезагрузить страницу.')}</p>
    <pre class="t-caption" style="white-space:pre-wrap">${String(err && err.message || err)}</pre></div>`;
});
