// The game's name for the cover picture, in its own lettering: one transparent 1260x420 PNG.
//   node tools/trailer/covertitle.mjs <out.png>
import { launch } from '../browser.mjs';
const out = process.argv[2] || 'trailer/cover-title.png';
const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jacquard+24&display=swap">
<style>
  html, body { margin: 0; background: transparent; }
  h1 { margin: 0; width: 1260px; height: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff3d6;
       font: 400 196px/0.8 'Jacquard 24', serif; letter-spacing: 0.01em; -webkit-text-stroke: 22px #120a06; paint-order: stroke fill; text-shadow: 0 10px 0 #120a06; }
  h1 em { font-style: normal; color: #f0b942; }
  h1 span { font-size: 150px; }
</style><h1><span>Shave the</span><em>Mammoth</em></h1>`;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1260, height: 420 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, omitBackground: true });
await browser.close();
