/* Роутер по хешу.
 *
 * Хеш, а не History API: приложение статическое и должно одинаково
 * работать и на своём домене, и в подкаталоге на GitHub Pages, где
 * серверного переписывания путей нет.
 *
 * Экран — это функция mount(root, ctx) → { destroy }. Никакого
 * виртуального дерева: разметка из шаблонов, обновление точечное.
 */

export function createRouter({ root, routes, fallback = 'home', onChange, onFail }) {
  let current = null;
  let currentName = null;
  let generation = 0;      // защита от гонки: побеждает последний переход

  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = raw.split('/');
    return { name: name || fallback, params: rest };
  }

  async function render() {
    const gen = ++generation;
    const { name, params } = parse();
    const factory = routes[name] || routes[fallback];
    if (!factory) return;

    if (currentName === name && current && current.update) {
      current.update(params);
      return;
    }

    if (current && current.destroy) {
      try { current.destroy(); } catch (err) { console.error('destroy', err); }
    }
    root.replaceChildren();

    /* Модуль экрана грузится по требованию, и загрузка может не
       состояться: оборвалась сеть, кэш переключается на новую сборку.
       Одна повторная попытка снимает почти все такие случаи; если и
       она не прошла, экран не должен остаться пустым молча. */
    let screen;
    try {
      screen = await factory();
    } catch {
      if (gen !== generation) return;
      try { screen = await factory(); }
      catch (err) {
        if (gen !== generation) return;
        if (onFail) onFail(name, err);
        return;
      }
    }

    // Пока грузился модуль, человек мог уйти дальше: тогда монтировать
    // уже нечего, иначе на экране окажутся два экрана сразу.
    if (gen !== generation) return;

    /* Падение при сборке экрана раньше уходило в отказ промиса и
       нигде не всплывало: человек видел пустоту и решал, что нажал
       не туда. Теперь это доходит до него вместе с выходом. */
    try {
      current = screen.mount(root, { params, go });
    } catch (err) {
      if (onFail) onFail(name, err);
      return;
    }
    currentName = name;
    if (onChange) onChange(name, params);
  }

  /* hashchange зовёт render напрямую, а он асинхронный: без этого
     обёртывания любой отказ внутри стал бы «необработанным». */
  function renderSafe() {
    return render().catch((err) => { if (onFail) onFail(parse().name, err); });
  }

  function go(route) {
    const next = '#/' + String(route).replace(/^#?\/?/, '');
    if (location.hash === next) renderSafe();
    else location.hash = next;
  }

  window.addEventListener('hashchange', renderSafe);
  return { render, go, get current() { return currentName; } };
}
