// Checks the opening: the legend is told on the loading screen, one line at a time, each coming towards the viewer;
// the scene opens in first person when the telling and the making are both done; a key press or a click skips it.
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
  // The page keeps its own record of what the opening showed, in order. (Asking it from outside every so often is
  // not enough: without a graphics card a single frame can take seconds, and nothing can be asked of a page in the
  // middle of a frame.)
  await page.addInitScript(() => {
    window.__seen = [];
    const note = () => {
      const b = document.body;
      if (!b) return;
      const s = { telling: b.classList.contains('telling'), ready: b.classList.contains('ready'), told: b.classList.contains('told'), elf: b.classList.contains('elf'), at: performance.now() };
      const last = window.__seen[window.__seen.length - 1];
      if (!last || last.telling !== s.telling || last.ready !== s.ready || last.told !== s.told) window.__seen.push(s);
    };
    new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  });
  return page;
};
/** What the opening is showing right now. */
const look = (page) => page.evaluate(() => {
  const b = document.body.classList, g = window.__game;
  return {
    telling: b.contains('telling'), ready: b.contains('ready'), told: b.contains('told'), elf: b.contains('elf'),
    hud: +getComputedStyle(document.getElementById('hud')).opacity, cover: getComputedStyle(document.getElementById('loading')).pointerEvents,
    mode: g ? g.rig.mode : null, hand: g ? g.shaving.tool.id : null, dialog: g ? !!g.game.dialog : null,
    at: g ? [g.rig.pos.x, g.rig.pos.z] : null, hint: (document.getElementById('hint')?.textContent || '').trim(),
  };
});
/**
 * The legend's lines as they stand at each of `times` (seconds into the telling): how much of each can be seen, and
 * how large. (The lines move by the page's own clock, which this holds still and sets, all in one go: a machine
 * without a graphics card is in no state to be watched in real time, and the telling does not wait for it.)
 */
const linesAt = (page, times) => page.evaluate((times) => {
  const ps = [...document.querySelectorAll('#legend p')], as = ps.map((p) => p.getAnimations()[0]);
  return times.map((t) => ps.map((p, i) => {
    if (!as[i]) return { opacity: 0, scale: 0 };
    as[i].pause(); as[i].currentTime = t * 1000;
    const cs = getComputedStyle(p), m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
    return { opacity: +cs.opacity, scale: m.a };
  }));
}, times);

/** The controls fade in over a second or so (and without a graphics card a "second" of animation can take many): wait for them. */
const controlsUp = (page) => page.waitForFunction(() => +getComputedStyle(document.getElementById('hud')).opacity > 0.9, null, { timeout: 180000 }).then(() => true, () => false);

// ---- 1. left alone, the whole legend is told, on the loading screen, and then the scene opens in first person ----
console.log('told in full:');
let page = await open();
await page.goto(url, { waitUntil: 'load' });
const text = await page.$$eval('#legend p', (ps) => ps.map((p) => p.textContent.trim()));
console.log('  ' + text.map((t) => `"${t}"`).join('\n  '));
await page.waitForFunction(() => document.body.classList.contains('telling'), null, { timeout: 60000 });
const how = await page.$$eval('#legend p', (ps) => ps.map((p) => { const c = getComputedStyle(p); return { name: c.animationName, delay: parseFloat(c.animationDelay), lasts: parseFloat(c.animationDuration), size: parseFloat(c.fontSize), colour: c.color }; }));
check(how.every((h) => h.name === 'legend-come') && how[0].delay < how[1].delay && how[1].delay < how[2].delay && Math.abs(how[1].delay - how[0].delay - how[0].lasts) < 0.01,
  `the lines come one after another (at ${how.map((h) => h.delay + ' s').join(', ')})`);
