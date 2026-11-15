// Checks the opening: the legend is told on the loading screen from the moment loading begins, each line coming
// towards the viewer and staying until a click or a key sends it on; after the last, the scene opens in first person
// (as soon as it is made). Esc goes past the lot.
//   node tools/intro-test.mjs            (needs `npm run dev` running)
import { launch } from './browser.mjs';

const base = process.env.BASE || 'http://localhost:5173/';
const url = base + '?q=low&strands=20000&adapt=9&debug&sync';
const browser = await launch();
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); console.log(`  ${ok ? 'ok' : 'FAILED'}: ${what}`); };
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 520, height: 300 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => failures.push('pageerror: ' + e.message));
  // The page notes for itself how far loading had got when the legend began. (Asking from outside is too slow:
  // without a graphics card nothing can be asked of a page while it is busy making a mammoth.)
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (window.__began || !document.body || !document.body.classList.contains('telling')) return;
      window.__began = { status: document.getElementById('status')?.textContent || '', game: !!window.__game, at: performance.now() };
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  return page;
};
/** What the opening is showing right now. */
const look = (page) => page.evaluate(() => {
  const b = document.body.classList, g = window.__game, lines = [...document.querySelectorAll('#legend p')];
  return {
    telling: b.contains('telling'), ready: b.contains('ready'), told: b.contains('told'), elf: b.contains('elf'),
    line: lines.findIndex((p) => p.classList.contains('now')), made: document.getElementById('status')?.textContent === 'Ready',
    hud: +getComputedStyle(document.getElementById('hud')).opacity, cover: getComputedStyle(document.getElementById('loading')).pointerEvents,
    mode: g ? g.rig.mode : null, hand: g ? g.shaving.tool.id : null,
    at: g ? [g.rig.pos.x, g.rig.pos.z] : null, hint: (document.getElementById('hint')?.textContent || '').trim(),
    booms: g ? g.sound.booms || 0 : -1,
  };
});
const made = (page) => page.waitForFunction(() => document.body.classList.contains('loaded') && window.__game, null, { timeout: 400000 });
const lineIs = (page, k) => page.waitForFunction((k) => [...document.querySelectorAll('#legend p')].findIndex((p) => p.classList.contains('now')) === k, k, { timeout: 60000 }).then(() => true, () => false);
/** The controls fade in over a second or so (and without a graphics card a "second" of animation can take many): wait for them. */
const controlsUp = (page) => page.waitForFunction(() => +getComputedStyle(document.getElementById('hud')).opacity > 0.9, null, { timeout: 180000 }).then(() => true, () => false);
const pause = (page) => page.waitForTimeout(450);      // (a click straight after another is taken for the second half of a double click)

// ---- 1. everything loads first; a click begins the legend; each line waits to be clicked on; after the last, the game opens ----
console.log('loaded, begun with a click, told a line at a time:');
let page = await open();
await page.goto(url, { waitUntil: 'load' });
const text = await page.$$eval('#legend p', (ps) => ps.map((p) => p.textContent.trim()));
console.log('  ' + text.map((t) => `"${t}"`).join('\n  '));
const early = await page.evaluate(() => ({ telling: document.body.classList.contains('telling'), pct: document.getElementById('pct')?.textContent, bar: !!document.getElementById('bar') }));
check(!early.telling && early.bar && /%$/.test(early.pct || ''), `while it loads there is a bar and a figure (${early.pct}), and no legend yet`);
await page.waitForFunction(() => document.body.classList.contains('loaded'), null, { timeout: 400000 });
let w = await page.evaluate(() => ({ telling: document.body.classList.contains('telling'), ready: document.body.classList.contains('ready'), pct: document.getElementById('pct').textContent, begin: getComputedStyle(document.getElementById('begin')).display !== 'none', words: document.getElementById('begin').textContent.trim(), bar: getComputedStyle(document.getElementById('track')).display !== 'none' }));
check(!w.telling && !w.ready && w.begin && !w.bar && w.pct === '100%', `loaded, it asks for a click ("${w.words.slice(0, 14)}") and waits: no legend, no scene`);
await page.mouse.click(260, 150);
check(await lineIs(page, 0), 'the click begins the legend: the first line comes');
const lock = await page.evaluate(() => ({ locked: !!document.pointerLockElement, frozen: window.__game.rig.frozen }));
console.log(`  (the pointer is ${lock.locked ? 'taken' : 'not taken here'}; the elf is ${lock.frozen ? 'held still' : 'free'})`);
check(lock.frozen, 'the elf does not look about while it is told');
const how = await page.$$eval('#legend p', (ps) => ps.map((p) => { const c = getComputedStyle(p); return { size: parseFloat(c.fontSize), colour: c.color }; }));
const rgb = (how[2].colour.match(/\d+/g) || []).map(Number);
check(how[2].size > how[0].size * 1.2 && rgb[0] > 180 && rgb[1] < 90 && rgb[2] < 90, `the last line is larger and red (${how[2].size}px against ${how[0].size}px, ${how[2].colour})`);
const grows = await page.evaluate(() => {
  const p = document.querySelector('#legend p.now'), a = p.getAnimations()[0];
  const at = (t) => { a.currentTime = t * 1000; const cs = getComputedStyle(p); return { opacity: +cs.opacity, scale: new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform).a }; };
  const now = a.currentTime; a.pause();
  const r = [at(0.15), at(2.6), at(20)];
  a.currentTime = now; a.play();
  return r;
});
check(grows[0].scale < 0.6 && grows[1].scale > 0.9 && grows[1].opacity > 0.99 && grows[2].scale > grows[1].scale + 0.05 && grows[2].opacity > 0.99,
  `it grows as it comes, and goes on growing while it waits (${grows.map((g) => g.scale.toFixed(2)).join(', ')} times its size)`);
