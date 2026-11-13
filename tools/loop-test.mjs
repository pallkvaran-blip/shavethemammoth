// Walks the whole game loop on the real page: a new game owns nothing but the
// small bad scissors and a pair of hands; hair is cut, picked up, carried to
// Mortimer and sold; the gold buys things from Gnorman; every broom and vacuum
// picks hair up; and the game is still there when the page is loaded again.
//
// Without a graphics card a frame takes seconds, so the playing is done by
// stepping the game itself (a sixtieth of a second at a time, nothing drawn)
// and only the keys and buttons are worked through the page.
//   node tools/loop-test.mjs            (needs `npm run dev` running)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const base = process.env.BASE || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|Shader Error|GL_INVALID|INVALID_/.test(m.text())) errors.push(m.text().slice(0, 600)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const check = (ok, what) => { if (!ok) errors.push('CHECK FAILED: ' + what); console.log(`  ${ok ? 'ok' : 'FAILED'}: ${what}`); };
const query = 'q=low&strands=40000&adapt=5&debug&sync&bare&elf=1.413,0.896,0.76,0.0';
const load = async (extra) => {
  await page.goto(`${base}?${query}${extra}`, { waitUntil: 'load' });
  await page.waitForFunction(() => (document.body.classList.contains('ready') && window.__game) || document.getElementById('status')?.textContent.startsWith('The scene could not'), null, { timeout: 600000 });
};

