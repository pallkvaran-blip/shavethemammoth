// Pictures of a model file from several sides, in several lights, on one sheet.
//   python3 -m http.server 4180 --directory tools/cast      (first, and left running: it serves the viewer and the file)
//   node tools/cast/view/view.mjs <glb, relative to tools/cast> <out.jpg> [views: "az,el,zoom,cx,cy;..."] [modes: lit,clay,wire,base,normal,rough]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [glb, out, viewsArg = '0,5,1;35,8,1;90,5,1;180,5,1', modesArg = 'lit,clay', W = '700', H = '900'] = process.argv.slice(2);
const views = viewsArg.split(';').map((v) => v.split(',').map(Number)), modes = modesArg.split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
const files = [];
for (const mode of modes) {
  const [m, extra = ''] = mode.split('+');
  await page.goto(`http://localhost:4180/view/viewer.html?glb=${encodeURIComponent('../' + glb)}&mode=${m}${extra ? '&' + extra : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 600000 });
  if (mode === modes[0]) console.log(JSON.stringify(await page.evaluate(() => window.__info)));
  for (let i = 0; i < views.length; i++) {
    await page.evaluate((v) => window.view(...v), views[i]);
    const f = `${out}.${mode.replace(/\W/g, '')}.${i}.png`;
    await page.screenshot({ path: f }); files.push(f);
  }
}
await browser.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
files = sys.argv[2:]; cols = int(sys.argv[1])
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows))
for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save('${out}', quality=90)
import os
for f in files: os.remove(f)
print('sheet', sheet.size)
`, String(views.length), ...files], { stdio: 'inherit' });
