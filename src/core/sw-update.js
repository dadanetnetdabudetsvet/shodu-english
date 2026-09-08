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

/* Готовое обновление ставится ДО того, как приложение что-то соберёт.
 *
 * Раньше это делалось по ходу загрузки, и перезагрузка обрывала уже
 * запущенные загрузки модулей: они давали отказы промисов, а сторож
 * ошибок принимал их за поломку и пугал человека на ровном месте.
 * Теперь если обновление ждёт — мы просто не начинаем работу.
 *
 * Возвращает true, если страница сейчас перезагрузится: вызывающий
 * должен остановиться и ничего не рисовать.
 */
export async function takeUpdateBeforeBoot() {
  if (!('serviceWorker' in navigator)) return false;
  if (location.protocol === 'file:') return false;
  if (busyNow()) return false;

  if (reloadedRecently()) return false;

  let reg;
  try { reg = await navigator.serviceWorker.getRegistration(); }
  catch { return false; }
  if (!reg || !reg.waiting) return false;
  try { if (!(await isRealUpdate(reg))) return false; }
  catch { return false; }

  /* Ждём смены управляющего worker'а, но не бесконечно. Если она по
     какой-то причине не случится, лучше запуститься на прежней
     сборке, чем оставить человека перед пустым экраном: пустой экран
     хуже старой версии. */
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      markReload();
      finish(true);
      location.reload();
    }, { once: true });

    setTimeout(() => { switching = false; finish(false); }, SWAP_TIMEOUT);

    switching = true;
    try { reg.waiting.postMessage('SKIP_WAITING'); }
    catch { switching = false; finish(false); }
  });
}

export function registerServiceWorker({ onUpdateReady } = {}) {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (location.protocol === 'file:') return Promise.resolve(null);

  return navigator.serviceWorker.register('./service-worker.js')
    .then((reg) => {
      // Ожидающее обновление уже разобрано в takeUpdateBeforeBoot.
      // Здесь остаётся только случай, когда идёт занятие.
      if (reg.waiting && busyNow()) {
        isRealUpdate(reg)
          .then((real) => { if (real) onUpdateReady?.(() => applyUpdate(reg)); })
          .catch(() => { /* не смогли сверить версии — молчим */ });
      }
      // Проверяем обновление при каждом возврате в приложение.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) { try { reg.update().catch(() => {}); } catch { /* нечего проверять */ } }
      });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state !== 'installed' || !navigator.serviceWorker.controller) return;
          /* Обновление, найденное на ходу, само встанет при следующем
             запуске — молча. Предлагаем его вслух только если идёт
             занятие: там следующий запуск может быть не скоро, а
             человек имеет право решить сам. В остальных случаях
             сообщение о версиях — лишний шум. */
          if (!busyNow()) return;
          isRealUpdate(reg)
            .then((real) => { if (real) onUpdateReady?.(() => applyUpdate(reg)); })
            .catch(() => { /* не смогли сверить версии — молчим */ });
        });
      });
      return reg;
    })
    .catch(() => null);
}

/* Версия у рабочего процесса спрашивается напрямую.
 *
 * Файл service-worker.js раздаётся с нескольких узлов, и во время
 * выкладки соседние запросы могут вернуть разные копии. Браузер видит
 * отличие в байтах и объявляет обновление — даже когда это та же
 * сборка или откат к прежней. Без сверки версий приложение уходит в
 * круг «обновись — перезагрузись», и заниматься в нём невозможно.
 */
function versionOf(worker) {
  return new Promise((resolve) => {
    if (!worker) return resolve(null);
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => finish(e.data || null);
      worker.postMessage('VERSION', [ch.port2]);
      setTimeout(() => finish(null), 1200);
    } catch { finish(null); }
  });
}

/* Обновление настоящее, только если версия действительно другая.
   Неизвестную версию считаем настоящей: старый worker про VERSION не
   знает, и застрять на нём хуже, чем лишний раз перезагрузиться. */
async function isRealUpdate(reg) {
  if (!reg || !reg.waiting) return false;
  const [next, now] = await Promise.all([
    versionOf(reg.waiting),
    versionOf(reg.active || navigator.serviceWorker.controller),
  ]);
  if (next && now && next === now) return false;
  return true;
}

/* Две перезагрузки подряд — признак круга. Тогда останавливаемся и
   работаем на том, что есть: старая сборка лучше карусели. */
function reloadedRecently() {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_GUARD) || 0);
    return at && Date.now() - at < RELOAD_MIN_GAP;
  } catch { return false; }
}
function markReload() {
  try { sessionStorage.setItem(RELOAD_GUARD, String(Date.now())); } catch { /* некуда */ }
}

/* Пока идёт наша собственная перезагрузка, страница разбирается на
 * ходу: незавершённые загрузки модулей обрываются и дают отказы
 * промисов. Это не поломка, а нормальный конец жизни страницы, и
 * сторож ошибок должен об этом знать — иначе он сообщит человеку о
 * несуществующей беде ровно в тот момент, когда всё как раз чинится.
 */
const SWAP_TIMEOUT = 2000;   // дольше ждать нельзя: человек смотрит в пустоту
const RELOAD_GUARD = 'shodu:reloadedAt';
const RELOAD_MIN_GAP = 20000;  // две перезагрузки подряд — это уже круг
let switching = false;
let reloading = false;

export function isReloading() { return switching || reloading; }

function applyUpdate(reg) {
  if (!reg.waiting) return;
  switching = true;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;              // ровно одна перезагрузка
    markReload();
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
  switching = true;
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
