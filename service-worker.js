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

const VERSION = 'v1';
const CACHE = `shodu-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/ui/tokens.css',
  './src/ui/base.css',
  './src/ui/session.css',
  './src/app.js',
  './src/core/storage.js',
  './src/core/day.js',
  './src/core/sound.js',
  './src/core/speech.js',
  './src/core/haptics.js',
  './src/core/motion.js',
  './src/core/confetti.js',
  './src/domain/srs.js',
  './src/domain/scoring.js',
  './src/domain/streak.js',
  './src/domain/challenge.js',
  './src/ui/store.js',
  './src/ui/router.js',
  './src/ui/reducer.js',
  './src/ui/dom.js',
  './src/ui/toast.js',
  './src/data/content.js',
  './src/domain/medals.js',
  './src/domain/referral.js',
  './src/core/sw-update.js',
  './src/screens/welcome.js',
  './src/screens/home.js',
  './src/screens/session.js',
  './src/screens/results.js',
  './src/screens/words.js',
  './src/screens/rules.js',
  './src/screens/profile.js',
  './data/words.json',
  './data/core-words.json',
  './data/rules.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon.svg',
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
