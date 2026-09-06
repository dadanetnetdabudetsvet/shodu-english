/* Тактильный отклик. Работает только там, где есть Vibration API,
 * то есть практически только на Android. На iOS в вебе вибрации нет,
 * поэтому переключатель в настройках прячется, а не показывается серым. */

const PATTERNS = {
  light: 10,
  select: [8],
  correct: [12],
  wrong: [18, 40, 18],
  levelUp: [10, 30, 10, 30, 24],
  medal: [14, 26, 14],
};

class Haptics {
  constructor() {
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    this.enabled = true;
  }
  setEnabled(on) { this.enabled = !!on; }
  fire(name) {
    if (!this.supported || !this.enabled) return;
    const p = PATTERNS[name];
    if (p == null) return;
    try { navigator.vibrate(p); } catch { /* браузер отказал, это не ошибка */ }
  }
}

export const haptics = new Haptics();
