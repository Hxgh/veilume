import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await cp(path.join(root, "extension"), dist, { recursive: true });
await cp(path.join(root, "THIRD_PARTY_NOTICES.md"), path.join(dist, "THIRD_PARTY_NOTICES.md"));
await cp(path.join(root, "LICENSE"), path.join(dist, "LICENSE"));
await cp(path.join(root, "PRIVACY.md"), path.join(dist, "PRIVACY.md"));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function icon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  // The store's 128px square icon needs ~96px artwork with transparent padding.
  const scale = size === 128 ? 0.8 : 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const total = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = ((x + (sx + 0.5) / 4) / size - 0.5) / scale + 0.5;
        const py = ((y + (sy + 0.5) / 4) / size - 0.5) / scale + 0.5;
        const dx = Math.max(0.23 - px, 0, px - 0.77);
        const dy = Math.max(0.23 - py, 0, py - 0.77);
        let c = dx * dx + dy * dy <= 0.2 ** 2 ? [38, 38, 38, 255] : [0, 0, 0, 0];
        if ((px - 0.5) ** 2 + (py - 0.5) ** 2 < 0.3 ** 2) c = px < 0.5 ? [245, 245, 245, 255] : [82, 82, 82, 255];
        c.forEach((v, i) => total[i] += v / 16);
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      total.forEach((v, i) => pixels[offset + i] = Math.round(v));
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
await mkdir(path.join(dist, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) await writeFile(path.join(dist, `icons/icon${size}.png`), icon(size));
console.log(`已构建可直接加载的扩展：${dist}`);
