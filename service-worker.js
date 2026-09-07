/* Service worker. Обязательно лежит в корне, иначе сузится область действия.
 *
 * Стратегия: предварительное кэширование оболочки и выдача из кэша.
 * Стратегия «отдать из кэша, обновить в фоне» для скриптов и стилей
 * НЕ используется: она может отдать старый JavaScript вместе с новым CSS.
 *
 * Против залипания версии: сюда не вписан вызов skipWaiting. Страница
 * увидит ожидающего работника, покажет предложение обновиться, и только
 * по нажатию человека пришлёт сообщение.
 */

const VERSION = 'v09c754eed9';
const CACHE = `shodu-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/app.js',
  './src/core/confetti.js',
  './src/core/day.js',
  './src/core/haptics.js',
  './src/core/mood.js',
  './src/core/motion.js',
  './src/core/sound.js',
  './src/core/speech.js',
  './src/core/storage.js',
  './src/core/sw-update.js',
  './src/data/content.js',
  './src/domain/challenge.js',
  './src/domain/keys.js',
  './src/domain/medals.js',
  './src/domain/phrase.js',
  './src/domain/quests.js',
  './src/domain/referral.js',
  './src/domain/scoring.js',
  './src/domain/shop.js',
  './src/domain/srs.js',
  './src/domain/streak.js',
  './src/domain/stream.js',
  './src/domain/today.js',
  './src/i18n/catalog.json',
  './src/i18n/index.js',
  './src/i18n/locales/ar.json',
  './src/i18n/locales/bn.json',
  './src/i18n/locales/de.json',
  './src/i18n/locales/en.json',
  './src/i18n/locales/es.json',
  './src/i18n/locales/fr.json',
  './src/i18n/locales/hi.json',
  './src/i18n/locales/id.json',
  './src/i18n/locales/it.json',
  './src/i18n/locales/ja.json',
  './src/i18n/locales/kk.json',
  './src/i18n/locales/ko.json',
  './src/i18n/locales/pl.json',
  './src/i18n/locales/pt.json',
  './src/i18n/locales/tr.json',
  './src/i18n/locales/uk.json',
  './src/i18n/locales/uz.json',
  './src/i18n/locales/vi.json',
  './src/i18n/locales/zh.json',
  './src/screens/home.js',
  './src/screens/phrase.js',
  './src/screens/profile.js',
  './src/screens/quests.js',
  './src/screens/recheck.js',
  './src/screens/results.js',
  './src/screens/rules.js',
  './src/screens/session.js',
  './src/screens/stream.js',
  './src/screens/today.js',
  './src/screens/welcome.js',
  './src/screens/words.js',
  './src/ui/anim.css',
  './src/ui/base.css',
  './src/ui/dom.js',
  './src/ui/reducer.js',
  './src/ui/router.js',
  './src/ui/session.css',
  './src/ui/store.js',
  './src/ui/toast.js',
  './src/ui/tokens.css',
  './data/core-words.json',
  './data/deck-index.json',
  './data/deck3-cognates.json',
  './data/deck4-actions.json',
  './data/deck5-nouns.json',
  './data/deck6-topup.json',
  './data/rules.json',
  './data/words.json',
  './assets/icons/apple-touch-icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon.svg',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // Кэшируем по одному: один недоступный файл не должен валить установку.
      Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    // Забираем управление сразу, чтобы офлайн работал с первой загрузки,
    // а не со второй.
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
      }
      return res;
    } catch {
      // Навигация без сети отдаёт оболочку: данные всё равно на устройстве.
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return new Response('Нет сети', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
