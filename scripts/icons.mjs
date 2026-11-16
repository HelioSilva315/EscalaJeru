// Gera os ícones do PWA a partir da imagem de marca (assets/brand/icon.jpg).
// Uso: npm run icons
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
const sourcePath = join(root, "assets", "brand", "icon.jpg");

const BACKGROUND = "#234a3e";

async function cover(size, name) {
  await sharp(sourcePath)
    .rotate() // respeita EXIF
    .resize(size, size, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, name));
  console.log(`✓ ${name}`);
}

async function maskable(size, name) {
  const inner = Math.round(size * 0.72);
  const resized = await sharp(sourcePath)
    .rotate()
    .resize(inner, inner, { fit: "cover", position: "centre" })
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, name));
  console.log(`✓ ${name}`);
}

await mkdir(outDir, { recursive: true });

await cover(192, "icon-192.png");
await cover(512, "icon-512.png");
await maskable(512, "icon-maskable-512.png");
await cover(180, "apple-touch-icon.png");
await cover(32, "favicon-32.png");
await cover(256, "logo.png");

console.log("Ícones gerados em public/icons a partir de assets/brand/icon.jpg");