await load('&fresh');
// helpers that live in the page: step the game, stand somewhere, cut, pick up
await page.evaluate(() => {
  const { shaving: s, mammoth, rig, camera, game, hero } = window.__game;
  const dt = 1 / 60, C = s.clippings, Pos = C.data.cPos, feet = mammoth.data.anat.feet;
  const T = (window.__t = {});
  T.frame = (n = 1) => { for (let k = 0; k < n; k++) { rig.update(dt); camera.updateMatrixWorld(true); s.update(dt, camera, rig.feel); game.update(dt); hero.update(dt); } };
  T.cutGrams = () => s.grams(mammoth.cutLength);
  /** Work round part of a leg for some seconds with whatever is in hand, the eyes going up and down it. */
  T.cutRound = (footIndex, from, sweep, seconds) => {
    const foot = feet[footIndex], before = T.cutGrams();
    let d = foot.r + 0.3;
    rig.pos.x = foot.c[0] + Math.cos(from) * d; rig.pos.z = foot.c[2] + Math.sin(from) * d;
    rig.keys.add('KeyW');
    const put = (t) => {
      const at = from + sweep * (t / seconds);
      d = Math.min(d, Math.hypot(rig.pos.x - foot.c[0], rig.pos.z - foot.c[2]) || d);
      rig.pos.x = foot.c[0] + Math.cos(at) * d; rig.pos.z = foot.c[2] + Math.sin(at) * d;
      rig.yaw = Math.atan2(-(foot.c[0] - rig.pos.x), -(foot.c[2] - rig.pos.z));
      rig.pitch = 0.15 + 0.45 * Math.sin((t / 3.1) * Math.PI * 2);
    };
    put(0); T.frame(30);
    s.squeeze(true);
    for (let k = 0; k < seconds * 60; k++) { put(k * dt); T.frame(); }
    s.squeeze(false);
    rig.keys.delete('KeyW');
    T.frame(240);                      // let it all fall
    return T.cutGrams() - before;
  };
  /** The piece of cut hair nearest the elf that is still lying about (-1 if there is none). */
  T.nearest = () => {
    let best = -1, bd = 1e9;
    for (let k = 0; k < C.count; k++) {
      if (C.value[k] <= 0 || C.state[k] === 3) continue;
      const dx = Pos[k * 4] - rig.pos.x, dz = Pos[k * 4 + 2] - rig.pos.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  /** Go to where that piece can be got at with what is in hand, as a player would: walk up, look at it, or put the broom on it. */
  T.aimAt = (k) => {
    const x = Pos[k * 4], z = Pos[k * 4 + 2], def = s.tool.def;
    let ux = rig.pos.x - x, uz = rig.pos.z - z;
    const l = Math.hypot(ux, uz) || 1;
    ux /= l; uz /= l;
    const back = def.level ? def.tip * 0.97 : Math.min(0.22, def.sweep.ahead);
    rig.pos.x = x + ux * back; rig.pos.z = z + uz * back;
    rig.yaw = Math.atan2(ux, uz);
    rig.pitch = def.level ? -0.25 : -Math.atan2(0.17, back);
    T.frame(6);
    if (def.level) {
      // a broom takes what is under its head: shuffle until it is
      const e = s.tool.end(new (rig.pos.constructor)());
      rig.pos.x += x - e.x; rig.pos.z += z - e.z;
      T.frame(6);
    }
  };
  /** Pick up until there is nothing left to pick up, the sack is full, or patience runs out. Returns the grams gained. */
  T.collect = (tries = 60) => {
    const before = game.state.hair;
    for (let n = 0; n < tries && game.state.room > 0.5; n++) {
      const k = T.nearest();
      if (k < 0) break;
      T.aimAt(k);
      s.squeeze(true); T.frame(s.tool.def.motor ? 90 : 40); s.squeeze(false); T.frame(s.tool.def.motor ? 50 : 20);
    }
    return game.state.hair - before;
  };
  T.goTo = (who) => {
    const at = game.people[who];
    rig.pos.x = at.front[0]; rig.pos.z = at.front[1];
    rig.yaw = Math.atan2(-(at.x - rig.pos.x), -(at.z - rig.pos.z)); rig.pitch = 0.1;
    T.frame(10);
  };
  T.shown = () => [...document.querySelectorAll('[data-tool]')].filter((b) => !b.hidden).map((b) => b.dataset.tool + ':' + b.lastChild.textContent.trim()).join(', ');
  T.inHand = () => s.next || s.tool.id;
});
const T = (body, arg) => page.evaluate(new Function('arg', `const T = window.__t, { shaving: s, mammoth, rig, camera, game, hero } = window.__game, st = game.state, C = s.clippings; ${body}`), arg);
const round = (v) => Math.round(v * 10) / 10;

// ---- a new game opens on the elf being given his scissors ----
let v = await T(`T.frame(60); return { id: hero.playing && hero.playing.id, t: hero.playing && hero.playing.t, cine: document.body.classList.contains('cine'), what: document.querySelector('#got .what').textContent, quip: document.querySelector('#got .quip').textContent, shown: document.getElementById('got').classList.contains('show'), showing: s.showing && s.showing.id, cam: !!rig.cine, far: rig.cine ? Math.hypot(camera.position.x - rig.pos.x, camera.position.z - rig.pos.z) : 0 }`);
console.log(`the first scene: "You got the ${v.what}" / "${v.quip}"; a second in, the camera is ${round(v.far * 100)} cm from him`);
check(v.id === 'scissors' && v.cine && v.cam && v.showing === 'scissors' && v.shown, 'climbing down for the first time plays the scene for the small bad scissors');
check(v.far > 0.3, 'seen from outside the elf');
await page.keyboard.press('KeyW');      // any key gets on with it
v = await T(`const skipped = hero.playing && hero.playing.skipped; T.frame(60); return { skipped, playing: !!hero.playing, cine: document.body.classList.contains('cine'), cam: !!rig.cine, showing: s.showing, hand: T.inHand(), visible: s.tool.group.visible, got: !!(st.flags.got && st.flags.got.scissors), banner: document.getElementById('got').hidden, fov: camera.fov }`);
check(v.skipped === true, 'a key cuts it short');
check(!v.playing && !v.cine && !v.cam && v.showing === null && v.banner, 'afterwards the bars, the banner and the outside camera are gone');
check(v.hand === 'scissors' && v.visible && v.fov === 62, 'and he is looking out of his own eyes again, scissors in hand');
check(v.got, 'the game remembers he has had his moment');

// ---- a new game ----
v = await T(`return { owned: [...st.owned].sort().join(','), gold: st.gold, hair: st.hair, cap: st.capacity, hand: T.inHand(), shown: T.shown(), two: game.chooseNumber(1), mode: rig.mode }`);
console.log(`new game: owns ${v.owned}; ${v.gold} gold; in hand: ${v.hand}; buttons: ${v.shown}`);
check(v.owned === 'hands,scissors' && v.gold === 0 && v.hand === 'scissors', 'a new game has the small bad scissors, bare hands and no gold');
check(/^scissors:[^,]*, sweep:Bare hands$/.test(v.shown), 'only the scissors and the hands are offered');
check(v.two === false, 'key 2 does nothing: the shears are not owned yet');

// ---- cut ----
v = await T(`const g = T.cutRound(0, 0.3, Math.PI / 2, 60); return { g, lying: C.lying, snips: s.snips }`);
console.log(`bad scissors, a minute round the foreleg: ${round(v.g)} g cut in ${v.snips} strokes; ${round(v.lying)} g lying on the snow`);
check(v.g > 8, 'a minute with the bad scissors cuts a fair handful');
check(Math.abs(v.lying - v.g) < 0.02 * v.g + 0.05, 'every gram cut is lying about to be picked up');
const cutFirst = v.g;

// ---- pick up, by hand (the Q key) ----
await page.keyboard.press('KeyQ');
v = await T(`T.frame(40); const hand = s.tool.id; const got = T.collect(80); return { hand, got, hair: st.hair, lying: C.lying, cap: st.capacity, picked: st.stats.picked }`);
console.log(`bare hands: picked up ${round(v.got)} g; pockets ${round(v.hair)} of ${v.cap} g; ${round(v.lying)} g still lying`);
check(v.hand === 'hands', 'Q puts the scissors away and brings up the hands');
check(v.got > 0.85 * Math.min(cutFirst, v.cap), 'looking at cut hair and holding the button picks it up');
check(v.hair <= v.cap + 1e-6, 'the pockets do not hold more than they hold');

// ---- sell it to Mortimer (E, then his button) ----
v = await T(`T.goTo('vulture'); return { near: game.nearby(), prompt: document.getElementById('prompt').textContent.trim(), hidden: document.getElementById('prompt').hidden, hair: st.hair }`);
check(v.near === 'vulture' && !v.hidden && /Mortimer/.test(v.prompt), `standing at the wig table offers "${v.prompt}"`);
const carried = v.hair;
await page.keyboard.press('KeyE');
v = await T(`return { dialog: game.dialog, open: !document.getElementById('dialog').hidden, text: document.querySelector('#dialog .sheet').innerText.replace(/\\n+/g, ' | ').slice(0, 200), busy: rig.busy }`);
console.log(`  Mortimer: ${v.text}`);
check(v.dialog === 'vulture' && v.open && v.busy, 'E opens his scales, and the elf stands still for it');
await page.click('#dialog [data-act="sell"]');
v = await T(`return { gold: st.gold, hair: st.hair, sold: st.stats.sold }`);
console.log(`  sold ${round(carried)} g for ${v.gold} gold`);
check(v.gold === Math.floor(carried * 0.25 + 1e-6) && v.hair === 0, 'he pays a quarter of a gold a gram, rounded down in his favour, and the pockets are empty');
await page.keyboard.press('KeyE');
v = await T(`return { dialog: game.dialog, busy: rig.busy, mode: rig.mode }`);
check(v.dialog === null && !v.busy && v.mode === 'elf', 'E again leaves him, still in the elf\'s shoes');

// ---- buy from Gnorman ----
await T(`T.goTo('gnome')`);
await page.keyboard.press('KeyE');
v = await T(`return { dialog: game.dialog, text: document.querySelector('#dialog .sheet').innerText.replace(/\\n+/g, ' | ').slice(0, 160), gold: st.gold, sections: [...document.querySelectorAll('#dialog h3')].map((h) => h.textContent).join(', ') }`);
console.log(`  Gnorman: ${v.text} ...`);
console.log(`  his sections: ${v.sections}`);
check(v.dialog === 'gnome', 'E at the stall opens the shop');
const before = v.gold;
await page.click('#dialog [data-buy="electric"]');
v = await T(`return { gold: st.gold, owns: st.owns('electric'), said: game.said }`);
check(v.gold === before && !v.owns, `the electric shears cannot be had for ${before} gold ("${v.said}")`);
await T(`st.earn(Math.max(0, 15 - st.gold))`);       // (in case the scissors were unlucky)
await page.click('#dialog [data-buy="sheep"]');
// ...which he holds up for everyone to see, all the way through this time
v = await T(`T.frame(90); return { id: hero.playing && hero.playing.id, what: document.querySelector('#got .what').textContent, dialogSeen: getComputedStyle(document.getElementById('dialog')).pointerEvents !== 'none', lift: hero.elf.pose.lift, handY: hero.elf.hand('R').y - hero.elf.group.position.y, toolY: s.tools.sheep.group.matrix.elements[13] - hero.elf.group.position.y, gap: Math.hypot(rig.pos.x - game.people.gnome.x, rig.pos.z - game.people.gnome.z) }`);
console.log(`  the shears scene: "You got the ${v.what}"; his hand is ${round(v.handY * 100)} cm up, ${round(v.gap * 100)} cm from the stall`);
check(v.id === 'sheep' && !v.dialogSeen, 'buying the shears plays their scene, and the shop steps back for it');
check(v.lift > 0.9 && v.handY > 0.19 && v.toolY > 0.15, 'he holds them over his head');
check(v.gap > 1.2, 'with room for the camera to go round him clear of the stall');
v = await T(`let n = 0; while (hero.playing && n < 600) { T.frame(); n++; } T.frame(30); return { n, playing: !!hero.playing, dialog: game.dialog, dialogSeen: getComputedStyle(document.getElementById('dialog')).pointerEvents !== 'none', busy: rig.busy, gold: st.gold, owns: st.owns('sheep'), hand: T.inHand(), shown: T.shown(), two: game.chooseNumber(1) }`);
console.log(`  it ran ${round((v.n + 90) / 60)} s`);
check(!v.playing && v.dialog === 'gnome' && v.dialogSeen && v.busy, 'when it is over the shop is open again');
check(v.owns && v.hand === 'sheep', 'buying the shears puts them in hand');
check(/sheep:/.test(v.shown) && v.two === true, 'and key 2 and their button now work');
await page.keyboard.press('KeyE');

// ---- every broom and vacuum picks hair up; nothing holds more than it holds ----
await T(`st.earn(4000); game.buy('garden'); T.frame(40)`);
for (const [id, name] of [['twig', 'twig broom'], ['push', 'push broom'], ['handvac', 'hand vacuum'], ['shopvac', 'shop vacuum']]) {
  v = await T(`
    const lying0 = C.lying;
    game.choose('garden'); T.frame(40);
    const cut = T.cutRound(${id === 'twig' || id === 'handvac' ? 1 : 2}, ${id === 'twig' || id === 'push' ? 0.4 : 2.4}, 0.8, 6);
    game.buy('${id}');
    const sweeper = st.sweeper;
    game.toggleSweep(); T.frame(40);
    const hand = s.tool.id, room = st.room, lying = C.lying;
    const got = T.collect(25);
    T.frame(120);
    return { cut, sweeper, hand, room, lying, got: st.hair - (st.capacity - room), hair: st.hair, cap: st.capacity, left: C.lying, inFlight: C.inFlight };
  `);
  console.log(`${name}: ${round(v.cut)} g cut with the clippers, ${round(v.lying)} g lying; picked up ${round(v.got)} g in at most 25 goes; carrying ${round(v.hair)} of ${v.cap} g; ${round(v.left)} g left lying`);
  check(v.sweeper === id && v.hand === id, `buying the ${name} makes it the thing Q brings up`);
  check(v.got > 0.5 * Math.min(v.lying, v.room) - 0.5, `the ${name} picks hair up`);
  check(v.hair <= v.cap + 1e-6, 'and does not overfill');
  // a bigger sack after the first, so the next has room
  await T(`if (st.room < 200) { game.buy('sack'); } if (st.room < 200) { T.goTo('vulture'); game.interact(); game.sell(); game.close(); }`);
}
v = await T(`return { level: st.level('sack'), cap: st.capacity, name: game.sackName(), bag: document.getElementById('bag').textContent }`);
console.log(`carrying in: ${v.name} (${v.cap} g); the display says "${v.bag}"`);

// ---- a full sack: the hair stays where it is, and the player is told ----
v = await T(`
  game.choose('garden'); T.frame(40);
  T.cutRound(3, 0.4, 1.2, 8);
  st.hair = st.capacity - 2;
  game.toggleSweep(); T.frame(40);
  const lying = C.lying;
  T.collect(4);
  return { hair: st.hair, cap: st.capacity, lying, left: C.lying, hint: document.getElementById('hint')?.textContent || '' };
`);
check(v.hair <= v.cap + 1e-6 && v.left > v.lying - 3, `with 2 g of room, ${round(v.lying - v.left)} g is taken and the rest left lying`);
check(/full/i.test(v.hint), `and the player is told ("${v.hint.trim().slice(0, 60)}")`);

// ---- it is all still there after the page is loaded again ----
const kept = await T(`
  game.choose('sheep'); T.frame(40);
  game.save(true);
  const raw = localStorage.getItem('mammoth-save-3');
  return { gold: st.gold, hair: st.hair, owned: [...st.owned].sort().join(','), sack: st.level('sack'), sweeper: st.sweeper, tool: st.tool, shorn: mammoth.shorn, bytes: raw ? raw.length : 0 };
`);
console.log(`kept: ${kept.gold} gold, ${round(kept.hair)} g, [${kept.owned}], shorn ${(kept.shorn * 100).toFixed(3)}% (${kept.bytes} bytes in the browser's storage)`);
check(kept.bytes > 100, 'the game is written to the browser\'s storage');
await load('');
v = await page.evaluate(() => {
  const { shaving: s, mammoth, game } = window.__game, st = game.state;
  return { resumed: game.resumed, gold: st.gold, hair: st.hair, owned: [...st.owned].sort().join(','), sack: st.level('sack'), sweeper: st.sweeper, tool: st.tool, hand: s.tool.id, shorn: mammoth.shorn };
});
check(await page.evaluate(() => !window.__game.hero.playing), 'no scene is played for scissors he has already been given');
console.log(`after loading the page again: ${v.gold} gold, ${round(v.hair)} g, [${v.owned}], shorn ${(v.shorn * 100).toFixed(3)}%, in hand: ${v.hand}`);
check(v.resumed === true, 'the kept game is taken up again');
check(v.gold === kept.gold && Math.abs(v.hair - kept.hair) < 1e-6 && v.owned === kept.owned && v.sack === kept.sack && v.sweeper === kept.sweeper, 'gold, hair and everything bought are as they were');
check(v.hand === kept.tool, 'the tool last used is in hand');
check(Math.abs(v.shorn - kept.shorn) < 0.02 * kept.shorn + 1e-5, 'and so is the haircut');

// ---- and a new game can be started over it ----
v = await page.evaluate(() => {
  const { shaving: s, mammoth, game } = window.__game, st = game.state;
  game.restart();
  return { gold: st.gold, owned: [...st.owned].sort().join(','), shorn: mammoth.shorn, hand: s.next || s.tool.id, raw: localStorage.getItem('mammoth-save-3') };
});
check(v.gold === 0 && v.owned === 'hands,scissors' && v.shorn === 0 && v.hand === 'scissors', 'starting again gives back the coat and takes everything else');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no script errors');
await browser.close();
process.exitCode = errors.length ? 1 : 0;
