/* Регистрация service worker и обновление.
 *
 * Правило простое: на холодном запуске готовое обновление ставится
 * само, а найденное во время работы только предлагается.
 *
 * Почему само. Приложение с домашнего экрана отдаётся из кэша, и если
 * ждать, пока человек нажмёт «обновить», он может не увидеть это
 * предложение никогда — и останется со сломанной сборкой навсегда.
 * Именно так выглядел отчёт «выбираю слово, и ничего не происходит».
 *
 * Почему не во время работы. Перезагрузка под руками стирает то, что
 * человек делает прямо сейчас, и выглядит как поломка. Обновление,
 * найденное на ходу, ждёт следующего запуска или его согласия.
 */
function busyNow() {
  const h = String(location.hash || '');
  return /#\/(session|phrase|stream|recheck|welcome)/.test(h);
}

export function registerServiceWorker({ onUpdateReady } = {}) {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (location.protocol === 'file:') return Promise.resolve(null);

  return navigator.serviceWorker.register('./service-worker.js')
    .then((reg) => {
      if (reg.waiting) {
        if (busyNow()) onUpdateReady?.(() => applyUpdate(reg));
        else applyUpdate(reg);
      }
      // Проверяем обновление при каждом возврате в приложение.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // Найдено на ходу: только предлагаем. Само встанет при
          // следующем запуске.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdateReady?.(() => applyUpdate(reg));
          }
        });
      });
      return reg;
    })
    .catch(() => null);
}

let reloading = false;
function applyUpdate(reg) {
  if (!reg.waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;              // ровно одна перезагрузка
    location.reload();
  });
  reg.waiting.postMessage('SKIP_WAITING');
}

/* Аварийный выход.
 *
 * Если сборка всё-таки оказалась битой, человек не должен оставаться
 * с экраном, который не отвечает на нажатия. Сносим кэш и рабочий
 * процесс целиком и загружаемся с нуля. Прогресс лежит в localStorage
 * и в IndexedDB — их мы не трогаем, поэтому терять нечего.
 */
export async function hardReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => {})));
    }
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n).catch(() => {})));
    }
  } catch { /* даже если не вышло — перезагружаемся */ }
  location.reload();
}
