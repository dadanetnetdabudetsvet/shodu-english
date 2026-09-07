/* Всплывающая подсказка. Один элемент на всё приложение. */
const el = document.getElementById('toast');
let timer = null;

let locked = false;

export function toast(text, { kind = 'info', action = null, sticky = false, ms = 3200 } = {}) {
  // Ничего не должно висеть без способа закрыть.
  if (!el) return;
  // Окно отмены удаления прогресса не должно затираться случайным
  // тостом: оно живёт до истечения срока или до нажатия.
  // Заперто только окно отмены удаления: у него есть срок и кнопка.
  // Раньше сюда попадало и предложение обновиться, и очередь запиралась
  // навсегда — медали и алмазы после него молча выбрасывались.
  if (locked && !action) return;
  locked = !!(action && sticky && ms === 0);
  clearTimeout(timer);
  el.className = `toast toast--${kind}`;
  el.replaceChildren();

  const span = document.createElement('span');
  span.textContent = text;
  el.append(span);

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast__action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { hide(); action.fn(); });
    el.append(btn);
  }
  const close = el2('button', 'toast__close', '✕');
  close.setAttribute('aria-label', 'Закрыть');
  close.addEventListener('click', hide);
  el.append(close);

  el.hidden = false;
  if (!sticky) timer = setTimeout(hide, ms);
}

function el2(tag, cls, text) {
  const n = document.createElement(tag);
  n.className = cls; n.textContent = text;
  return n;
}

export function hide() {
  locked = false;
  if (el) el.hidden = true;
}
