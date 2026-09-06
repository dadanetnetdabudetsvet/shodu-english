/* Точка входа. Собирает хранилище, стор, исполнителей эффектов и роутер. */

import { storage } from './core/storage.js';
import { today, reconcileDay } from './core/day.js';
import { sound } from './core/sound.js';
import { speech } from './core/speech.js';
import { haptics } from './core/haptics.js';
import { setMotionLevel } from './core/motion.js';
import { confetti } from './core/confetti.js';
import { registerServiceWorker } from './core/sw-update.js';
import { loadContent } from './data/content.js';
import { createStore } from './ui/store.js';
import { createRouter } from './ui/router.js';
import { rootReducer } from './ui/reducer.js';
import { toast } from './ui/toast.js';

const root = document.getElementById('root');
const tabbar = document.getElementById('tabbar');

async function boot() {
  const state = storage.load();
  state.day = reconcileDay(state.day, today());

  applySettings(state.settings);

  const content = await loadContent();
  const store = createStore(state, rootReducer);
  window.__shodu = { store, content, storage };   // для отладки с телефона

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
      results: () => import('./screens/results.js').then(m => m.screen(store, content)),
      words:   () => import('./screens/words.js').then(m => m.screen(store, content)),
      rules:   () => import('./screens/rules.js').then(m => m.screen(store, content)),
      profile: () => import('./screens/profile.js').then(m => m.screen(store, content)),
    },
    onChange: (name) => {
      const inSession = name === 'session' || name === 'welcome' || name === 'results';
      tabbar.hidden = inSession;
      for (const el of tabbar.querySelectorAll('[data-tab]')) {
        el.toggleAttribute('aria-current', el.dataset.tab === name);
        if (el.dataset.tab === name) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      }
      if (!inSession) sound.screen();
    },
  });

  if (!location.hash) location.hash = state.flags.onboarded ? '#/home' : '#/welcome';
  await router.render();

  // Звук разблокируется первым же касанием: контекст стартует
  // приостановленным и не зазвучит без пользовательского жеста.
  const unlock = () => { sound.unlock(); speech.init(); };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  registerServiceWorker({
    onUpdateReady: (apply) => {
      toast('Доступна новая версия', {
        action: { label: 'Обновить', fn: () => { storage.flush(); storage.flush(); apply(); } },
        sticky: true,
      });
    },
  });
}

function applySettings(s) {
  const html = document.documentElement;
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
  store.onEffect('toast', (e) => toast(e.text, { kind: e.kind }));
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
      ? 'Память браузера переполнена. Прогресс держится только в этой вкладке.'
      : 'Браузер не даёт сохранять. Прогресс держится только в этой вкладке.',
      { kind: 'warn', sticky: true });
  });
  storage.addEventListener('readonly', () => {
    toast('Прогресс записан более новой версией приложения. Пока только чтение.', { kind: 'warn', sticky: true });
  });
  storage.addEventListener('external', () => {
    toast('Прогресс обновился в другой вкладке.', { kind: 'info' });
  });
}

function wirePlatformWarnings() {
  // Синтезатор зависает после ухода вкладки в фон: отменяем принудительно.
  document.addEventListener('visibilitychange', () => { if (document.hidden) speech.cancel(); });
}

boot().catch((err) => {
  console.error(err);
  root.innerHTML = `<div class="screen"><h1 class="t-h1">Что-то пошло не так</h1>
    <p class="t-sm">Прогресс на месте. Попробуй перезагрузить страницу.</p>
    <pre class="t-caption" style="white-space:pre-wrap">${String(err && err.message || err)}</pre></div>`;
});
