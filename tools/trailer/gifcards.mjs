// The few words on the Reddit gif, in the game's typefaces: transparent 960x540 PNGs.
//   node tools/trailer/gifcards.mjs [out dir]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../browser.mjs';

const out = process.argv[2] || 'trailer/gifcards';
fs.mkdirSync(out, { recursive: true });
const cap = (t) => `<p class="cap">${t}</p>`;
const CARDS = {
  mammoth: cap('One mammoth.'), elf: cap('One very small elf.'), tools: cap('Better tools.'), ideas: cap('Worse ideas.'),
  title: '<div class="end"><h1><span>Shave the</span> <em>Mammoth</em></h1><p class="sub">Free, in your browser</p></div>',
};
const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jacquard+24&family=Grenze:wght@500;600;700&display=swap">
<style>
  html, body { margin: 0; background: transparent; }
  .card { position: absolute; inset: 0; width: 960px; height: 540px; display: none; color: #fff3d6; }
  .card.on { display: block; }
  p, h1 { margin: 0; }
  .cap { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; font: 700 62px/1 'Grenze', Georgia, serif; letter-spacing: 0.02em;
         -webkit-text-stroke: 10px #140c07; paint-order: stroke fill; text-shadow: 0 5px 0 #140c07; }
  .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f0c0a; }
  h1 { font: 400 124px/0.95 'Jacquard 24', serif; text-shadow: 0 5px 0 #1a0f08; }
  h1 em { font-style: normal; color: #e2b04a; }
  .sub { font: 600 40px/1 'Grenze', Georgia, serif; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 30px; color: #d9c8a4; }
</style>
${Object.entries(CARDS).map(([k, v]) => `<div class="card" id="${k}">${v}</div>`).join('\n')}`;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
for (const k of Object.keys(CARDS)) {
  await page.evaluate((id) => document.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.id === id)), k);
  await page.screenshot({ path: path.join(out, `${k}.png`), omitBackground: true });
}
console.log(`${Object.keys(CARDS).length} cards in ${out}`);
await browser.close();
