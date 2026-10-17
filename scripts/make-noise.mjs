// Writes public/noise.png: the 140px paper grain tile the design build painted on a canvas at runtime.
// Grey pixels at alpha 0 to 15, as in ui/assets/kit.js, quantized so the PNG stays small. Run with: npm run noise
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 140;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Grey plus alpha (colour type 4), one filter byte per row.
const raw = Buffer.alloc(SIZE * (1 + SIZE * 2));
for (let y = 0; y < SIZE; y++) {
  const row = y * (1 + SIZE * 2);
  raw[row] = 0;
  for (let x = 0; x < SIZE; x++) {
    raw[row + 1 + x * 2] = Math.floor(Math.random() * 4) * 85; // 4 grey levels compress far better and look the same at this alpha
    raw[row + 2 + x * 2] = Math.floor(Math.random() * 4) * 5;
  }
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 4; // grey + alpha
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../public/noise.png", import.meta.url), png);
console.log(`public/noise.png written (${png.length} bytes)`);
