// Checks the opening: the legend is told one line at a time, the controls
// come up when it ends, and a key press or a click skips it.
//   node tools/intro-test.mjs            (needs `npm run dev` running)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
const url = base + '?q=low&strands=20000&adapt=5&debug&sync';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); console.log(`  ${ok ? 'ok' : 'FAILED'}: ${what}`); };
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 520, height: 300 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => failures.push('pageerror: ' + e.message));
  return page;
};
/** What the opening is showing right now. */
const look = (page) => page.evaluate(() => {
  const b = document.body.classList, lines = [...document.querySelectorAll('#legend p')];
  return {
    line: lines.findIndex((p) => p.classList.contains('on')), ready: b.contains('ready'), told: b.contains('told'), elf: b.contains('elf'),
    hud: +getComputedStyle(document.getElementById('hud')).opacity, cover: getComputedStyle(document.getElementById('loading')).pointerEvents,
  };
});

/** The controls fade in over a second or so (and without a graphics card a "second" of animation can take many): wait for them. */
const controlsUp = (page) => page.waitForFunction(() => +getComputedStyle(document.getElementById('hud')).opacity > 0.9, null, { timeout: 180000 }).then(() => true, () => false);

// ---- 1. left alone, the whole legend is told ----
console.log('told in full:');
let page = await open();
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
const text = await page.$$eval('#legend p', (ps) => ps.map((p) => p.textContent.trim()));
console.log('  ' + text.map((t) => `"${t}"`).join('\n  '));
const seen = [];
let last = '';
for (;;) {
  const s = await look(page);
  const key = `${s.line}${s.ready}${s.told}`;
  if (key !== last) { seen.push({ ...s, at: ((Date.now() - t0) / 1000).toFixed(1) }); last = key; }
  if (s.told || Date.now() - t0 > 400000) break;
  await page.waitForTimeout(150);
}
for (const s of seen) console.log(`  ${s.at.padStart(6)} s: ${s.told ? 'legend over' : s.line < 0 ? 'no line' : 'line ' + (s.line + 1)}, scene ${s.ready ? 'showing' : 'still dark'}, controls ${s.hud > 0.5 ? 'up' : 'hidden'}`);
const order = seen.map((s) => (s.told ? 'end' : `${s.line + 1}${s.ready ? 'r' : 'd'}`)).join(' ');
check(/^1d( 1r)? 2r 3r end$/.test(order), `first line on the dark, the others over the scene, then the end (saw: ${order})`);
check(seen.filter((s) => !s.told).every((s) => s.hud < 0.5), 'the controls stay hidden while the legend is told');
let up = await controlsUp(page);
let s = await look(page);
check(up && s.told && s.cover === 'none' && s.line < 0, 'afterwards the controls come up and nothing covers them');
await page.close();

// ---- 2. a key pressed while the scene is still being made skips the legend, and does nothing else ----
console.log('skipped with a key while loading:');
page = await open();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(600);
await page.keyboard.press('KeyE');     // E would otherwise start shaving
s = await look(page);
check(s.line < 0 && !s.told, 'the line leaves at once; the scene is not ready yet');
await page.waitForFunction(() => document.body.classList.contains('ready'));
up = await controlsUp(page);
s = await look(page);
check(up && s.told && s.line < 0 && !s.elf, 'when the scene is ready the controls come straight up, and the key did not also start shaving');
await page.keyboard.press('KeyE');
await page.waitForFunction(() => document.body.classList.contains('elf'), null, { timeout: 60000 }).catch(() => {});
s = await look(page);
check(s.elf, 'after that, keys are commands again (E starts shaving)');
await page.close();

// ---- 3. a click during the telling ends it ----
console.log('skipped with a click part way through:');
page = await open();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('ready'));
s = await look(page);
check(!s.told && s.line >= 0, 'the scene is showing and the legend is still being told');
await page.mouse.click(260, 150);
s = await look(page);
check(s.told && s.line < 0, 'one click ends it');
up = await controlsUp(page);
s = await look(page);
check(up && s.cover === 'none' && !s.elf, 'and the controls come up');
await page.close();

console.log(failures.length ? 'FAILED:\n' + failures.join('\n') : 'the opening behaves');
await browser.close();
