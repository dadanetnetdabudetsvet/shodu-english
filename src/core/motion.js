/* Обёртка над Web Animations API с уважением к настройке движения.
 *
 * Ключевое решение: при уменьшенной анимации мы НЕ отменяем анимацию,
 * а сжимаем её до 1 мс. Иначе промис завершения не сработает и логика,
 * которая его ждёт, сломается. Уменьшенная анимация — это замена канала
 * обратной связи, а не её отсутствие.
 *
 * will-change навешивается только на время анимации: два десятка
 * постоянных композиторских слоёв заметно тормозят прокрутку.
 */

let level = 'full'; // full | calm | off

export function setMotionLevel(next) {
  level = ['full', 'calm', 'off'].includes(next) ? next : 'full';
  document.documentElement.setAttribute('data-motion', level);
}

export function getMotionLevel() { return level; }

export function prefersReduced() {
  if (level === 'off') return true;
  if (level === 'full') return false;
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scaleTiming(timing) {
  const t = typeof timing === 'number' ? { duration: timing } : { ...timing };
  if (level === 'off') { t.duration = 1; t.delay = 0; t.easing = 'linear'; return t; }
  if (level === 'calm') {
    t.duration = Math.max(1, (t.duration || 300) * 0.6);
    t.delay = (t.delay || 0) * 0.6;
    if (t.easing && /cubic-bezier\(\s*\.?34/.test(t.easing)) t.easing = 'cubic-bezier(.4,0,.2,1)';
  }
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && level !== 'full') {
    t.duration = 1; t.delay = 0; t.easing = 'linear';
  }
  return t;
}

/** Запустить анимацию. Всегда возвращает промис, даже если движение выключено. */
export function animate(el, keyframes, timing) {
  if (!el || !el.animate) return Promise.resolve();
  const t = scaleTiming(timing);
  el.classList.add('is-animating');
  let anim;
  try {
    anim = el.animate(keyframes, t);
  } catch {
    el.classList.remove('is-animating');
    return Promise.resolve();
  }
  return anim.finished
    .catch(() => {})
    .finally(() => el.classList.remove('is-animating'));
}

/** Каскадное появление списка. Задержка между элементами в мс. */
export function stagger(els, keyframes, timing, step = 50) {
  return Promise.all(Array.from(els).map((el, i) =>
    animate(el, keyframes, { ...(typeof timing === 'number' ? { duration: timing } : timing),
                             delay: ((timing && timing.delay) || 0) + i * step })));
}

/* Готовые рецепты из раздела 6.3 спецификации. */

const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
const QUINT = 'cubic-bezier(.22,1,.36,1)';

/** A1: появление карточки вопроса. */
export function enterCard(el) {
  return animate(el, [
    { opacity: 0, transform: 'translateY(24px) scale(.94)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 340, easing: SPRING, fill: 'both' });
}

/** A2: каскадное появление вариантов ответа. */
export function enterOptions(els) {
  return stagger(els, [
    { opacity: 0, transform: 'translateY(80px)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 260, easing: SPRING, fill: 'both' }, 50);
}

/** A3: нажатие. */
export function pressDown(el) {
  return animate(el, [{ transform: 'scale(1)' }, { transform: 'scale(.965)' }],
    { duration: 90, easing: 'cubic-bezier(.2,0,0,1)', fill: 'forwards' });
}
export function pressUp(el) {
  return animate(el, [{ transform: 'scale(.965)' }, { transform: 'scale(1)' }],
    { duration: 140, easing: SPRING, fill: 'forwards' });
}

/** A4: пружина верного ответа. */
export function popCorrect(el) {
  return animate(el, [
    { transform: 'scale(1)' }, { transform: 'scale(1.06)' },
    { transform: 'scale(.98)' }, { transform: 'scale(1)' },
  ], { duration: 420, easing: SPRING });
}

/** A5: шейк ошибки. Около 7 Гц с затуханием 0.72. Экран не краснеет целиком. */
export function shakeWrong(el) {
  if (prefersReduced()) {
    // Замена канала: без сдвига, но с заметной вспышкой рамки.
    return animate(el, [{ opacity: 1 }, { opacity: .55 }, { opacity: 1 }], { duration: 220 });
  }
  return animate(el, [
    { transform: 'translateX(0)' },   { transform: 'translateX(-10px)', offset: .14 },
    { transform: 'translateX(9px)',  offset: .28 }, { transform: 'translateX(-7px)', offset: .44 },
    { transform: 'translateX(5px)',  offset: .60 }, { transform: 'translateX(-3px)', offset: .78 },
    { transform: 'translateX(0)' },
  ], { duration: 400, easing: 'linear' });
}

/** A7: всплеск множителя комбо. */
export function popCombo(el) {
  return animate(el, [
    { transform: 'scale(0) rotate(-8deg)', opacity: 0 },
    { transform: 'scale(1.25) rotate(0deg)', opacity: 1, offset: .6 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
  ], { duration: 460, easing: 'cubic-bezier(.68,-.55,.27,1.55)' });
}

/** A8: заполнение полосы прогресса. */
export function fillBar(el, from, to) {
  return animate(el, [
    { transform: `scaleX(${from})` }, { transform: `scaleX(${to})` },
  ], { duration: 640, easing: QUINT, delay: 180, fill: 'forwards' });
}

/** A12: pop-in эмодзи на финальном экране. */
export function popIn(el) {
  return animate(el, [
    { transform: 'scale(0) rotate(-12deg)', opacity: 0 },
    { transform: 'scale(1.3) rotate(6deg)', opacity: 1, offset: .55 },
    { transform: 'scale(.92) rotate(0deg)', offset: .8 },
    { transform: 'scale(1) rotate(0deg)' },
  ], { duration: 620, easing: 'cubic-bezier(.68,-.55,.27,1.55)', delay: 120, fill: 'both' });
}

/** A9: анимированный счёт числа. Табличные цифры обязательны в CSS. */
export function tweenNumber(el, from, to, duration = 900, format = (v) => String(v)) {
  if (!el) return Promise.resolve();
  if (level === 'off') { el.textContent = format(to); return Promise.resolve(); }
  const dur = level === 'calm' ? duration * 0.6 : duration;
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(2, -10 * p);           // easeOutExpo
      el.textContent = format(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
      else { el.textContent = format(to); resolve(); }
    };
    requestAnimationFrame(tick);
  });
}
