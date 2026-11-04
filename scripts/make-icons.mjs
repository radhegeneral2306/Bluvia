// Regenerates PNG icons from public/icons/icon.svg using the pre-installed Chromium (playwright).
import { createRequire } from 'node:module';
const require = createRequire(process.env.PW_ROOT + '/');
const { chromium } = require('playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const maskSvg = svg.replace(/<rect[^>]*\/>/, '<rect width="512" height="512" fill="#0f74c4"/>')
  .replace('<path d="M256 82', '<g transform="translate(256 256) scale(.72) translate(-256 -256)"><path d="M256 82')
  .replace('fill="none"/></svg>', 'fill="none"/></g></svg>');

const browser = await chromium.launch();
async function render(markup, size, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0"><div style="width:${size}px;height:${size}px">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`);
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
}
await render(svg, 192, 'public/icons/icon-192.png');
await render(svg, 512, 'public/icons/icon-512.png');
await render(svg, 180, 'public/icons/apple-touch-icon.png');
await render(maskSvg, 512, 'public/icons/maskable-512.png');
await browser.close();
