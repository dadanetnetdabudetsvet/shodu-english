/* Конфетти на canvas.
 *
 * Требования производительности из раздела 7.7:
 *  - пул частиц, никакого выделения памяти в горячем цикле;
 *  - цикл кадров полностью останавливается при нуле живых частиц;
 *  - плотность пикселей ограничена двойкой: на Android с плотностью 3
 *    это втрое меньше работы для видеоядра;
 *  - шаг времени нормализуется к 60 кадрам, иначе на экране 120 Гц
 *    частицы летят вдвое быстрее;
 *  - на слабых устройствах число частиц урезается;
 *  - canvas самоуничтожается через 8 секунд.
 */

import { prefersReduced } from './motion.js';

const MAX_DPR = 2;
const LIFE_MS = 8000;
const GRAVITY = 0.38;
const DRAG = 0.992;

const PALETTE = ['#6E56F8', '#FF7A45', '#17A45C', '#E8A317', '#12B5CB', '#F0426B'];

function weakDevice() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  return cores < 4 || mem <= 2;
}

class Particle {
  constructor() { this.alive = false; }
  spawn(x, y, palette) {
    this.alive = true;
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 11;
    this.vy = -(9 + Math.random() * 7);        // от -16 до -9
    this.w = 6; this.h = 10;
    this.rot = Math.random() * Math.PI * 2;
    this.vr = (Math.random() - 0.5) * 0.42;    // около ±12 градусов за кадр
    this.color = palette[(Math.random() * palette.length) | 0];
    this.life = 1;
    this.decay = 0.004 + Math.random() * 0.004;
  }
  step(dt) {
    this.vy += GRAVITY * dt;
    this.vx *= Math.pow(DRAG, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vr * dt;
    this.life -= this.decay * dt;
    if (this.life <= 0) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.life));
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.color;
    // Сплющивание по вертикали имитирует вращение бумажки в трёх измерениях.
    ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h * Math.abs(Math.cos(this.rot * 1.7)));
    ctx.restore();
  }
}

export class Confetti {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.pool = [];
    this.running = false;
    this.lastT = 0;
    this.killTimer = null;
    this.dpr = 1;
  }

  _ensureCanvas() {
    if (this.canvas) return;
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9000';
    document.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  _resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _get() {
    for (const p of this.pool) if (!p.alive) return p;
    const p = new Particle();
    this.pool.push(p);
    return p;
  }

  /** Залп из трёх пушек: слева, по центру, справа. */
  burst({ count = 80, palette = PALETTE } = {}) {
    if (prefersReduced()) return this._static(palette);
    this._ensureCanvas();
    const n = weakDevice() ? Math.min(35, count) : count;
    const w = window.innerWidth, h = window.innerHeight;
    const guns = [
      { x: w * 0.15, y: h * 0.62 },
      { x: w * 0.50, y: h * 0.50 },
      { x: w * 0.85, y: h * 0.62 },
    ];
    for (let i = 0; i < n; i++) {
      const g = guns[i % guns.length];
      this._get().spawn(g.x, g.y, palette);
    }
    clearTimeout(this.killTimer);
    this.killTimer = setTimeout(() => this.destroy(), LIFE_MS);
    this._start();
  }

  /** Замена канала при уменьшенной анимации: 12 статичных частиц, затухание. */
  _static(palette) {
    this._ensureCanvas();
    const ctx = this.ctx, w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      ctx.save();
      ctx.fillStyle = palette[i % palette.length];
      ctx.globalAlpha = 0.9;
      ctx.translate(w * (0.1 + 0.8 * (i / 11)), h * (0.35 + 0.25 * Math.random()));
      ctx.rotate(i);
      ctx.fillRect(-3, -5, 6, 10);
      ctx.restore();
    }
    this.canvas.style.transition = 'opacity 900ms linear';
    requestAnimationFrame(() => { if (this.canvas) this.canvas.style.opacity = '0'; });
    clearTimeout(this.killTimer);
    this.killTimer = setTimeout(() => this.destroy(), 1000);
  }

  _start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (now) => {
      if (!this.running || !this.ctx) return;
      // Нормализация к 60 кадрам, с потолком чтобы после лага не телепортировало.
      const dt = Math.min(3, (now - this.lastT) / 16.667);
      this.lastT = now;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = 0;
      for (const p of this.pool) {
        if (!p.alive) continue;
        p.step(dt);
        if (p.y > window.innerHeight + 40) p.alive = false;
        if (p.alive) { p.draw(ctx); alive++; }
      }
      if (alive === 0) { this.running = false; return; }  // цикл встаёт полностью
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    clearTimeout(this.killTimer);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null; this.ctx = null;
    for (const p of this.pool) p.alive = false;
  }
}

export const confetti = new Confetti();