await made(page);
let s = await look(page);
check(s.line === 0 && s.telling && !s.ready && !s.told, 'left alone, it stays on the first line');
await pause(page);
await page.mouse.click(260, 150);
check(await lineIs(page, 1), 'a click brings the second line');
await pause(page);
await page.mouse.click(260, 150);
check(await lineIs(page, 2), 'another, the third');
s = await look(page);
check(!s.told && !s.ready, 'and the scene still waits');
await pause(page);
await page.mouse.click(260, 150);
await page.waitForFunction(() => document.body.classList.contains('told'), null, { timeout: 60000 }).catch(() => {});
let up = await controlsUp(page);
s = await look(page);
check(up && s.told && s.ready && !s.telling && s.cover === 'none', 'a click on the last line opens the scene: the controls come up and nothing covers them');
check(s.elf && s.mode === 'elf' && s.hand === 'scissors', `the game opens in first person, scissors in hand (${s.mode}, ${s.hand})`);
const far = s.at ? Math.hypot(s.at[0], s.at[1]) : 0;
check(far > 5 && far < 9, `standing back from him, where all of him can be seen (${far.toFixed(1)} m off)`);
await page.waitForFunction(() => (window.__game.sound.booms || 0) >= 1, null, { timeout: 60000 }).catch(() => {});
s = await look(page);
check(s.booms >= 1, `the lines boom (${s.booms} sounded here; a machine this slow is late for some)`);
check(await page.evaluate(() => !window.__game.rig.frozen), 'and the elf is free to look about');
await page.waitForFunction(() => /cutting/i.test(document.getElementById('hint')?.textContent || ''), null, { timeout: 120000 }).catch(() => {});
s = await look(page);
check(/start cutting the hair/i.test(s.hint) && !/hands|sell|Mortimer/i.test(s.hint), `the one tip to begin with is to start cutting ("${s.hint.slice(0, 50)}")`);
await page.waitForFunction(() => window.__game.game.says.history.length > 0, null, { timeout: 180000 }).catch(() => {});
const order = await page.evaluate(() => window.__game.game.says.history[0] || '');
check(/full trim please/.test(order), `and the mammoth's first words are his order ("${order}")`);
await page.close();

// ---- 2. keys do as well as clicks, and do nothing else ----
console.log('with keys:');
page = await open();
await page.goto(url, { waitUntil: 'load' });
await page.keyboard.press('KeyQ');      // (before it has loaded: nothing)
await page.waitForFunction(() => document.body.classList.contains('loaded'), null, { timeout: 400000 });
s = await look(page);
check(!s.telling && s.line < 0, 'a key pressed while it loads begins nothing');
for (const k of [0, 1, 2]) { await page.keyboard.press('KeyQ'); check(await lineIs(page, k), `Q brings line ${k + 1}`); await pause(page); }      // (Q would otherwise change what is in hand)
await page.keyboard.press('KeyQ');
await page.waitForFunction(() => document.body.classList.contains('ready'));
up = await controlsUp(page);
s = await look(page);
check(up && s.told && s.elf && s.hand === 'scissors', 'after the last the scene opens, and the keys did nothing else (the scissors are still in hand)');
await page.keyboard.press('KeyQ');
await page.waitForFunction(() => window.__game.shaving.tool.id !== 'scissors', null, { timeout: 60000 }).catch(() => {});
s = await look(page);
check(s.hand === 'hands', `after that, keys are commands again (Q: ${s.hand})`);
await page.close();

// ---- 3. Esc goes past the lot ----
console.log('Esc:');
page = await open();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('loaded'), null, { timeout: 400000 });
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60000 }).catch(() => {});
up = await controlsUp(page);
s = await look(page);
check(up && s.told && !s.telling && s.cover === 'none' && s.elf, 'Esc, once it has loaded, opens the game with no legend (he is on the snow: that Esc was not a command)');
await page.close();

console.log(failures.length ? 'FAILED:\n' + failures.join('\n') : 'the opening behaves');
await browser.close();
process.exitCode = failures.length ? 1 : 0;
