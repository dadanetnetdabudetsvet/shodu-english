/* Экран установки на домашний экран.
 *
 * Способ отличается на каждой связке система плюс браузер, и
 * универсальной инструкции не бывает. Показать не тот путь хуже, чем
 * не показать никакого: человек честно ищет кнопку, которой у него
 * нет, и делает вывод, что не справился.
 *
 * Шаги нарисованы схемами, а не сняты скриншотами: чужую систему мы
 * заснять не можем, а схема показывает то же самое и не устаревает
 * с версией операционки.
 */

import { el, setChildren } from '../ui/dom.js';
import { t } from '../i18n/index.js';
import { platform, STEPS, canPrompt, prompt, installed } from '../core/install.js';
import { countKnown } from '../ui/reducer.js';
import { enterCard } from '../core/motion.js';
import { sound } from '../core/sound.js';
import { toast } from '../ui/toast.js';

export function screen(store, content) {
  return {
    mount(root, ctx) {
      const s = store.state;
      const kind = platform();
      const guide = STEPS[kind] || STEPS.desktop;
      const { known, learning } = countKnown(s);

      const wrap = el('div', { class: 'screen' });
      root.replaceChildren(wrap);

      if (kind === 'installed' || installed()) {
        setChildren(wrap,
          el('div', { class: 'stack center', style: 'justify-content:center;flex:1;gap:var(--sp-4)' },
            el('div', { style: 'font-size:52px' }, '✅'),
            el('h1', { class: 't-h1' }, t('Уже стоит')),
            el('p', { class: 't-sm' },
              t('Приложение открыто с домашнего экрана. Твои слова живут дольше именно так.')),
            el('button', { class: 'btn btn--primary btn--cta', onClick: () => ctx.go('home') }, t('Понятно ✓'))));
        return { destroy() {} };
      }

      const promptBtn = canPrompt() ? el('button', {
        class: 'btn btn--primary btn--cta',
        onClick: async () => {
          sound.tap();
          const ok = await prompt();
          if (ok) { store.dispatch({ type: 'INSTALL_SEEN' }); ctx.go('home'); }
        },
      }, t('Установить сразу 📲')) : null;

      const copyBtn = kind === 'ios-other' ? el('button', {
        class: 'btn btn--primary btn--cta',
        onClick: async () => {
          const url = location.href.split('#')[0];
          try { await navigator.clipboard.writeText(url); toast(t('Ссылка скопирована 🔗'), { kind: 'info' }); }
          catch { toast(url, { kind: 'info', ms: 9000 }); }
        },
      }, t('Скопировать ссылку 🔗')) : null;

      setChildren(wrap,
        el('div', { class: 'card--hero stack', style: 'gap:var(--sp-2)' },
          el('div', { style: 'font-size:34px' }, '📲'),
          el('div', { style: 'font-size:var(--fs-lg);font-weight:700' }, t(guide.title)),
          el('div', { class: 't-sm', style: 'color:rgba(255,255,255,.9)' },
            t('Твои {v0} слов живут вот в этом браузере. На домашнем экране они держатся дольше, и приложение открывается одним касанием.', { v0: known + learning }))),

        guide.note ? el('div', { class: 'card card--flat t-sm' }, t(guide.note)) : null,

        ...guide.steps.map((st, i) => el('div', { class: 'step' },
          el('div', { class: 'step__num' }, String(i + 1)),
          el('div', { class: 'step__body' },
            el('div', { class: 'step__text' }, t(st.text)),
            art(st.art)))),

        promptBtn,
        copyBtn,

        el('div', { class: 'card card--flat stack', style: 'gap:4px' },
          el('div', { style: 'font-weight:600' }, t('Что изменится')),
          el('div', { class: 't-sm' }, t('Своя иконка на экране, без адресной строки и вкладок.')),
          el('div', { class: 't-sm' }, t('Работает без интернета: слова и правила уже скачаны.')),
          el('div', { class: 't-sm' }, t('Браузер реже стирает данные у приложений с домашнего экрана.'))),

        el('button', {
          class: 'btn btn--ghost btn--cta',
          onClick: () => { store.dispatch({ type: 'INSTALL_SEEN' }); ctx.go('home'); },
        }, t('Понятно ✓')),
      );

      enterCard(wrap);
      return { destroy() {} };
    },
  };
}

/* ── схемы шагов ───────────────────────────────────────────────
   Каждая — маленький рисунок телефона с подсвеченным элементом,
   на который надо нажать. */
