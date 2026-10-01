// Gera os PNGs de ícone do PWA a partir de apps/web/public/icon.svg usando o Chromium do Playwright.
// Uso: node scripts/generate-icons.mjs (requer `npx playwright install chromium` na máquina).
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps/web');
const source = await readFile(join(web, 'public/icon.svg'), 'utf8');
const artwork = source
  .replace('<rect width="64" height="64" rx="10" fill="#7C3AED"/>', '')
  .replace(/^\s*<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim();

const maskable = scale => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#7C3AED"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${artwork}</g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
async function render(svg, size, filename) {
  const html = `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`;
  await page.setContent(html);
  await page.locator('svg').screenshot({ path: join(web, 'public', filename) });
  console.log(`Gerado: ${filename}`);
}
await render(source, 192, 'icon-192.png');
await render(source, 512, 'icon-512.png');
await render(maskable('0.72'), 192, 'icon-maskable-192.png');
await render(maskable('0.72'), 512, 'icon-maskable-512.png');
await render(maskable('0.8'), 180, 'apple-touch-icon.png');
await browser.close();
