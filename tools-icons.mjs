/* Генератор иконок без внешних зависимостей.
 * PNG собирается вручную: сигнатура, IHDR, IDAT через zlib, IEND.
 * Знак — буква Ш: три вертикальных штриха и перекладина, рисуется
 * прямоугольниками, поэтому шрифт не нужен. */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function draw(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const c1 = [124, 99, 255], c2 = [90, 63, 232];
  // Безопасная зона маскируемой иконки — центральные 80%, поэтому
  // на ней знак мельче, а фон заливает весь холст.
  const pad = maskable ? 0 : size * 0.09;
  const r = maskable ? 0 : size * 0.22;

  const put = (x, y, rgb, a = 255) => {
    const i = (y * size + x) * 4;
    buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = a;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inX = x >= pad && x < size - pad, inY = y >= pad && y < size - pad;
      if (!inX || !inY) continue;
      // Скругление углов для обычной иконки.
      if (r > 0) {
        const lx = Math.min(x - pad, size - pad - 1 - x);
        const ly = Math.min(y - pad, size - pad - 1 - y);
        if (lx < r && ly < r) {
          const dx = r - lx, dy = r - ly;
          if (dx * dx + dy * dy > r * r) continue;
        }
      }
      put(x, y, mix(c1, c2, (x + y) / (2 * size)));
    }
  }

  // Буква Ш: три штриха и перекладина.
  const glyphW = size * (maskable ? 0.42 : 0.50);
  const glyphH = glyphW * 0.86;
  const x0 = (size - glyphW) / 2, y0 = (size - glyphH) / 2;
  const stroke = glyphW * 0.17;
  const gap = (glyphW - stroke * 3) / 2;
  const white = [255, 255, 255];

  const rect = (rx, ry, rw, rh) => {
    for (let y = Math.round(ry); y < Math.round(ry + rh); y++)
      for (let x = Math.round(rx); x < Math.round(rx + rw); x++)
        if (x >= 0 && y >= 0 && x < size && y < size) put(x, y, white);
  };
  for (let i = 0; i < 3; i++) rect(x0 + i * (stroke + gap), y0, stroke, glyphH);
  rect(x0, y0 + glyphH - stroke, glyphW, stroke);

  return png(size, size, buf);
}

mkdirSync('assets/icons', { recursive: true });
const files = [
  ['assets/icons/icon-192.png', draw(192)],
  ['assets/icons/icon-512.png', draw(512)],
  ['assets/icons/maskable-192.png', draw(192, { maskable: true })],
  ['assets/icons/maskable-512.png', draw(512, { maskable: true })],
  ['assets/icons/apple-touch-icon-180.png', draw(180, { maskable: true })],
];
for (const [p, b] of files) { writeFileSync(p, b); console.log(p, b.length, 'байт'); }

// Векторная иконка для вкладки браузера.
writeFileSync('assets/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#7C63FF"/><stop offset="1" stop-color="#5A3FE8"/></linearGradient></defs>
<rect width="100" height="100" rx="22" fill="url(#g)"/>
<path d="M25 28h9v33h11V28h9v33h11V28h9v44H25z" fill="#fff"/>
</svg>\n`);
console.log('assets/icons/icon.svg');
