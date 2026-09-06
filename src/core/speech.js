/* Произношение английских слов через SpeechSynthesis.
 *
 * Три известные ловушки, все обойдены здесь:
 *  1. getVoices() возвращает пустой массив при первом вызове, а на iOS
 *     событие voiceschanged иногда не приходит вовсе — поэтому и подписка,
 *     и опрос: 20 попыток по 150 мс.
 *  2. Назначение конкретного голоса на iOS часто игнорируется — на это
 *     не закладываемся, просто задаём lang и надеемся на лучшее.
 *  3. Синтезатор зависает в состоянии «говорю» навсегда после ухода
 *     вкладки в фон — отменяем по visibilitychange.
 *
 * Фолбэк не запасной, а основной инструмент: транскрипция под словом
 * читается всегда, кнопка озвучки скрывается, если синтез недоступен.
 */

const POLL_TRIES = 20;
const POLL_MS = 150;
const SAFETY_MS = 6000;

class Speech {
  constructor() {
    this.supported = typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && typeof SpeechSynthesisUtterance !== 'undefined';
    this.voice = null;
    this.rate = 0.95;
    this.enabled = true;
    this.failed = false;          // после первой ошибки прячем кнопку до конца сессии
    this._ready = null;
    this._safetyTimer = null;
  }

  /** Ждём появления голосов. Резолвится всегда, даже если голосов нет. */
  init() {
    if (!this.supported) return Promise.resolve(false);
    if (this._ready) return this._ready;

    this._ready = new Promise((resolve) => {
      let tries = 0;
      const pick = () => {
        const voices = window.speechSynthesis.getVoices() || [];
        if (!voices.length) return false;
        this.voice = this._pickEnglish(voices);
        return true;
      };
      const tick = () => {
        if (pick()) { resolve(true); return; }
        if (++tries >= POLL_TRIES) { resolve(false); return; }
        setTimeout(tick, POLL_MS);
      };
      try {
        window.speechSynthesis.addEventListener('voiceschanged', () => {
          if (pick()) resolve(true);
        }, { once: true });
      } catch { /* старые движки без addEventListener на объекте */ }
      tick();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
    });

    return this._ready;
  }

  _pickEnglish(voices) {
    const en = voices.filter(v => /^en([-_]|$)/i.test(v.lang || ''));
    if (!en.length) return null;
    // Порядок предпочтения: локальный британский, локальный любой английский,
    // затем что угодно английское. Локальные не требуют сети.
    const score = (v) => {
      let s = 0;
      if (v.localService) s += 4;
      if (/^en[-_]GB/i.test(v.lang)) s += 3;
      else if (/^en[-_]US/i.test(v.lang)) s += 2;
      if (/(samantha|daniel|karen|moira|serena|google uk)/i.test(v.name || '')) s += 2;
      return s;
    };
    return en.sort((a, b) => score(b) - score(a))[0];
  }

  get available() {
    return this.supported && !this.failed;
  }

  /** Произнести слово. Возвращает промис, который резолвится по окончании. */
  say(text, { rate = null } = {}) {
    if (!this.available || !this.enabled || !text) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(this._safetyTimer);
        resolve(ok);
      };
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text));
        u.lang = (this.voice && this.voice.lang) || 'en-GB';
        if (this.voice) u.voice = this.voice;
        u.rate = rate == null ? this.rate : rate;
        u.pitch = 1;
        u.onend = () => finish(true);
        u.onerror = () => { this.failed = true; finish(false); };
        // Страховка на случай, когда не приходят ни onend, ни onerror.
        this._safetyTimer = setTimeout(() => finish(false), SAFETY_MS);
        window.speechSynthesis.speak(u);
      } catch {
        this.failed = true;
        finish(false);
      }
    });
  }

  /** Медленное проговаривание: используется в разборе ошибки в режиме «Эфир». */
  saySlow(text) { return this.say(text, { rate: 0.7 }); }

  cancel() {
    if (!this.supported) return;
    try { window.speechSynthesis.cancel(); } catch { /* нечего отменять */ }
  }

  /** Сброс флага отказа: вызывается при старте новой сессии. */
  resetFailure() { this.failed = false; }
}

export const speech = new Speech();