const rgb = (how[2].colour.match(/\d+/g) || []).map(Number);
check(how[2].size > how[0].size * 1.2 && rgb[0] > 180 && rgb[1] < 90 && rgb[2] < 90 && how[0].colour !== how[2].colour, `the last line is larger and red (${how[2].size}px against ${how[0].size}px, ${how[2].colour})`);
await page.waitForFunction(() => document.body.classList.contains('told'), null, { timeout: 400000 });
const seen = (await page.evaluate(() => window.__seen)).map((s) => ({ ...s, at: s.at / 1000 }));
for (const s of seen) console.log(`  ${s.at.toFixed(1).padStart(6)} s: ${s.telling ? 'the legend is being told' : s.told ? 'legend over' : 'nothing yet'}, scene ${s.ready ? 'showing' : 'still dark'}`);
const began = seen.find((s) => s.telling), ended = seen.find((s) => s.told);
check(began && seen.filter((s) => s.telling).every((s) => !s.ready), 'the legend is told on the dark, while the scene is being made');
const total = how[2].delay + how[2].lasts;
check(began && ended && ended.at - began.at > total - 0.3, `and told to the end: ${(ended.at - began.at).toFixed(1)} s (the lines take ${total.toFixed(1)} s)`);
let up = await controlsUp(page);
let s = await look(page);
check(up && s.told && s.ready && s.cover === 'none', 'afterwards the scene shows, the controls come up and nothing covers them');
check(s.elf && s.mode === 'elf' && s.hand === 'scissors', `the game opens in first person, scissors in hand (${s.mode}, ${s.hand})`);
const far = s.at ? Math.hypot(s.at[0], s.at[1]) : 0;
check(far > 5 && far < 9, `standing back from him, where all of him can be seen (${far.toFixed(1)} m off)`);
await page.waitForFunction(() => /cutting/i.test(document.getElementById('hint')?.textContent || ''), null, { timeout: 120000 }).catch(() => {});
s = await look(page);
check(/start cutting the hair/i.test(s.hint) && !/hands|sell|Mortimer/i.test(s.hint), `the one tip to begin with is to start cutting ("${s.hint.slice(0, 50)}")`);
await page.waitForFunction(() => window.__game.game.says.history.length > 0, null, { timeout: 180000 }).catch(() => {});
const order = await page.evaluate(() => window.__game.game.says.history[0] || '');
check(/full trim please/.test(order), `and the mammoth's first words are his order ("${order}")`);
const booms = await page.evaluate(() => ({ n: window.__game.sound.booms || 0, state: window.__game.sound.ctx?.state }));
console.log(`  (sound here is ${booms.state}; booms sounded: ${booms.n})`);
check(booms.state !== 'running' || booms.n === 3, 'where the browser lets the page make a sound unasked, each line has its boom');
await page.close();

// ---- 2. a key pressed while the scene is still being made skips the legend, and does nothing else ----
console.log('skipped with a key while loading:');
page = await open();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(600);
await page.keyboard.press('KeyQ');     // Q would otherwise change what is in hand
s = await look(page);
check(!s.telling && !s.told, 'the telling stops at once; the scene is not ready yet');
await page.waitForFunction(() => document.body.classList.contains('ready'));
up = await controlsUp(page);
s = await look(page);
check(up && s.told && !s.telling && s.elf && s.hand === 'scissors', 'when the scene is ready it opens straight away, and the key did nothing else (the scissors are still in hand)');
await page.keyboard.press('KeyQ');
await page.waitForFunction(() => window.__game.shaving.tool.id !== 'scissors', null, { timeout: 60000 }).catch(() => {});
s = await look(page);
check(s.hand === 'hands', `after that, keys are commands again (Q: ${s.hand})`);
await page.close();

// ---- 3. each line comes up out of the dark, grows towards the viewer and goes; a click during the telling ends it ----
console.log('the lines, and skipped with a click part way through:');
page = await open();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('telling'), null, { timeout: 60000 });
const d = how.map((h) => h.delay);
const stills = await linesAt(page, [...d.flatMap((at, k) => [at + 0.8, at + how[k].lasts * 0.8]), d[2] + how[2].lasts - 0.05]);
for (const [k, name] of ['first', 'second', 'third'].entries()) {
  const early = stills[k * 2], late = stills[k * 2 + 1];
  check(early.every((l, i) => (i === k ? l.opacity > 0.9 : l.opacity < 0.05)), `the ${name} line shows alone (${early.map((l) => l.opacity.toFixed(2)).join(', ')})`);
  check(late[k].scale > early[k].scale * 1.1 && early[k].scale < 1, `and grows as it comes (${early[k].scale.toFixed(2)} to ${late[k].scale.toFixed(2)})`);
}
const gone = stills[6];
check(gone[2].opacity < 0.2 && gone[2].scale > 1.5, `each ends by sweeping past (${gone[2].scale.toFixed(2)} times its size, ${gone[2].opacity.toFixed(2)} seen)`);
s = await look(page);
check(s.telling && !s.ready, 'the legend is still being told');
await page.mouse.click(260, 150);
s = await look(page);
check(!s.telling, 'one click ends it');
await page.waitForFunction(() => document.body.classList.contains('ready'));
up = await controlsUp(page);
s = await look(page);
check(up && s.told && s.cover === 'none' && s.elf, 'and when the scene is ready the controls come up');
await page.close();

console.log(failures.length ? 'FAILED:\n' + failures.join('\n') : 'the opening behaves');
await browser.close();
process.exitCode = failures.length ? 1 : 0;