function art(kind) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 120');
  svg.setAttribute('class', 'step__art');
  svg.setAttribute('aria-hidden', 'true');

  const rect = (x, y, w, h, r, fill, stroke) => {
    const n = document.createElementNS(NS, 'rect');
    n.setAttribute('x', x); n.setAttribute('y', y);
    n.setAttribute('width', w); n.setAttribute('height', h);
    n.setAttribute('rx', r); n.setAttribute('fill', fill || 'none');
    if (stroke) { n.setAttribute('stroke', stroke); n.setAttribute('stroke-width', 1.5); }
    return n;
  };
  const text = (x, y, str, size, fill, anchor) => {
    const n = document.createElementNS(NS, 'text');
    n.setAttribute('x', x); n.setAttribute('y', y);
    n.setAttribute('font-size', size || 9);
    n.setAttribute('fill', fill || 'var(--text-2)');
    n.setAttribute('text-anchor', anchor || 'start');
    n.setAttribute('font-family', 'inherit');
    n.textContent = str;
    return n;
  };

  // Корпус телефона общий для всех схем.
  svg.append(rect(58, 4, 84, 112, 10, 'var(--surface)', 'var(--border-strong)'));

  if (kind === 'share' || kind === 'safari') {
    svg.append(rect(64, 12, 72, 76, 4, 'var(--surface-2)'));
    svg.append(text(100, 54, 'Shodu', 11, 'var(--text-3)', 'middle'));
    // Нижняя панель Safari с подсвеченной кнопкой «Поделиться».
    svg.append(rect(64, 94, 72, 16, 4, 'var(--surface-2)'));
    svg.append(rect(92, 96, 16, 12, 3, 'var(--accent-soft)', 'var(--accent)'));
    const up = document.createElementNS(NS, 'path');
    up.setAttribute('d', 'M100 106 V99 M97 101.5 L100 98.5 L103 101.5 M96 104 h8');
    up.setAttribute('stroke', 'var(--accent)');
    up.setAttribute('stroke-width', 1.4);
    up.setAttribute('fill', 'none');
    up.setAttribute('stroke-linecap', 'round');
    svg.append(up);
    svg.append(text(30, 104, kind === 'safari' ? 'Safari' : 'Поделиться', 8, 'var(--accent)'));
  } else if (kind === 'list') {
    // Лист «Поделиться» с выделенным пунктом.
    svg.append(rect(64, 34, 72, 76, 6, 'var(--surface-2)'));
    for (let i = 0; i < 3; i++) svg.append(rect(70, 42 + i * 12, 60, 8, 2, 'var(--surface-3)'));
    svg.append(rect(70, 78, 60, 12, 3, 'var(--accent-soft)', 'var(--accent)'));
    svg.append(text(74, 87, 'На экран «Домой»', 7, 'var(--accent)'));
    svg.append(rect(70, 94, 60, 8, 2, 'var(--surface-3)'));
  } else if (kind === 'add') {
    svg.append(rect(64, 12, 72, 96, 4, 'var(--surface-2)'));
    svg.append(rect(104, 16, 28, 12, 3, 'var(--accent)', null));
    svg.append(text(118, 25, 'Добавить', 7, '#fff', 'middle'));
    svg.append(rect(74, 44, 24, 24, 6, 'var(--accent-soft)', 'var(--accent)'));
    svg.append(text(86, 60, 'Ш', 13, 'var(--accent)', 'middle'));
    svg.append(text(104, 60, 'Сходу', 9, 'var(--text-2)'));
  } else if (kind === 'menu') {
    svg.append(rect(64, 12, 72, 76, 4, 'var(--surface-2)'));
    svg.append(rect(120, 14, 14, 10, 3, 'var(--accent-soft)', 'var(--accent)'));
    for (let i = 0; i < 3; i++) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', 127); dot.setAttribute('cy', 16.5 + i * 2.6);
      dot.setAttribute('r', 0.9); dot.setAttribute('fill', 'var(--accent)');
      svg.append(dot);
    }
    svg.append(text(30, 22, 'Меню', 8, 'var(--accent)'));
  } else if (kind === 'install') {
    svg.append(rect(64, 12, 72, 96, 4, 'var(--surface-2)'));
    svg.append(rect(70, 30, 60, 10, 2, 'var(--surface-3)'));
    svg.append(rect(70, 44, 60, 14, 3, 'var(--accent-soft)', 'var(--accent)'));
    svg.append(text(74, 54, 'Установить', 7.5, 'var(--accent)'));
    svg.append(rect(70, 62, 60, 10, 2, 'var(--surface-3)'));
    svg.append(rect(70, 76, 60, 10, 2, 'var(--surface-3)'));
  } else if (kind === 'copy') {
    svg.append(rect(64, 12, 72, 96, 4, 'var(--surface-2)'));
    svg.append(rect(70, 20, 60, 12, 3, 'var(--surface)', 'var(--border-strong)'));
    svg.append(text(74, 28.5, 'shodu…', 7, 'var(--text-3)'));
    svg.append(rect(70, 50, 60, 14, 3, 'var(--accent)', null));
    svg.append(text(100, 60, 'Копировать', 7.5, '#fff', 'middle'));
  } else if (kind === 'urlbar') {
    svg.append(rect(20, 30, 160, 18, 5, 'var(--surface-2)', 'var(--border-strong)'));
    svg.append(text(28, 42, 'shodu…', 8, 'var(--text-3)'));
    svg.append(rect(158, 33, 16, 12, 3, 'var(--accent-soft)', 'var(--accent)'));
    const dn = document.createElementNS(NS, 'path');
    dn.setAttribute('d', 'M166 35 v6 M163 38.5 L166 41.5 L169 38.5 M162 43 h8');
    dn.setAttribute('stroke', 'var(--accent)'); dn.setAttribute('stroke-width', 1.3);
    dn.setAttribute('fill', 'none'); dn.setAttribute('stroke-linecap', 'round');
    svg.append(dn);
  }
  return svg;
}
