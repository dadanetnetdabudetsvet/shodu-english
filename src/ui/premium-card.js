/* Карточка «Сходу Всё».
 *
 * Задача карточки — не продать, а объяснить размер подарка. Поэтому
 * цена зачёркнута сразу, до всякого текста: человек сначала видит,
 * что вещь стоит денег, и только потом — что платить не нужно.
 *
 * Три места под друзей нарисованы пустыми слотами, а не полоской
 * прогресса. Пустой слот — это приглашение его заполнить; полоска на
 * нуле выглядит как долг.
 */

import { el } from './dom.js';
import { t } from '../i18n/index.js';
import { PRICE, PERKS, NEEDED, progress, statusLine, isActive } from '../domain/premium.js';

export function premiumCard(state, { onInvite, compact = false } = {}) {
  const p = progress(state);
  const active = isActive(state);
  const line = statusLine(state);

  const slots = el('div', { class: 'prem__slots' },
    ...Array.from({ length: NEEDED }, (_, i) => el('div', {
      class: 'prem__slot' + (i < p.have ? ' is-filled' : ''),
      'aria-hidden': 'true',
    }, i < p.have ? '🙂' : '+')));

  const head = el('div', { class: 'prem__head' },
    el('div', { class: 'prem__mark' }, '💠'),
    el('div', { class: 'grow' },
      el('div', { class: 'prem__name' }, t('Сходу Всё')),
      el('div', { class: 'prem__forever' },
        active ? t('открыто навсегда') : t('пожизненно, без подписки'))),
    el('div', { class: 'prem__price' },
      el('s', { class: 'prem__price-old' }, `${PRICE.currency}${PRICE.amount}/${t(PRICE.period)}`),
      el('div', { class: 'prem__price-new' }, active ? t('твоё') : t('0'))));

  const perks = el('ul', { class: 'prem__perks' },
    ...PERKS.map(perk => el('li', { class: 'prem__perk' },
      el('span', { class: 'prem__perk-ic' }, perk.icon),
      el('span', {},
        el('b', {}, t(perk.title)),
        el('span', { class: 'prem__perk-sub' }, t(perk.sub))))));

  return el('div', { class: 'prem' + (active ? ' is-active' : '') },
    el('div', { class: 'prem__glow' }),
    head,
    compact ? null : perks,
    el('div', { class: 'prem__gate' },
      slots,
      el('div', { class: 'prem__line' }, t(line.key, line.vars))),
    active
      ? el('div', { class: 'prem__done' }, t('Спасибо, что привёл своих 💠'))
      : el('button', {
          class: 'prem__cta',
          onClick: () => onInvite?.(),
        }, t('Позвать друзей 🎁')),
    active ? null : el('div', { class: 'prem__fine' },
      t('Мы нигде не берём денег. Цена показана, чтобы был понятен размер.')),
  );
}
