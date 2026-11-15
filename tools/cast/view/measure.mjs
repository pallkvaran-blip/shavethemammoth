// A model file seen square-on under a grid in metres (see measure.html), for reading off where things are on it.
//   python3 -m http.server 4180 --directory tools/cast      (first, and left running)
//   node tools/cast/view/measure.mjs <glb relative to tools/cast> <out.png> "<dir=front|back|left|right|top&cx=..&cy=..&half=..&step=..&mode=lit|base|clay>" [w] [h]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [glb, out, query = '', W = '1000', H = '1000'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:4180/view/measure.html?glb=${encodeURIComponent('../' + glb)}&${query}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 600000 });
await page.screenshot({ path: out });
await browser.close(); console.log('saved', out);
