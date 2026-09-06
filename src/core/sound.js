/* Звуковой движок. Синтез через Web Audio API, без единого аудиофайла.
 *
 * Почему синтез, а не файлы: ноль килобайт вместо ~200, старт осциллятора
 * занимает микросекунды против 50-200 мс у элемента <audio>, и все ступени
 * комбо получаются из одного рецепта с разной высотой.
 *
 * Формула «нинтендовости»: треугольник или синус (не прямоугольник),
 * 60-150 мс, атака 5-12 мс (не ноль, иначе слышен щелчок), экспоненциальный
 * спад, фильтр низких на 3-6 кГц, интервалы мажорной пентатоники,
 * питч-бенд вверх на 5-15%, а для колокольчиков наград — частотная
 * модуляция с неоктавным отношением 3.51.
 */

const NOTES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Имя ноты в герцы. note('E6') === 1318.51 */
export function note(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error('плохое имя ноты: ' + name);
  const semis = NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semis;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const PENTATONIC = [0, 2, 4, 7, 9]; // мажорная пентатоника в полутонах

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.enabled = true;
    this.volume = 0.9;
    this._unlocked = false;
    this._lastPlayed = new Map(); // троттлинг одинаковых звуков
    this._boundResume = null;
  }

  /* AudioContext создаётся только внутри пользовательского жеста.
   * Вызывать из обработчика click/touchend на первом экране. */
  unlock() {
    if (this._unlocked) { this._resumeIfNeeded(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }

    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    // Наложение комбо и россыпи алмазов не должно клиппить.
    this.comp.threshold.value = -14;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.18;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    this._unlocked = true;
    this._resumeIfNeeded();

    // На iOS контекст уходит в состояние interrupted после возврата из фона
    // и больше не звучит, пока его явно не разбудить.
    this._boundResume = () => this._resumeIfNeeded();
    document.addEventListener('visibilitychange', this._boundResume);
    window.addEventListener('focus', this._boundResume);
  }

  _resumeIfNeeded() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
      this.ctx.resume().catch(() => {});
    }
  }

  setEnabled(on) { this.enabled = !!on; }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  get _t() { return this.ctx.currentTime; }

  _ready(key, throttleMs = 40) {
    if (!this.enabled || !this.ctx) return false;
    if (this.ctx.state !== 'running') { this._resumeIfNeeded(); }
    if (key) {
      const now = performance.now();
      const last = this._lastPlayed.get(key) || 0;
      if (now - last < throttleMs) return false;
      this._lastPlayed.set(key, now);
    }
    return true;
  }

  /* ── примитивы ─────────────────────────────────────────────── */

  /** Одна нота с огибающей ADSR и опциональным питч-бендом. */
  _tone({ type = 'triangle', f0, f1 = null, t0 = 0, dur = 0.12,
          gain = 0.2, attack = 0.008, lp = null, detune = 0 }) {
    const ctx = this.ctx, start = this._t + t0;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f0, start);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, start + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    let node = osc;
    if (lp) {
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      if (Array.isArray(lp)) {
        filt.frequency.setValueAtTime(lp[0], start);
        filt.frequency.exponentialRampToValueAtTime(lp[1], start + dur);
      } else {
        filt.frequency.value = lp;
      }
      node.connect(filt); node = filt;
    }
    node.connect(g); g.connect(this.master);
    osc.start(start); osc.stop(start + dur + 0.02);
    return osc;
  }

  /** Короткий шумовой транзиент: даёт «щёлк» тапа без грязи. */
  _noise({ t0 = 0, dur = 0.022, gain = 0.05, hp = 2400 }) {
    const ctx = this.ctx, start = this._t + t0;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(start); src.stop(start + dur);
  }

  /** Колокольчик через частотную модуляцию с неоктавным отношением. */
  _bell({ f = 1200, t0 = 0, dur = 0.5, gain = 0.14, ratio = 3.51, index = 300, detune = 0 }) {
    const ctx = this.ctx, start = this._t + t0;
    const carrier = ctx.createOscillator(); carrier.type = 'sine';
    carrier.frequency.value = f; carrier.detune.value = detune;
    const mod = ctx.createOscillator(); mod.type = 'sine';
    mod.frequency.value = f * ratio;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(index, start);
    modGain.gain.exponentialRampToValueAtTime(0.5, start + dur * 0.7);
    mod.connect(modGain); modGain.connect(carrier.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    carrier.connect(g); g.connect(this.master);
    mod.start(start); carrier.start(start);
    mod.stop(start + dur + 0.02); carrier.stop(start + dur + 0.02);
  }

  /* ── рецепты событий ───────────────────────────────────────── */

  /** Тап по любому интерактивному элементу. */
  tap() {
    if (!this._ready('tap', 30)) return;
    this._tone({ f0: 880, f1: 660, dur: 0.055, gain: 0.16, attack: 0.005, lp: 5200 });
    this._noise({ dur: 0.022, gain: 0.045 });
  }

  /** Верный ответ: восходящая квинта с призвуком октавой выше. */
  correct() {
    if (!this._ready('correct', 60)) return;
    this._tone({ f0: note('E6'), f1: note('B6'), dur: 0.22, gain: 0.22, attack: 0.008, lp: 6000 });
    this._tone({ type: 'sine', f0: note('B7'), dur: 0.16, gain: 0.05, t0: 0.03, lp: 8000 });
  }

  /** Ошибка: мягкое «нет», а не зуммер. Глухое и низкое. */
  wrong() {
    if (!this._ready('wrong', 80)) return;
    this._tone({ f0: 233, f1: 165, dur: 0.28, gain: 0.16, attack: 0.012, lp: 1100 });
    this._tone({ type: 'sine', f0: 155, f1: 110, dur: 0.32, gain: 0.10, t0: 0.02, lp: 900 });
  }

  /** Комбо N: ступень мажорной пентатоники вверх от C6. */
  combo(n) {
    if (!this._ready(null)) return;
    const step = Math.max(0, Math.min(11, n - 2));
    const semis = PENTATONIC[step % 5] + 12 * Math.floor(step / 5);
    const f = note('C6') * Math.pow(2, semis / 12);
    this._tone({ f0: f, f1: f * 1.12, dur: 0.14, gain: 0.2, attack: 0.006, lp: 6500 });
    if (n >= 5) {
      this._bell({ f: f * 2, t0: 0.05, dur: 0.42, gain: 0.09 });
      this._bell({ f: f * 3, t0: 0.11, dur: 0.34, gain: 0.06, detune: 8 });
    }
  }

  /** Россыпь алмазов: N колокольчиков с живым разбросом. */
  gems(count = 5) {
    if (!this._ready(null)) return;
    const n = Math.max(1, Math.min(9, count));
    for (let i = 0; i < n; i++) {
      const semis = PENTATONIC[i % 5] + 12 * Math.floor(i / 5);
      this._bell({
        f: note('C6') * Math.pow(2, semis / 12),
        t0: i * 0.055 + Math.random() * 0.018,   // джиттер тайминга
        dur: 0.5, gain: 0.12,
        detune: (Math.random() - 0.5) * 12,      // расстройка ±0.6%
      });
    }
  }

  /** Новый уровень: арпеджио плюс расстроенный аккорд колокольчиков. */
  levelUp() {
    if (!this._ready(null)) return;
    const arp = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'];
    arp.forEach((nm, i) => this._tone({
      f0: note(nm), f1: note(nm) * 1.06,
      t0: i * 0.075, dur: 0.28, gain: 0.19, lp: 6500,
    }));
    ['C6', 'E6', 'G6'].forEach((nm, i) => this._bell({
      f: note(nm), t0: 0.5 + i * 0.02, dur: 1.0, gain: 0.11,
      detune: (i - 1) * 7,
    }));
  }

  /** Открытие достижения: короткая золотая фанфара. */
  medal() {
    if (!this._ready(null)) return;
    ['G5', 'C6', 'E6'].forEach((nm, i) => this._tone({
      f0: note(nm), t0: i * 0.09, dur: 0.32, gain: 0.2, lp: 6000,
    }));
    this._bell({ f: note('C7'), t0: 0.28, dur: 0.9, gain: 0.13 });
  }

  /** Завершение сессии: спокойное разрешение вниз-вверх. */
  sessionDone() {
    if (!this._ready(null)) return;
    ['C6', 'A5', 'F5', 'C6'].forEach((nm, i) => this._tone({
      f0: note(nm), t0: i * 0.11, dur: 0.34, gain: 0.18, lp: 5500,
    }));
  }

  /** Старт сессии: два коротких подъёма. */
  sessionStart() {
    if (!this._ready(null)) return;
    this._tone({ f0: note('G5'), f1: note('C6'), dur: 0.13, gain: 0.18, lp: 6000 });
    this._tone({ f0: note('C6'), f1: note('G6'), t0: 0.1, dur: 0.18, gain: 0.16, lp: 6500 });
  }

  /** Смена экрана: почти незаметный воздух. */
  screen() {
    if (!this._ready('screen', 120)) return;
    this._tone({ type: 'sine', f0: 520, f1: 700, dur: 0.09, gain: 0.06, lp: 4000 });
  }

  /** Потеря жизни: короткий спад без драмы. */
  lifeLost() {
    if (!this._ready(null)) return;
    this._tone({ f0: 392, f1: 262, dur: 0.3, gain: 0.15, attack: 0.01, lp: 1600 });
  }

  /** Сгорание стрика: глиссандо вниз с закрывающимся фильтром. */
  streakLost() {
    if (!this._ready(null)) return;
    this._tone({ f0: note('A5'), f1: note('A3'), dur: 1.1, gain: 0.17, attack: 0.02, lp: [4000, 220] });
    this._tone({ type: 'sine', f0: 90, f1: 55, t0: 0.7, dur: 0.5, gain: 0.12 });
  }
}

export const sound = new SoundEngine();
