/**
 * Generate PWA app icons from an SVG template.
 * Run: node scripts/generate-icons.mjs
 * Requires: sharp (already a Next.js dependency)
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// Platemate icon: plate with fork and knife, warm primary color
// Simple, recognizable at small sizes
const primaryColor = "#B8462B";
const bgColor = "#FAF6F1";

function createIconSvg(size, padding = 0) {
  const p = padding;
  const viewSize = size;
  const plateR = (viewSize - p * 2) * 0.38;
  const cx = viewSize / 2;
  const cy = viewSize / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${bgColor}"/>
  <!-- Plate circle -->
  <circle cx="${cx}" cy="${cy}" r="${plateR}" fill="none" stroke="${primaryColor}" stroke-width="${size * 0.025}"/>
  <circle cx="${cx}" cy="${cy}" r="${plateR * 0.65}" fill="none" stroke="${primaryColor}" stroke-width="${size * 0.015}" opacity="0.4"/>
  <!-- Fork (left) -->
  <g transform="translate(${cx - plateR * 0.35}, ${cy - plateR * 0.6}) rotate(0)">
    <line x1="0" y1="0" x2="0" y2="${plateR * 1.2}" stroke="${primaryColor}" stroke-width="${size * 0.025}" stroke-linecap="round"/>
    <line x1="${-size * 0.02}" y1="0" x2="${-size * 0.02}" y2="${plateR * 0.35}" stroke="${primaryColor}" stroke-width="${size * 0.015}" stroke-linecap="round"/>
    <line x1="${size * 0.02}" y1="0" x2="${size * 0.02}" y2="${plateR * 0.35}" stroke="${primaryColor}" stroke-width="${size * 0.015}" stroke-linecap="round"/>
  </g>
  <!-- Knife (right) -->
  <g transform="translate(${cx + plateR * 0.35}, ${cy - plateR * 0.6})">
    <line x1="0" y1="0" x2="0" y2="${plateR * 1.2}" stroke="${primaryColor}" stroke-width="${size * 0.025}" stroke-linecap="round"/>
    <path d="M${size * 0.012},0 Q${size * 0.04},${plateR * 0.18} ${size * 0.012},${plateR * 0.35}" fill="none" stroke="${primaryColor}" stroke-width="${size * 0.015}" stroke-linecap="round"/>
  </g>
</svg>`;
}

const sizes = [
  { name: "icon-192.png", size: 192, padding: 0 },
  { name: "icon-512.png", size: 512, padding: 0 },
  { name: "icon-maskable-512.png", size: 512, padding: 80 }, // safe zone padding
];

for (const { name, size, padding } of sizes) {
  const svg = createIconSvg(size, padding);
  await sharp(Buffer.from(svg)).png().toFile(join(iconsDir, name));
  console.log(`Generated ${name}`);
}

// Apple touch icon (180x180)
const appleSvg = createIconSvg(180, 0);
await sharp(Buffer.from(appleSvg)).png().toFile(join(root, "public", "apple-touch-icon.png"));
console.log("Generated apple-touch-icon.png");

console.log("Done!");
