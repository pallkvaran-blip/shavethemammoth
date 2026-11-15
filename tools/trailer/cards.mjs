// Draws the trailer's lettering in the game's own typefaces: one transparent 1280x720 PNG for each card.
//   node tools/trailer/cards.mjs [out dir]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../browser.mjs';

const out = process.argv[2] || 'trailer/cards';
fs.mkdirSync(out, { recursive: true });
const line = (text, cls = '') => `<p class="line ${cls}">${text}</p>`;
const quote = (words, who) => `<p class="quote">&ldquo;${words}&rdquo;</p><p class="who">${who}</p>`;
const CARDS = {
  years: line('Ten thousand years ago'),
  ice: line('He survived the ice.'),
  spears: line('He survived the spears.'),
  nothing: line('But nothing could prepare him'),
  haircut: line('for a haircut.', 'big'),
  elf: line('One elf.'),
  tall: line('Twenty centimetres tall.'),
  scissors: line('One pair of small, bad scissors.'),
  excuse: quote('Excuse me. Did you just... you did.', 'The mammoth'),
  every: line('Every.', 'huge'), last: line('Last.', 'huge'), hair: line('Hair.', 'huge red'),
  title: '<h1><span>Shave the</span> <em>Mammoth</em></h1>',
  now: line('Now shaving in a browser near you') + '<p class="small">No mammoths were harmed. One was embarrassed.</p>',
  look: '<div class="low">' + quote('Don&rsquo;t look at me.', 'The mammoth') + '</div>',
};
const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jacquard+24&family=Grenze+Gotisch:wght@400..800&family=Grenze:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&display=swap">
<style>
  html, body { margin: 0; background: transparent; }
  .card { position: absolute; inset: 0; width: 1280px; height: 720px; display: none; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #f3e6c8; }
  .card.on { display: flex; }
  p, h1 { margin: 0; }
  .line { font: 500 50px/1.2 'Grenze', Georgia, serif; letter-spacing: 0.22em; margin-right: -0.22em; text-transform: uppercase; text-shadow: 0 0 24px rgba(243, 230, 200, 0.28), 0 2px 0 rgba(0, 0, 0, 0.6); }
  .line.big { font-size: 76px; letter-spacing: 0.26em; margin-right: -0.26em; font-weight: 600; }
  .line.huge { font-size: 150px; letter-spacing: 0.12em; margin-right: -0.12em; font-weight: 700; }
  .line.red, .red { color: #e0291a; text-shadow: 0 0 40px rgba(210, 30, 14, 0.55), 0 3px 0 #2b0704; }
  .quote { font: italic 500 50px/1.25 'Grenze', Georgia, serif; max-width: 900px; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 0, 0, 0.8); }
  .who { font: 600 26px/1 'Grenze', Georgia, serif; letter-spacing: 0.4em; margin: 26px -0.4em 0 0; text-transform: uppercase; color: #e2b04a; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 0, 0, 0.9); }
  .small { font: 500 27px/1 'Grenze', Georgia, serif; letter-spacing: 0.12em; margin-top: 34px; color: #b9a988; }
  h1 { font: 400 138px/0.95 'Jacquard 24', 'Grenze Gotisch', serif; letter-spacing: 0.01em; text-shadow: 0 5px 0 #1a0f08, 0 0 60px rgba(226, 176, 74, 0.35); }
  h1 em { font-style: normal; color: #e2b04a; }
  .low { position: absolute; left: 0; right: 0; bottom: 118px; display: flex; flex-direction: column; align-items: center; }
  .low .quote { font-size: 44px; }
</style>
${Object.entries(CARDS).map(([k, v]) => `<div class="card" id="${k}">${v}</div>`).join('\n')}`;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
for (const k of Object.keys(CARDS)) {
  await page.evaluate((id) => document.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.id === id)), k);
  await page.screenshot({ path: path.join(out, `${k}.png`), omitBackground: true });
}
console.log(`${Object.keys(CARDS).length} cards in ${out}`);
await browser.close();
