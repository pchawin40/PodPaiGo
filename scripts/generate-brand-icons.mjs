import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'lib/branding/podPaiGoMark.svg');
const svg = readFileSync(svgPath);
const publicDir = join(root, 'public');

async function writePng(outputPath, size) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  writeFileSync(outputPath, png);
}

async function writeIco(outputPath) {
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
  );

  const entryCount = sizes.length;
  const headerSize = 6 + entryCount * 16;
  let offset = headerSize;
  const entries = pngBuffers.map((buffer, index) => {
    const entry = {
      size: sizes[index],
      offset,
      length: buffer.length,
      buffer,
    };
    offset += buffer.length;
    return entry;
  });

  const totalSize = offset;
  const out = Buffer.alloc(totalSize);
  let pos = 0;

  out.writeUInt16LE(0, pos);
  pos += 2;
  out.writeUInt16LE(1, pos);
  pos += 2;
  out.writeUInt16LE(entryCount, pos);
  pos += 2;

  for (const entry of entries) {
    const dim = entry.size >= 256 ? 0 : entry.size;
    out.writeUInt8(dim, pos);
    pos += 1;
    out.writeUInt8(dim, pos);
    pos += 1;
    out.writeUInt8(0, pos);
    pos += 1;
    out.writeUInt8(0, pos);
    pos += 1;
    out.writeUInt16LE(1, pos);
    pos += 2;
    out.writeUInt16LE(32, pos);
    pos += 2;
    out.writeUInt32LE(entry.length, pos);
    pos += 4;
    out.writeUInt32LE(entry.offset, pos);
    pos += 4;
  }

  for (const entry of entries) {
    entry.buffer.copy(out, entry.offset);
  }

  writeFileSync(outputPath, out);
}

await writePng(join(root, 'app/icon.png'), 32);
await writePng(join(root, 'app/apple-icon.png'), 180);
await writePng(join(publicDir, 'icon-512.png'), 512);
await writePng(join(publicDir, 'apple-icon.png'), 180);
await writeIco(join(root, 'app/favicon.ico'));
copyFileSync(svgPath, join(publicDir, 'icon.svg'));
console.log('Generated PodPaiGo brand icons.');
