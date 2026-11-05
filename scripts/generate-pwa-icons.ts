import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * Draws the icons of the PWA (D-76), committed under public/icons and src/app. Run with
 * `npx tsx scripts/generate-pwa-icons.ts` if the drawing changes. sharp comes with Next.js.
 */

const TEAL = "#0F766E";

/** A calendar with a check mark on a 100 x 100 canvas, in `color`. */
const glyph = (color: string, paper: string) => `
  <rect x="24" y="30" width="52" height="48" rx="7" fill="${color}"/>
  <rect x="24" y="30" width="52" height="13" rx="7" fill="${color}"/>
  <rect x="35" y="22" width="6" height="15" rx="3" fill="${color}"/>
  <rect x="59" y="22" width="6" height="15" rx="3" fill="${color}"/>
  <rect x="30" y="44" width="40" height="28" rx="3" fill="${paper}"/>
  <path d="M39 58 l8 8 l15 -16" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;

function icon(options: { scale: number; rounded: boolean }) {
  const offset = (100 - 100 * options.scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="${options.rounded ? 22 : 0}" fill="${TEAL}"/>
    <g transform="translate(${offset} ${offset}) scale(${options.scale})">${glyph("#FFFFFF", TEAL)}</g>
  </svg>`;
}

/** Android shows the badge as a mask: only its opaque pixels count. */
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${glyph("#FFFFFF", "#000000").replace('fill="#000000"', 'fill="none"')}</svg>`;

const root = process.cwd();
const icons = path.join(root, "public", "icons");
mkdirSync(icons, { recursive: true });

const render = (svg: string, size: number, file: string) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);

void Promise.all([
  render(icon({ scale: 1.2, rounded: true }), 192, path.join(icons, "icon-192.png")),
  render(icon({ scale: 1.2, rounded: true }), 512, path.join(icons, "icon-512.png")),
  // Launchers cut a maskable icon to any shape: the drawing stays inside the safe circle.
  render(icon({ scale: 0.95, rounded: false }), 512, path.join(icons, "icon-maskable-512.png")),
  // iOS rounds the corners by itself and shows transparency as black.
  render(icon({ scale: 1.15, rounded: false }), 180, path.join(root, "src", "app", "apple-icon.png")),
  render(badge, 72, path.join(icons, "badge-72.png")),
]);
