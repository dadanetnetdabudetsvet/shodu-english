/* Всплывающая подсказка. Один элемент на всё приложение. */
const el = document.getElementById('toast');
let timer = null;

let locked = false;

export function toast(text, { kind = 'info', action = null, sticky = false, ms = 3200 } = {}) {
  if (!el) return;
  // Окно отмены удаления прогресса не должно затираться случайным
  // тостом: оно живёт до истечения срока или до нажатия.
  if (locked && !action) return;
  locked = !!(action && sticky);
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
  el.hidden = false;
  if (!sticky) timer = setTimeout(hide, ms);
}

export function hide() {
  locked = false;
  if (el) el.hidden = true;
}
