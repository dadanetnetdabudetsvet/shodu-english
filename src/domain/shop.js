/* Лавка. Единственное место, где тратятся алмазы.
 *
 * Правило Р7 держится жёстко: учебный контент не продаётся. Ни слова,
 * ни правила, ни подборки, ни повторения. Продаётся только внешний вид
 * и защита ритма — то, что ничего не отнимает у того, кто не покупает.
 *
 * Прошлая версия лавки была вырезана разбором: шесть предметов из
 * восьми дублировали бесплатное, и весь ассортимент закрывался за
 * неделю. Здесь сток глубокий и почти весь косметический.
 */

export const AVATAR_BASES = [
  { id: 'b00', emoji: '🐱', name: 'Кот',        price: 0 },
  { id: 'b01', emoji: '🦊', name: 'Лис',        price: 0 },
  { id: 'b02', emoji: '🐼', name: 'Панда',      price: 0 },
  { id: 'b03', emoji: '🐧', name: 'Пингвин',    price: 0 },
  { id: 'b04', emoji: '🦉', name: 'Сова',       price: 60 },
  { id: 'b05', emoji: '🐻', name: 'Медведь',    price: 60 },
  { id: 'b06', emoji: '🦔', name: 'Ёж',         price: 90 },
  { id: 'b07', emoji: '🐺', name: 'Волк',       price: 120 },
  { id: 'b08', emoji: '🦫', name: 'Капибара',   price: 160 },
  { id: 'b09', emoji: '🐲', name: 'Дракончик',  price: 220 },
  { id: 'b10', emoji: '🐙', name: 'Осьминог',   price: 260 },
  { id: 'b11', emoji: '🧑‍🚀', name: 'Космонавт', price: 350 },
];

export const AVATAR_HATS = [
  { id: 'h00', emoji: '',   name: 'Без шапки',     price: 0 },
  { id: 'h01', emoji: '🧢', name: 'Кепка',         price: 0 },
  { id: 'h02', emoji: '🎩', name: 'Цилиндр',       price: 50 },
  { id: 'h03', emoji: '🎧', name: 'Наушники',      price: 70 },
  { id: 'h04', emoji: '👑', name: 'Корона',        price: 180 },
  { id: 'h05', emoji: '🎓', name: 'Академическая', price: 90 },
  { id: 'h06', emoji: '🪖', name: 'Каска',         price: 70 },
  { id: 'h07', emoji: '🎃', name: 'Тыква',         price: 110 },
  { id: 'h08', emoji: '🧣', name: 'Шарф',          price: 50 },
  { id: 'h09', emoji: '🔥', name: 'Огонь',         price: 240 },
];

export const AVATAR_FRAMES = [
  { id: 'f00', name: 'Без рамки',  price: 0,   css: 'none' },
  { id: 'f01', name: 'Тёплая',     price: 60, css: 'linear-gradient(135deg,#FFB03A,#FF7A45)' },
  { id: 'f02', name: 'Морская',    price: 60, css: 'linear-gradient(135deg,#6FE7F5,#12B5CB)' },
  { id: 'f03', name: 'Лесная',     price: 90, css: 'linear-gradient(135deg,#2FCB7B,#17A45C)' },
  { id: 'f04', name: 'Сумерки',    price: 130, css: 'linear-gradient(135deg,#7C63FF,#8F4FE8)' },
  { id: 'f05', name: 'Золотая',    price: 200, css: 'linear-gradient(140deg,#FFDE8A,#D68A0B)' },
  { id: 'f06', name: 'Радуга',     price: 320, css: 'conic-gradient(#FF7A45,#E8A317,#17A45C,#12B5CB,#6E56F8,#F0426B,#FF7A45)' },
];

export const ACCENTS = [
  { id: 'a00', name: 'Индиго',   price: 0,   color: '#4B37D9' },
  { id: 'a01', name: 'Изумруд',  price: 80, color: '#0E8A5F' },
  { id: 'a02', name: 'Закат',    price: 80, color: '#C2410C' },
  { id: 'a03', name: 'Слива',    price: 110, color: '#86198F' },
  { id: 'a04', name: 'Океан',    price: 110, color: '#0369A1' },
  { id: 'a05', name: 'Графит',   price: 150, color: '#334155' },
];

/* Единственный некосметический предмет: защита ритма. Заморозка и так
   выдаётся бесплатно каждые семь активных дней и безусловно при угрозе
   стриву, поэтому покупка ничего не разблокирует — она лишь ускоряет. */
export const FREEZE = { id: 'freeze', name: 'Заморозка дня', price: 90, max: 2 };

export const SECTIONS = [
  { id: 'bases',   title: 'Кто ты',     items: AVATAR_BASES },
  { id: 'hats',    title: 'На голову',  items: AVATAR_HATS },
  { id: 'frames',  title: 'Рамка',      items: AVATAR_FRAMES },
  { id: 'accents', title: 'Цвет',       items: ACCENTS },
];

export function allItems() {
  return [...AVATAR_BASES, ...AVATAR_HATS, ...AVATAR_FRAMES, ...ACCENTS];
}

export function itemById(id) {
  return allItems().find(x => x.id === id) || null;
}

export function isOwned(owned, item) {
  return item.price === 0 || (owned || []).includes(item.id);
}

/** Сколько всего можно потратить: показатель глубины стока. */
export function totalPrice() {
  return allItems().reduce((a, x) => a + x.price, 0);
}

export function canAfford(gems, item) {
  return gems >= item.price;
}
