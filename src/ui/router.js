/* Роутер по хешу.
 *
 * Хеш, а не History API: приложение статическое и должно одинаково
 * работать и на своём домене, и в подкаталоге на GitHub Pages, где
 * серверного переписывания путей нет.
 *
 * Экран — это функция mount(root, ctx) → { destroy }. Никакого
 * виртуального дерева: разметка из шаблонов, обновление точечное.
 */

export function createRouter({ root, routes, fallback = 'home', onChange }) {
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

    const screen = await factory();
    // Пока грузился модуль, человек мог уйти дальше: тогда монтировать
    // уже нечего, иначе на экране окажутся два экрана сразу.
    if (gen !== generation) return;
    current = screen.mount(root, { params, go });
    currentName = name;
    if (onChange) onChange(name, params);
  }

  function go(route) {
    const next = '#/' + String(route).replace(/^#?\/?/, '');
    if (location.hash === next) render();
    else location.hash = next;
  }

  window.addEventListener('hashchange', render);
  return { render, go, get current() { return currentName; } };
}
