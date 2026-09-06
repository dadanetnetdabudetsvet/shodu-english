/* Стор с редьюсером. Без фреймворка.
 *
 * Ключевое решение из технического аудита: редьюсер возвращает не только
 * новое состояние, но и массив ДЕКЛАРАТИВНЫХ эффектов — {type:'sound'},
 * {type:'anim'}, {type:'haptic'}. Домен остаётся чистым и тестируемым,
 * а звук и анимация исполняются снаружи, в одном месте.
 *
 * Время не берётся внутри редьюсера. Оно приходит в действии полем at.
 */

export function createStore(initialState, reducer) {
  let state = initialState;
  const subs = new Set();
  const effectHandlers = new Map();

  function dispatch(action) {
    const at = action.at ?? Date.now();
    const result = reducer(state, { ...action, at });
    const next = result && result.state !== undefined ? result.state : result;
    const effects = (result && result.effects) || [];

    if (next !== state) {
      const prev = state;
      state = next;
      for (const s of subs) notify(s, prev, state);
    }
    for (const e of effects) runEffect(e);
    return effects;
  }

  function notify(sub, prev, next) {
    const a = sub.selector(prev);
    const b = sub.selector(next);
    if (!shallowEqual(a, b)) sub.fn(b, a);
  }

  function runEffect(effect) {
    const h = effectHandlers.get(effect.type);
    if (h) { try { h(effect); } catch (err) { console.error('эффект', effect.type, err); } }
  }

  return {
    get state() { return state; },
    dispatch,
    /** Подписка на срез состояния с поверхностным сравнением. */
    subscribe(selector, fn, { immediate = false } = {}) {
      const sub = { selector, fn };
      subs.add(sub);
      if (immediate) fn(selector(state), undefined);
      return () => subs.delete(sub);
    },
    /** Регистрация исполнителя эффектов: звук, вибрация, анимация. */
    onEffect(type, handler) { effectHandlers.set(type, handler); },
    /** Прямая замена состояния: только для загрузки из хранилища. */
    hydrate(next) {
      const prev = state;
      state = next;
      for (const s of subs) notify(s, prev, state);
    },
  };
}

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}

/** Составление редьюсеров по ключу состояния. */
export function combine(map) {
  return (state, action) => {
    let changed = false;
    const next = { ...state };
    const effects = [];
    for (const [key, fn] of Object.entries(map)) {
      const res = fn(state[key], action, state);
      const slice = res && res.state !== undefined ? res.state : res;
      if (res && res.effects) effects.push(...res.effects);
      if (slice !== state[key]) { next[key] = slice; changed = true; }
    }
    return { state: changed ? next : state, effects };
  };
}

/* Готовые конструкторы эффектов, чтобы не разъезжались строки типов. */
export const fx = {
  sound: (name, arg) => ({ type: 'sound', name, arg }),
  haptic: (name) => ({ type: 'haptic', name }),
  anim: (name, target, arg) => ({ type: 'anim', name, target, arg }),
  speak: (text, opts) => ({ type: 'speak', text, opts }),
  confetti: (opts) => ({ type: 'confetti', opts }),
  save: () => ({ type: 'save' }),
  toast: (text, kind) => ({ type: 'toast', text, kind }),
  navigate: (route) => ({ type: 'navigate', route }),
};
