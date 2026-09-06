/* Приглашение друзей.
 *
 * Честное ограничение: без сервера устройство не может узнать, что
 * другой человек действительно пришёл. Открыть собственную ссылку в
 * приватном окне может кто угодно, поэтому награда «за переход по
 * ссылке» была бы наградой за самообман.
 *
 * Поэтому здесь рукопожатие. Друг после ПЕРВОГО ЗАВЕРШЁННОГО занятия
 * получает короткий код. Код выведен из двух чисел сразу: кода
 * пригласившего и собственного кода друга. Пригласивший вводит его у
 * себя, приложение проверяет связь и запоминает, что этот друг уже
 * зачтён.
 *
 * Защита не криптографическая, обойти её при желании можно. Но она
 * требует реального второго человека и реального занятия, а главное —
 * ничего не выдумывает: приложение не делает вид, будто знает то,
 * чего знать не может. Автоматическим это станет, когда появится
 * минимальный бэкенд.
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // без похожих символов

/* ── коды ──────────────────────────────────────────────────────── */

export function makeSelfCode(rnd = Math.random) {
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  return out;
}

export function normalizeCode(v) {
  return String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/I/g, '1');
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function checksum(inviterCode, friendCode) {
  const h = fnv1a(`shodu:${inviterCode}:${friendCode}:handshake`);
  let out = '';
  let v = h;
  for (let i = 0; i < 4; i++) { out += ALPHABET[v % ALPHABET.length]; v = Math.floor(v / ALPHABET.length); }
  return out;
}

/** Код, который друг отправляет пригласившему. Формат: ДРУГ-ПОДПИСЬ. */
export function makeProof(inviterCode, friendCode) {
  const a = normalizeCode(inviterCode), b = normalizeCode(friendCode);
  if (!a || !b) return null;
  return `${b}-${checksum(a, b)}`;
}

/**
 * Проверка кода у пригласившего.
 * @returns {{ ok: boolean, friendCode?: string, reason?: string }}
 */
export function verifyProof(myCode, proof, alreadyCounted = []) {
  const raw = String(proof || '').toUpperCase().replace(/\s/g, '');
  const m = /^([0-9A-Z]{6})-?([0-9A-Z]{4})$/.exec(raw);
  if (!m) return { ok: false, reason: 'Код не похож на настоящий. Он выглядит так: ABC123-XYZW.' };

  const friendCode = m[1], sig = m[2];
  const mine = normalizeCode(myCode);
  if (friendCode === mine) return { ok: false, reason: 'Это твой собственный код.' };
  if (alreadyCounted.includes(friendCode)) return { ok: false, reason: 'Этот друг уже зачтён.' };
  if (checksum(mine, friendCode) !== sig) {
    return { ok: false, reason: 'Код не подходит к твоей ссылке. Проверь, что друг пришёл именно по ней.' };
  }
  return { ok: true, friendCode };
}

/* ── награды ───────────────────────────────────────────────────── */

/* Растущая лестница за первых троих, затем ровный бонус за каждого.
 * Первые трое дороже, потому что именно они превращают «я один» в
 * «нас несколько» — дальше рост даёт уже сама компания. */
export const LADDER = [100, 200, 400];
export const STANDARD = 150;

export function rewardFor(nth) {
  return nth <= LADDER.length ? LADDER[nth - 1] : STANDARD;
}

export function nextRewardHint(count) {
  const nth = count + 1;
  if (nth <= LADDER.length) {
    return `За ${nth === 1 ? 'первого' : nth === 2 ? 'второго' : 'третьего'} друга — ${rewardFor(nth)} алмазов.`;
  }
  return `За каждого следующего друга — ${STANDARD} алмазов.`;
}

/** Сколько всего дадут за первых N друзей: для витрины лестницы. */
export function ladderPreview() {
  return LADDER.map((gems, i) => ({ nth: i + 1, gems }))
    .concat([{ nth: '4 и далее', gems: STANDARD }]);
}

/* Новичку бонус выдаётся не за установку, а за первое ЗАВЕРШЁННОЕ
 * занятие: иначе это приглашение к накрутке. */
export const NEWCOMER_GEMS = 100;

/* ── ссылка ────────────────────────────────────────────────────── */

export function inviteUrl(baseUrl, selfCode) {
  const u = new URL(baseUrl);
  u.hash = '';
  u.searchParams.set('ref', selfCode);
  return u.toString();
}

export function readRefFromUrl(href) {
  try {
    const u = new URL(href);
    const v = normalizeCode(u.searchParams.get('ref'));
    return v.length === 6 ? v : null;
  } catch { return null; }
}

/* ── каналы отправки ───────────────────────────────────────────── */

export const INVITE_TEXT = 'Учу английские слова по пять минут в день. Первые двести — те, что мы и так знаем. Держи:';

export function shareTargets(url, text = INVITE_TEXT) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  const tu = encodeURIComponent(`${text} ${url}`);
  const ttl = encodeURIComponent('Шоду — английский, который уже у тебя');
  return [
    { id: 'telegram', label: 'Telegram', icon: '✈️', href: `https://t.me/share/url?url=${u}&text=${t}` },
    { id: 'whatsapp', label: 'WhatsApp', icon: '💬', href: `https://api.whatsapp.com/send?text=${tu}` },
    { id: 'vk', label: 'ВКонтакте', icon: '🅥', href: `https://vk.com/share.php?url=${u}&title=${ttl}&comment=${t}` },
    { id: 'ok', label: 'Одноклассники', icon: '🟠', href: `https://connect.ok.ru/offer?url=${u}&title=${ttl}&description=${t}` },
    { id: 'viber', label: 'Viber', icon: '🟣', href: `viber://forward?text=${tu}` },
    { id: 'x', label: 'X', icon: '𝕏', href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { id: 'facebook', label: 'Facebook', icon: 'f', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: 'email', label: 'Почта', icon: '✉️', href: `mailto:?subject=${ttl}&body=${t}%0A%0A${u}` },
    { id: 'sms', label: 'СМС', icon: '💌', href: `sms:?&body=${tu}` },
  ];
}
