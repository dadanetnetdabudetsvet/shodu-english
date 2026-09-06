/* Всплывающая подсказка. Один элемент на всё приложение. */
const el = document.getElementById('toast');
let timer = null;

export function toast(text, { kind = 'info', action = null, sticky = false, ms = 3200 } = {}) {
  if (!el) return;
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
  if (el) el.hidden = true;
}
