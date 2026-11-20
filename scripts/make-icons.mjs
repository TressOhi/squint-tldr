// Draws the Squint icon (a narrowed eye with an amber iris) as PNGs in icons/.
// Pure Node, no image libraries: signed-distance shapes, 4x4 supersampled.
//   node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZES = [16, 32, 48, 128];
const BG = [28, 27, 25];
const EYE = [251, 250, 247];
const IRIS = [240, 167, 58];
const PUPIL = [28, 27, 25];

// Shapes in a unit square (0..1).
const roundedSquare = (x, y) => {
  const r = 0.22, h = 0.5 - r;
  const qx = Math.max(Math.abs(x - 0.5) - h, 0), qy = Math.max(Math.abs(y - 0.5) - h, 0);
  return Math.hypot(qx, qy) - r;
};
// A squinting eye: the intersection of two large circles (a thin lens shape).
const eye = (x, y) => {
  const R = 0.62, off = 0.5;
  const a = Math.hypot(x - 0.5, y - (0.5 - off)) - R;
  const b = Math.hypot(x - 0.5, y - (0.5 + off)) - R;
  return Math.max(a, b);
};
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const iris = circle(0.5, 0.5, 0.15);
const pupil = circle(0.5, 0.5, 0.065);

function colorAt(x, y) {
  if (roundedSquare(x, y) > 0) return null;
  if (eye(x, y) > 0) return BG;
  if (pupil(x, y) <= 0) return PUPIL;
  if (iris(x, y) <= 0) return IRIS;
  return EYE;
}

function render(size) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt((pxi + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const i = (py * size + pxi) * 4;
      if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
      px[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return png(size, size, px);
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

mkdirSync("icons", { recursive: true });
for (const s of SIZES) writeFileSync(`icons/${s}.png`, render(s));
console.log(`Wrote icons/{${SIZES.join(",")}}.png`);
