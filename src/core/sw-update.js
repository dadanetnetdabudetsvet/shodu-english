/* Регистрация service worker и предложение обновиться.
 * Обновление никогда не происходит само: старая вкладка не должна
 * перезагружаться под руками у человека посреди занятия. */

export function registerServiceWorker({ onUpdateReady } = {}) {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (location.protocol === 'file:') return Promise.resolve(null);

  return navigator.serviceWorker.register('./service-worker.js')
    .then((reg) => {
      if (reg.waiting) onUpdateReady?.(() => applyUpdate(reg));
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
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
