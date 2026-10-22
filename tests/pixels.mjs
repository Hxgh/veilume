import { inflateSync } from "node:zlib";

// Minimal PNG reader for Chrome's 8-bit RGB(A) screenshots; no image dependency.
export function readPNG(buffer) {
  const chunks = [];
  let width, height, channels;
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9])) throw new Error("Unsupported screenshot format");
      channels = data[9] === 2 ? 3 : 4;
    }
    if (type === "IDAT") chunks.push(data);
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
    return x <= y && x <= z ? a : y <= z ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const pos = y * stride + x;
      const a = x >= channels ? pixels[pos - channels] : 0;
      const b = y ? pixels[pos - stride] : 0;
      const c = y && x >= channels ? pixels[pos - stride - channels] : 0;
      const correction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      if (correction === undefined) throw new Error("Unsupported PNG row filter");
      pixels[pos] = raw[y * (stride + 1) + 1 + x] + correction;
    }
  }
  return { width, height, pixel(x, y) {
    const start = (Math.floor(y) * width + Math.floor(x)) * channels;
    return [...pixels.subarray(start, start + 3)];
  } };
}
export const mean = rgb => rgb.reduce((a, b) => a + b, 0) / rgb.length;
