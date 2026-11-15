// Walks the whole game loop on the real page: a new game owns nothing but the
// small bad scissors and a pair of hands; hair is cut, picked up, carried to
// Mortimer and sold; the gold buys things from Gnorman; every broom and vacuum
// picks hair up; and the game is still there when the page is loaded again.
//
// Without a graphics card a frame takes seconds, so the playing is done by
// stepping the game itself (a sixtieth of a second at a time, nothing drawn)
// and only the keys and buttons are worked through the page.
//   node tools/loop-test.mjs            (needs `npm run dev` running)
import { launch } from './browser.mjs';

const base = process.env.BASE || 'http://localhost:5173/';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram|Shader Error|GL_INVALID|INVALID_/.test(m.text())) errors.push(m.text().slice(0, 600)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const check = (ok, what) => { if (!ok) errors.push('CHECK FAILED: ' + what); console.log(`  ${ok ? 'ok' : 'FAILED'}: ${what}`); };
const query = 'q=low&strands=40000&adapt=9&debug&sync&bare&elf=1.413,0.896,0.76,0.0';
const load = async (extra) => {
  await page.goto(`${base}?${query}${extra}`, { waitUntil: 'load' });
  await page.waitForFunction(() => (document.body.classList.contains('ready') && window.__game) || document.getElementById('status')?.textContent.startsWith('The scene could not'), null, { timeout: 600000 });
};

await load('&fresh');
// helpers that live in the page: step the game, stand somewhere, cut, pick up
await page.evaluate(() => {
  const { shaving: s, mammoth, rig, camera, game, hero, lifter } = window.__game;
  const dt = 1 / 60, C = s.clippings, Pos = C.data.cPos, feet = mammoth.data.anat.feet;
  const T = (window.__t = {});
  // (everything the mammoth says, from the start: what he keeps himself is only the last few things)
  T.said = []; { const show = game.says._show.bind(game.says); game.says._show = (line) => { T.said.push(line); return show(line); }; }
  T.frame = (n = 1) => { for (let k = 0; k < n; k++) { rig.update(dt); camera.updateMatrixWorld(true); s.update(dt, camera, rig.feel); game.update(dt); hero.update(dt); lifter.update(dt); } };
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
  /** Pick up until there is nothing left to pick up, or patience runs out. Returns the grams gained. */
  T.collect = (tries = 60) => {
    const before = game.state.hair;
    for (let n = 0; n < tries; n++) {
      const k = T.nearest();
      if (k < 0) break;
      T.aimAt(k);
      s.squeeze(true); T.frame(s.tool.def.motor ? 90 : 40); s.squeeze(false); T.frame(s.tool.def.motor ? 50 : 20);
    }
    return game.state.hair - before;
  };
  /** Walk over whatever gold is lying about until there is none (or patience runs out). Returns the gold gained. */
  T.pickGold = () => {
    const K = game.coins, before = game.state.gold;
    for (let tries = 0; tries < 400 && (K.n > 0 || K.due.length); tries++) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < K.n; i++) {
        if (K.what[i] !== 1) continue;
        const d = (K.pos[i * 3] - rig.pos.x) ** 2 + (K.pos[i * 3 + 2] - rig.pos.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) { T.frame(20); continue; }
      rig.pos.x = K.pos[best * 3] + 0.12; rig.pos.z = K.pos[best * 3 + 2]; rig.height = 0;
      T.frame(22);
    }
    T.frame(30);
    return game.state.gold - before;
  };
  /** Let whatever a novelty has set going run its course (what he says, the look from outside, the gold coming to rest). */
  T.settle = (seconds = 12) => { let n = 0; while ((game.gags.acts.length || game.gags.shot || game.coins.due.length) && n < 60 * seconds) { T.frame(); n++; } T.frame(150); return n / 60; };
  T.goTo = (who) => {
    const at = game.people[who];
    rig.pos.x = at.front[0]; rig.pos.z = at.front[1];
    rig.yaw = Math.atan2(-(at.x - rig.pos.x), -(at.z - rig.pos.z)); rig.pitch = 0.1;
    T.frame(10);
  };
  T.shown = () => [...document.querySelectorAll('[data-tool]')].filter((b) => !b.hidden).map((b) => b.dataset.tool + ':' + b.lastChild.textContent.trim()).join(', ');
  T.inHand = () => s.next || s.tool.id;
});
const T = (body, arg) => page.evaluate(new Function('arg', `const T = window.__t, { shaving: s, mammoth, rig, camera, game, hero, lifter } = window.__game, st = game.state, C = s.clippings; ${body}`), arg);
const round = (v) => Math.round(v * 10) / 10;

// ---- a new game opens on the elf with his scissors in hand, and nothing is made of them: that is for what he buys ----
let v = await T(`T.frame(60); return { playing: !!hero.playing, cine: document.body.classList.contains('cine'), cam: !!rig.cine, shown: document.getElementById('got').classList.contains('show'), banner: document.getElementById('got').hidden, showing: s.showing, hand: T.inHand(), visible: s.tool.group.visible, fov: camera.fov, busy: rig.busy, hint: document.getElementById('hint').textContent }`);
check(!v.playing && !v.cine && !v.cam && v.showing === null && v.banner && !v.shown, 'climbing down for the first time plays no scene for the scissors he starts with');
check(v.hand === 'scissors' && v.visible && v.fov === 62 && !v.busy, 'he is looking out of his own eyes, scissors in hand, free to walk');
check(/start cutting the hair/i.test(v.hint) && !/hands|Mortimer|Q/.test(v.hint), `and is told one thing: to start cutting ("${v.hint.trim().slice(0, 60)}")`);

// ---- left alone for a moment, the mammoth places his order ----
v = await T(`T.frame(220); return { said: game.says.history.slice() }`);
check(v.said.length === 1 && /^Yes, hello, hi\. I.ll have a full trim please\.$/.test(v.said[0]), `before anything is cut he says one thing: "${v.said[0]}"`);

// ---- a new game ----
v = await T(`return { owned: [...st.owned].sort().join(','), gold: st.gold, hair: st.hair, hand: T.inHand(), shown: T.shown(), two: game.chooseNumber(1), mode: rig.mode }`);
console.log(`new game: owns ${v.owned}; ${v.gold} gold; in hand: ${v.hand}; buttons: ${v.shown}`);
check(v.owned === 'hands,scissors' && v.gold === 0 && v.hand === 'scissors', 'a new game has the small bad scissors, bare hands and no gold');
check(/^scissors:[^,]*, sweep:Bare hands$/.test(v.shown), 'only the scissors and the hands are offered');
check(v.two === false, 'key 2 does nothing: the shears are not owned yet');

// ---- cut ----
v = await T(`const g = T.cutRound(0, 0.3, Math.PI / 2, 60); return { g, lying: C.lying, snips: s.snips }`);
console.log(`bad scissors, a minute round the foreleg: ${round(v.g)} g cut in ${v.snips} strokes; ${round(v.lying)} g lying on the snow`);
check(v.g > 60 && v.g < 220, 'a minute with the bad scissors cuts most of a pocketful (and less than the shears would)');
check(Math.abs(v.lying - v.g) < 0.02 * v.g + 0.05, 'every gram cut is lying about to be picked up');
const cutFirst = v.g;
// ...and the mammoth has something to say about being cut
v = await T(`return { said: game.says.history.slice(), flag: !!(st.flags.said && st.flags.said.cut), who: game.says.name, tips: Object.keys(st.flags.tips || {}).join(','), tip: (document.getElementById('hint')?.textContent || '').trim() }`);
check(/start/.test(v.tips) && /pickup/.test(v.tips) && !/sell/.test(v.tips), `with hair on the snow he has had his second tip, about his hands and Mortimer, and no other (${v.tips})`);
let embarrassed = v.said.includes('Gosh, this is embarrassing.');
console.log(`  the mammoth, since he was first cut: "${v.said.slice(1).join('" / "')}"`);
check(v.flag && v.said.length >= 2 && ['Excuse me. Did you just... you did.', 'Oh. We are really doing this, then.', 'Tihi - that tickles.'].includes(v.said[1]), 'the first cut gets a remark out of the mammoth');
check(v.said.some((l) => /^Did I say full trim\?/.test(l)), 'and a few cuts later he thinks better of the full trim');
check(v.who === 'The mammoth', 'who is, so far, only "the mammoth"');

// ---- pick up, by hand (the Q key) ----
await page.keyboard.press('KeyQ');
v = await T(`T.frame(40); const hand = s.tool.id; const first = T.collect(10); const got = first + T.collect(500); return { hand, first, got, hair: st.hair, lying: C.lying, picked: st.stats.picked, pinch: s.tool.def.sweep.most }`);
console.log(`bare hands: ${round(v.first)} g in the first ten goes, ${round(v.got)} g in all; carrying ${round(v.hair)} g; ${round(v.lying)} g still lying`);
check(v.hand === 'hands', 'Q puts the scissors away and brings up the hands');
check(v.first > 1 && v.first <= 10 * 2 * v.pinch + 0.01, `by hand it is a pinch at a time (no more than ${v.pinch} g a grab)`);
check(v.got > 0.85 * cutFirst, 'looking at cut hair and holding the button picks it up, all of it in the end');

// ---- sell it to Mortimer (E, then his button) ----
v = await T(`T.goTo('vulture'); return { near: game.nearby(), prompt: document.getElementById('prompt').textContent.trim(), hidden: document.getElementById('prompt').hidden, hair: st.hair, gold: st.gold, found: st.found.length }`);
check(v.near === 'vulture' && !v.hidden && /Mortimer/.test(v.prompt), `standing at the wig table offers "${v.prompt}"`);
// (a minute of the scissors may well have uncovered a tattoo by now, which Gnorman pays for: that gold is not Mortimer's)
const carried = v.hair, purseBefore = v.gold;
if (v.found) console.log(`  (${v.found} thing${v.found > 1 ? 's' : ''} found under the coat already, for ${purseBefore} gold)`);
await page.keyboard.press('KeyE');
v = await T(`return { dialog: game.dialog, open: !document.getElementById('dialog').hidden, text: document.querySelector('#dialog .sheet').innerText.replace(/\\n+/g, ' | ').slice(0, 200), busy: rig.busy }`);
console.log(`  Mortimer: ${v.text}`);
check(v.dialog === 'vulture' && v.open && v.busy, 'E opens his scales, and the elf stands still for it');
await page.click('#dialog [data-act="sell"]');
v = await T(`return { gold: st.gold, hair: st.hair, sold: st.stats.sold }`);
console.log(`  sold ${round(carried)} g for ${v.gold - purseBefore} gold`);
check(v.gold - purseBefore === Math.floor(carried * 0.25 + 1e-6) && v.hair === 0, 'he pays a quarter of a gold a gram, rounded down in his favour, and the pockets are empty');
// (the mammoth saw that; but he says nothing while the shop is open)
v = await T(`T.frame(150); const el = document.getElementById('says'); return { now: game.says.now && game.says.now.line, waiting: game.says.queue.length, up: !el.hidden && el.classList.contains('show') }`);
check(v.now === null && !v.up && v.waiting >= 1, 'the mammoth has a view on the sale, and keeps it to himself while the shop is open');
await page.keyboard.press('KeyE');
v = await T(`return { dialog: game.dialog, busy: rig.busy, mode: rig.mode }`);
check(v.dialog === null && !v.busy && v.mode === 'elf', 'E again leaves him, still in the elf\'s shoes');
v = await T(`
  let n = 0; while (!game.says.now && n < 900) { T.frame(); n++; }
  const el = document.getElementById('says'), r = el.querySelector('.note').getBoundingClientRect();
  return { n, line: game.says.now && game.says.now.line, text: el.querySelector('.line').textContent, who: el.querySelector('.who').textContent, hidden: el.hidden, tail: el.dataset.tail,
    inside: r.width > 40 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
`);
console.log(`  outside again, ${round(v.n / 60)} s later, the mammoth: "${v.line}" (signed "${v.who}", tail pointing ${v.tail})`);
check(!!v.line && v.text === v.line && !v.hidden, 'once the shop is shut he says it, in a bubble');
check(v.inside && /^(up|down|left|right)$/.test(v.tail), 'which is wholly on the screen, and points at him');

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
v = await T(`let n = 0; while (!game.says.history.some((l) => /sheep/.test(l)) && n < 60 * 25) { T.frame(); n++; } return { said: game.says.history.slice(-2) }`);
check(v.said.some((l) => /not a sheep/.test(l)), `and the mammoth has seen what was bought: "${v.said[v.said.length - 1]}"`);

// ---- every broom and vacuum picks hair up ----
// (the clippers are bought out on the snow: they have their scene all the same, and any key gets on with it)
v = await T(`st.earn(4000); game.buy('garden'); T.frame(60); return { id: hero.playing && hero.playing.id, cine: document.body.classList.contains('cine'), what: document.querySelector('#got .what').textContent, quip: document.querySelector('#got .quip').textContent, shown: document.getElementById('got').classList.contains('show'), showing: s.showing && s.showing.id, cam: !!rig.cine, far: rig.cine ? Math.hypot(camera.position.x - rig.pos.x, camera.position.z - rig.pos.z) : 0 }`);
console.log(`the clippers' scene: "You got the ${v.what}" / "${v.quip}"; a second in, the camera is ${round(v.far * 100)} cm from him`);
check(v.id === 'garden' && v.cine && v.cam && v.showing === 'garden' && v.shown, 'buying the garden clippers plays their scene');
check(v.far > 0.3, 'seen from outside the elf');
await page.keyboard.press('KeyW');      // any key gets on with it
v = await T(`const skipped = hero.playing && hero.playing.skipped; T.frame(60); return { skipped, playing: !!hero.playing, cine: document.body.classList.contains('cine'), cam: !!rig.cine, showing: s.showing, hand: T.inHand(), visible: s.tool.group.visible, got: !!(st.flags.got && st.flags.got.garden), none: !(st.flags.got && st.flags.got.scissors), banner: document.getElementById('got').hidden, fov: camera.fov }`);
check(v.skipped === true, 'a key cuts it short');
check(!v.playing && !v.cine && !v.cam && v.showing === null && v.banner, 'afterwards the bars, the banner and the outside camera are gone');
check(v.hand === 'garden' && v.visible && v.fov === 62, 'and he is looking out of his own eyes again, clippers in hand');
check(v.got && v.none, 'the game remembers which tools have had their moment (the scissors never did)');
for (const [id, name] of [['push', 'push broom'], ['shopvac', 'shop vacuum']]) {
  v = await T(`
    const lying0 = C.lying;
    game.choose('garden'); T.frame(40);
    const cut = T.cutRound(${id === 'push' ? 1 : 2}, ${id === 'push' ? 0.4 : 2.4}, 0.8, 6);
    game.buy('${id}');
    const sweeper = st.sweeper;
    game.toggleSweep(); T.frame(40);
    const hand = s.tool.id, before = st.hair, lying = C.lying;
    const got = T.collect(25);
    T.frame(120);
    return { cut, sweeper, hand, lying, got: st.hair - before, hair: st.hair, left: C.lying, inFlight: C.inFlight };
  `);
  console.log(`${name}: ${round(v.cut)} g cut with the clippers, ${round(v.lying)} g lying; picked up ${round(v.got)} g in at most 25 goes; carrying ${round(v.hair)} g; ${round(v.left)} g left lying`);
  check(v.sweeper === id && v.hand === id, `buying the ${name} makes it the thing Q brings up`);
  check(v.got > 0.5 * Math.min(v.lying, 150) - 0.5, `the ${name} picks hair up`);
}

// ---- there is no limit to what he can carry ----
v = await T(`
  game.choose('garden'); T.frame(40);
  T.cutRound(3, 0.4, 1.2, 8);
  st.hair = 5000;
  game.toggleSweep(); T.frame(40);
  const lying = C.lying;
  const got = T.collect(6);
  T.frame(120);
  return { hair: st.hair, got: st.hair - 5000, lying, left: C.lying, bag: document.getElementById('bag').textContent, sack: 'capacity' in st || 'room' in st };
`);
console.log(`carrying 5 kg: ${round(v.got)} g more picked up; the display says "${v.bag}"`);
check(v.got > 1 && v.hair > 5000, 'however much he is carrying, he can pick up more');
check(/of hair$/.test(v.bag) && !/\d\s*(of|\/)\s*\d/.test(v.bag) && !v.sack, 'the display says how much he has, not out of how much; no sack is for sale');

// ---- a ladder: R stands it up and climbs, the hair up there can be cut, F comes down and it is put away ----
v = await T(`
  st.earn(20000); game.buy('fire'); T.frame(5);
  const foot = mammoth.data.anat.feet[1];
  rig.pos.x = foot.c[0] + 0.1; rig.pos.z = foot.c[2] - foot.r - 0.6; rig.yaw = Math.PI; rig.pitch = 0.1;
  game.choose('garden'); T.frame(40);
  rig.keys.add('KeyW'); T.frame(70); rig.keys.delete('KeyW');
  const lift = rig.lift && rig.lift.id + ' (' + rig.lift.kind + ')';
  rig.keys.add('KeyR'); T.frame(6);
  const stood = !!rig.ladder; T.frame(60);
  const part = rig.height, seen = lifter.ladders.fire.group.visible; T.frame(50); rig.keys.delete('KeyR');       // (part of the way up: level with his shoulder)
  const top = rig.height, eye = camera.position.y - game.terrain.height(rig.pos.x, rig.pos.z);
  const hide = s.world.near(camera.position.x, camera.position.y, camera.position.z);
  const before = T.cutGrams(); s.squeeze(true); for (let k = 0; k < 150; k++) { rig.yaw = Math.PI + Math.sin(k / 20) * 0.3; T.frame(); } s.squeeze(false); T.frame(30);
  const cutUp = T.cutGrams() - before;
  const x0 = rig.ladder.x; rig.keys.add('KeyD'); T.frame(60); rig.keys.delete('KeyD'); const hopped = Math.hypot(rig.ladder.x - x0, 0);
  rig.keys.add('KeyF'); T.frame(260); rig.keys.delete('KeyF');
  return { lift, stood, part, seen, top, eye, hide, cutUp, hopped, down: rig.height, away: !rig.ladder, hidden: !lifter.ladders.fire.group.visible };
`);
console.log(`fire ladder: up to ${round(v.top * 100)} cm (eyes ${round(v.eye * 100)} cm off the snow, ${round(v.hide * 100)} cm from the hide); ${round(v.cutUp)} g cut up there; walked ${round(v.hopped * 100)} cm sideways`);
check(v.lift === 'fire (ladder)' && v.stood && v.seen, 'R stands the ladder up under him');
check(v.part > 0.5 && v.top > 1.7 && v.top <= 3.75 + 1e-6, 'holding R climbs it, out round the bulge of his shoulder and on up');
check(v.cutUp > 1, 'the hair up there can be cut');
check(v.hopped > 0.2, 'A and D walk the ladder sideways');
check(v.down === 0 && v.away && v.hidden, 'F comes down, and at the bottom it is put away');

// ---- the pack: R burns, the tank runs dry, he comes down, it fills again on the ground ----
v = await T(`
  game.buy('jet'); T.frame(5);
  rig.pos.x = 3.0; rig.pos.z = -2.6; T.frame(5);
  const kind = rig.lift.id + ' (' + rig.lift.kind + ')', tank = rig.lift.tank, worn = lifter.packs.jet.M.group.visible;
  rig.keys.add('KeyR'); T.frame(120);
  const two = { h: rig.height, fuel: rig.fuel, burning: rig.thrusting, power: lifter.power };
  rig.fuel = 0.4; T.frame(60);            // (nearly out)
  const dry = { h: rig.height, fuel: rig.fuel, burning: rig.thrusting };
  rig.keys.delete('KeyR'); rig.keys.add('KeyF');
  let n = 0, peak = rig.height; while (rig.height > 0 && n < 3000) { T.frame(); n++; peak = Math.max(peak, rig.height); }
  rig.keys.delete('KeyF');
  const landed = rig.height === 0, fell = n / 60;
  T.frame(60 * 11);
  return { kind, tank, worn, two, dry, peak, landed, fell, full: rig.fuel, gauge: !document.getElementById('fuel').hidden };
`);
console.log(`jet pack: ${round(v.two.h * 100)} cm up after two seconds with ${round(v.two.fuel)} s of ${v.tank} left; dry at ${round(v.dry.h * 100)} cm; topped out at ${round(v.peak * 100)} cm; down ${round(v.fell)} s later`);
check(v.kind === 'jet (pack)' && v.worn && v.gauge, 'buying the pack puts it on his back and a gauge on the screen');
check(v.two.burning && v.two.h > 1.2 && v.two.h < 8 && v.two.fuel < v.tank - 1.8 && v.two.power > 0.9, 'holding R burns, and he goes up at a pace he can steer');
check(v.dry.fuel < 0.3, 'until the tank is all but dry');
check(v.landed && v.fell > 0.5, 'then F lets him down');
check(Math.abs(v.full - v.tank) < 1e-6, 'and it fills again on the ground');

// ---- the jet pack holds him where he is; and he can come down on the mammoth's back and work there ----
v = await T(`
  T.frame(5);
  rig.keys.add('KeyR'); T.frame(150); rig.keys.delete('KeyR'); T.frame(60);
  const h1 = rig.height; T.frame(180); const h2 = rig.height, hovering = Math.abs(rig.vy) < 0.05;
  // over his back, and down
  rig.pos.x = 0.3; rig.pos.z = 0; rig.height = 4.2; rig.vy = 0; rig.yaw = 0; rig.pitch = -1.0;
  rig.keys.add('KeyF'); T.frame(240); rig.keys.delete('KeyF'); T.frame(30);
  const perched = rig.perched, on = rig.height, eye = camera.position.y, hide = s.world.near(camera.position.x, camera.position.y, camera.position.z);
  game.choose('electric'); T.frame(40);
  const before = T.cutGrams(); s.squeeze(true); for (let k = 0; k < 240; k++) { rig.yaw = Math.sin(k / 30) * 0.8; T.frame(); } s.squeeze(false); T.frame(40);
  const cutUp = T.cutGrams() - before;
  // off the side: the pack holds him there in the air; F lets him down
  rig.yaw = 0; rig.keys.add('KeyW'); T.frame(150); rig.keys.delete('KeyW');
  const out = Math.abs(rig.pos.z), held = rig.height, floating = !rig.perched;
  rig.keys.add('KeyF'); let n = 0; while (rig.height > 0 && n < 1500) { T.frame(); n++; } rig.keys.delete('KeyF');
  return { h1, h2, hovering, perched, on, eye, hide, cutUp, out, held, floating, off: rig.height === 0, took: n / 60 };
`);
console.log(`jet pack: holds at ${round(v.h1 * 100)} cm (${round(v.h2 * 100)} cm three seconds later); on his back the eyes are ${round(v.eye * 100)} cm up, ${round(v.hide * 100)} cm off the hide; ${round(v.cutUp)} g cut there; stepped ${round(v.out * 100)} cm off to the side and hung there at ${round(v.held * 100)} cm; F had him down in ${round(v.took)} s`);
check(v.h1 > 1 && Math.abs(v.h2 - v.h1) < 0.1 && v.hovering, 'let go, the jet pack holds him where he is');
check(v.perched && v.on > 2.2 && v.on < 3.4, 'F brings him down onto the mammoth\'s back, which holds him up');
check(v.cutUp > 5, 'and the hair up there can be cut');
check(v.out > 1.2 && v.floating && v.held > 2, 'stepping off the side, the pack holds him up');
check(v.off && v.took < 6, 'and F lets him down to the snow');

// ---- the hired help: lemmings, which climb him and gnaw off what is left ----
await T(`T.goTo('gnome')`);
await page.keyboard.press('KeyE');
v = await T(`st.earn(Math.max(0, 600 - st.gold)); game.fillDialog(); return { sections: [...document.querySelectorAll('#dialog h3')].map((h) => h.textContent), offered: !!document.querySelector('#dialog [data-buy="lemming"]'), gold: st.gold }`);
check(v.sections.includes('Hired help') && v.offered, 'the stall hires out help');
const purse = v.gold;
await page.click('#dialog [data-buy="lemming"]');
v = await T(`const sec = document.querySelector('#dialog [data-buy="lemming"]').closest('section'); return { gold: st.gold, n: st.helpers, at: game.helpers.count, row: document.querySelector('#dialog [data-buy="lemming"]').closest('li').innerText.replace(/\\n+/g, ' | '), note: sec.querySelector('.note').textContent }`);
console.log(`  hired: ${v.row} ("${v.note}")`);
check(v.gold === purse - 60 && v.n === 1 && v.at === 1 && /You have 1 lemming on him/.test(v.note), 'a lemming costs 60 gold, and the stall keeps count');
await page.click('#dialog [data-buy="lemmings"]');
await page.keyboard.press('KeyE');
v = await T(`
  const H = game.helpers, lying0 = C.lying + C.carry, cut0 = mammoth.cutLength, hint = document.getElementById('hint').textContent.trim().slice(0, 60);
  T.frame(60 * 3);
  const running = [...H.mode.slice(0, H.count)].filter((m) => m === 0).length;
  let n = 0; while (H.working < 5 && n < 60 * 60) { T.frame(); n++; }
  const arrived = n / 60 + 3;
  T.frame(60 * 30);
  const cut = s.grams(mammoth.cutLength - cut0);
  H.dismiss();          // (sent home for now, so that the rest of this goes as it would without them)
  return { count: st.helpers, running, arrived, cut, lying: C.lying + C.carry - lying0, hint, said: game.says.history.slice(-3) };
`);
console.log(`  seven lemmings: ${v.running} still on the snow after three seconds; at work after ${round(v.arrived)} s; ${round(v.cut)} g gnawed off in the next half minute, ${round(v.lying)} g of it lying about. The game: "${v.hint}..."; the mammoth: "${v.said.join('" / "')}"`);
check(v.count === 7, 'half a dozen more makes seven');
check(v.running >= 4, 'they set off across the snow from the stall, one behind another');
check(v.arrived < 45, 'and climb him, and set to work');
check(v.cut > 20 && v.cut < 600, 'steadily: short hair by the lock, long hair by the gram');
check(Math.abs(v.lying - v.cut) < 0.03 * v.cut + 0.5, 'and every gram they gnaw off falls for the elf to pick up');
check(v.said.some((l) => /cold feet|organised/.test(l)), 'the mammoth has noticed them');
v = await T(`st.helpers = 235; const r = { six: st.price('lemmings'), one: st.price('lemming') }; st.helpers = 7; return r`);
check(v.six === Infinity && v.one === 60, 'there is room on him for 240 and no more');

// ---- remedies and novelties: each works once, on one part of him, and gold comes out of another ----
await T(`T.goTo('gnome')`);
await page.keyboard.press('KeyE');
v = await T(`st.earn(Math.max(0, 1600 - st.gold)); game.fillDialog(); const sec = [...document.querySelectorAll('#dialog section')].find((x) => /Remedies/.test(x.querySelector('h3').textContent)); return { n: sec ? sec.querySelectorAll('[data-buy]').length : 0, gold: st.gold }`);
check(v.n === 10, 'the stall has ten remedies and novelties');
const purse2 = v.gold;
await page.click('#dialog [data-buy="scratcher"]');
v = await T(`T.frame(20); const row = document.querySelector('#dialog [data-use="scratcher"]'); return { gold: st.gold, owns: st.owns('scratcher'), hand: T.inHand(), row: row && row.textContent, shown: T.shown() }`);
check(v.gold === purse2 - 45 && v.owns && v.hand === 'scratcher' && /Take it out/.test(v.row || ''), 'a belly scratcher costs 45 gold and is in hand at once');
check(/gag:Telescopic belly scratcher/.test(v.shown), 'and has a button among the tools');
await page.keyboard.press('KeyE');
v = await T(`
  const G = game.gags, tool = s.tools.scratcher, label = () => document.querySelector('#aim span').textContent;
  // pointed at a leg it is no use
  rig.pos.x = 1.6; rig.pos.z = 1.15; rig.yaw = 0.8; rig.pitch = 0.25; T.frame(30);
  const label0 = label(), on0 = G.on;
  s.squeeze(true); T.frame(120); s.squeeze(false);
  const idle = G.progress;
  // under his belly, looking up, it reaches him
  rig.pos.x = -0.15; rig.pos.z = 0.02; rig.yaw = 0.3; rig.pitch = 1.4; T.frame(50);
  const label1 = label(), on1 = G.on, long = tool.length, gold0 = st.gold;
  s.squeeze(true);
  let n = 0; while (st.owns('scratcher') && n < 60 * 12) { T.frame(); n++; }
  s.squeeze(false);
  let m = 0; while (!G.shot && m < 60 * 4) { T.frame(); m++; }
  const shot = !!G.shot, cine = !!rig.cine, bars = document.body.classList.contains('cine'), tail = mammoth.pose.tail;
  const took = T.settle();
  return { label0, on0, idle, label1, on1, long, secs: n / 60, shot, cine, bars, tail, took, after: { cine: !!rig.cine, bars: document.body.classList.contains('cine'), fov: camera.fov, hand: T.inHand() },
    lying: game.coins.lying, owed: st.owed, coins: game.coins.n, gold0, gold: st.gold, used: st.used.slice(), said: game.says.history.slice(-3) };
`);
console.log(`  belly scratcher: at a leg "${v.label0}"; under his belly "${v.label1}", the pole ${round(v.long * 100)} cm long; ${round(v.secs)} s of scratching; then ${v.coins} coins (${v.lying} gold) behind him; he said "${v.said.join('" / "')}"`);
check(!v.on0 && v.idle === 0 && /belly/.test(v.label0), 'pointed at a leg, the belly scratcher does nothing, and says where it is for');
check(v.on1 && v.long > 0.7 && /scratch/.test(v.label1), 'under his belly it reaches up to him');
check(v.secs > 3 && v.secs < 6, 'and four seconds of it is enough');
check(v.shot && v.cine && v.bars && v.tail > 0.3, 'the game steps outside the elf to watch what comes of it');
check(!v.after.cine && !v.after.bars && v.after.fov === 62 && v.after.hand !== 'scratcher', 'and comes back to him, with the tool he had before in hand');
check(v.lying === 140 && v.owed === 140 && v.coins >= 10 && v.gold === v.gold0, '140 gold is lying behind him, and none of it is in the purse yet');
check(v.used.includes('scratcher') && v.said.some((l) => /itch|pardon/.test(l)), 'the scratcher is used up, and he has said what he thinks');
v = await T(`const got = T.pickGold(); return { got, owed: st.owed, left: game.coins.n }`);
check(v.got === 140 && v.owed === 0 && v.left === 0, 'walking over the gold picks all of it up');
// the needles are thrown one at a time, and stay in him
v = await T(`
  st.buy('needles'); game.choose('needles'); T.frame(40);
  rig.pos.x = 2.3; rig.pos.z = 1.75; rig.yaw = 0.76; rig.pitch = 0.35; T.frame(30);
  const G = game.gags, on = G.on, purse = st.gold;
  for (let k = 0; k < 5; k++) { s.squeeze(true); T.frame(8); s.squeeze(false); T.frame(26); }
  const stuck = G.stuck.length, seen = G.needles.filter((n) => n.visible).length;
  T.settle();
  // (it comes down all round him, and some of it at the elf's feet: that is his as soon as it lands)
  T.pickGold();
  return { on, stuck, seen, got: st.gold - purse, used: st.used.includes('needles'), said: game.says.history.slice(-2) };
`);
check(v.on && v.stuck === 5 && v.seen === 5, 'five presses throw five needles, and they stay in him');
check(v.got === 280 && v.used, `and his back is better, to the tune of ${v.got} gold ("${v.said.join('" / "')}")`);
// the spray takes the hair off whatever it is pointed at
v = await T(`
  st.buy('depil'); game.choose('depil'); T.frame(40);
  rig.pos.x = -0.75; rig.pos.z = 1.2; rig.yaw = Math.atan2(-(-1.22 - rig.pos.x), -(0.54 - rig.pos.z)); rig.pitch = 0.45; T.frame(30);
  const cut0 = mammoth.cutLength, lying0 = C.lying + C.carry, on = game.gags.on;
  s.squeeze(true);
  let n = 0; while (st.owns('depil') && n < 60 * 8) { rig.yaw += 0.004 * Math.sin(n * 0.05); T.frame(); n++; }
  s.squeeze(false); T.frame(240);
  return { on, secs: n / 60, grams: s.grams(mammoth.cutLength - cut0), fell: C.lying + C.carry - lying0, used: st.used.includes('depil'), hand: T.inHand() };
`);
console.log(`  the spray: empty in ${round(v.secs)} s; ${round(v.grams)} g of hair came off, ${round(v.fell)} g of it lying about`);
check(v.on && v.secs > 3.5 && v.secs < 6, 'a can of hair remover lasts four and a half seconds');
check(v.grams > 250 && Math.abs(v.fell - v.grams) < 0.05 * v.grams + 1, 'and takes off several hundred grams of hair, which falls to be picked up');
check(v.used && v.hand !== 'depil', 'the empty can is put away');
// the others, each made to work: every one pays what it says, and two of them leave their mark on him
v = await T(`
  const out = {}, G = game.gags;
  for (const id of ['feather', 'nosespray', 'varnish', 'tarot', 'plunger', 'polish', 'watch']) {
    st.buy(id);
    const purse = st.gold;
    G.finish(id);
    T.settle();
    T.pickGold();
    out[id] = st.gold - purse;
  }
  return { out, used: st.used.length, owned: game.novelties.length, nails: mammoth.horn.roughness, tusks: mammoth.ivory.roughness, eggs: game.coins.eggs.count, said: game.says.history.slice(-14), fx: st.flags.fx,
    row: [...document.querySelectorAll('[data-tool="gag"]')].map((b) => b.hidden)[0] };
`);
console.log(`  the rest: ${Object.entries(v.out).map(([k, g]) => k + ' ' + g).join(', ')} gold`);
check(v.out.feather === 80 && v.out.nosespray === 110 && v.out.varnish === 130 && v.out.tarot === 170 && v.out.plunger === 190 && v.out.polish === 320 && v.out.watch === 440, 'each of the others pays out what it is worth, and all of it can be picked up');
check(v.used === 10 && v.owned === 0 && v.row === true, 'all ten are used up, and their button is gone');
check(v.nails < 0.3 && v.tusks < 0.3 && v.fx && v.fx.nails && v.fx.tusks, 'his toenails are painted and his tusks shine');
check(v.said.some((l) => /BUKAWK/.test(l)) && v.said.some((l) => /Norway/.test(l)) && v.said.some((l) => /Harlot Red/.test(l)), 'and he has had something to say about every one of them');
await T(`T.goTo('gnome')`);
await page.keyboard.press('KeyE');
v = await T(`const sec = [...document.querySelectorAll('#dialog section')].find((x) => /Remedies/.test(x.querySelector('h3').textContent)); return { spent: sec.querySelectorAll('.have').length, text: sec.querySelector('.have').textContent }`);
check(v.spent === 10 && /Used up/.test(v.text), 'the stall has no more of them to sell');

// ---- cave men: hired, they come running with spears; told it is rude, they say sorry and go home ----
const purse3 = await T(`st.earn(Math.max(0, 300 - st.gold)); game.fillDialog(); return st.gold`);
await page.click('#dialog [data-buy="cavemen"]');
await page.waitForFunction(() => window.__game.game.raid.playing, null, { timeout: 240000 });
v = await T(`
  const R = game.raid, far = () => R.men.map((c) => Math.hypot(c.group.position.x - 2.5, c.group.position.z));
  const start = { far: far(), dialog: game.dialog, cine: !!rig.cine, seen: R.men.filter((c) => c.group.visible).length, gold: st.gold };
  T.frame(60 * 6);
  const there = { far: far(), level: R.men.map((c) => c.pose.level), cries: game.raid.play.said };
  T.frame(60 * 2);
  const him = game.says.history.slice(-1)[0];
  T.frame(60 * 8.2);
  const sorry = [...document.querySelectorAll('.talk .line')].map((e) => e.textContent), shame = R.men.map((c) => c.pose.shame), spears = R.men.map((c) => c.pose.level);
  let n = 0; while (R.playing && n < 60 * 14) { T.frame(); n++; }
  const after = { cine: !!rig.cine, bars: document.body.classList.contains('cine'), fov: camera.fov, far: far(), bye: game.says.history.slice(-1)[0], hint: document.getElementById('hint').textContent.trim().slice(0, 60), raids: st.stats.raids };
  T.frame(60 * 32);
  return { start, there, him, sorry, shame, spears, after, gone: R.men.filter((c) => c.group.visible).length };
`);
console.log(`  cave men: from ${v.start.far.map((d) => round(d)).join(', ')} m off to ${v.there.far.map((d) => round(d)).join(', ')} m; he said "${v.him}"; they said "${v.sorry.join('" / "')}"; then "${v.after.bye}"`);
check(v.start.seen === 4 && v.start.far.every((d) => d > 15) && v.start.dialog === null && v.start.cine && v.start.gold === purse3 - 150, 'four cave men cost 150 gold and come running from a long way off, and the shop steps aside to watch');
check(v.there.far.every((d) => d > 3 && d < 4.6) && v.there.level.every((l) => l > 0.8), 'they stop in front of him, clear of his tusks, with their spears levelled');
check(v.him === 'Excuse me. Pointing is rude.', 'he tells them that pointing is rude');
check(v.sorry.length === 4 && /right/.test(v.sorry[0]) && /apologise/.test(v.sorry.join(' ')) && v.shame.every((x) => x > 0.5) && v.spears.every((l) => l < 0.2), 'they agree, say sorry, and put up their spears');
check(!v.after.cine && !v.after.bars && v.after.fov === 62 && v.after.raids === 1 && /gone home/.test(v.after.hint), 'the scene ends with the elf looking out of his own eyes, 150 gold the poorer');
check(v.after.far.every((d, i) => d > v.there.far[i] + 1) && v.gone === 0, 'and they walk off the way they came, until they are out of sight');

// ---- what is under the coat is found when the hair over it is gone ----
// (one of them first, on its own: the heart for his mum)
v = await T(`
  const spot = game.finds.spots.find((sp) => sp.id === 'mum'), cut = Float32Array.from(mammoth.bodyCut), was = st.found.length;
  for (const p of spot.at) cut[p] = 0.0005;
  mammoth.setHaircut(cut);
  // (until it has been found, and he has had time to say what he thinks of that)
  let n = 0; while (!st.found.includes('mum') && n < 60 * 30) { T.frame(); n++; }
  T.frame(60 * 4);
  return { was, found: st.found.slice(), hint: document.getElementById('hint').textContent.trim().slice(0, 60), said: game.says.history.slice(-1)[0], all: game.says.history.slice(), n };
`);
console.log(`  one tattoo uncovered: "${v.hint}..."; the mammoth: "${v.said}"`);
check(v.found.length === v.was + 1 && v.found.includes('mum'), 'shaving the hide over one tattoo finds that one');
check(embarrassed || v.all.includes('Gosh, this is embarrassing.') || (await T(`return T.said.includes('Gosh, this is embarrassing.')`)), 'and the first thing found on him embarrassed him');
v = await T(`
  const gold = st.gold, was = st.found.length, total = game.finds.total;
  mammoth.setHaircut(new Float32Array(mammoth.bodyCut.length).fill(0.0005));
  T.frame(150);
  const one = st.found.length, hint = document.getElementById('hint').textContent;
  T.frame(60 * 3.2 * total);
  return { was, one, hint, found: st.found.length, total, paid: st.gold - gold, thong: st.found.includes('thong'), text: document.getElementById('progress').textContent };
`);
console.log(`under the coat: ${v.found} of ${v.total} found, ${v.paid} gold paid for them; the first: "${v.hint.trim().slice(0, 90)}"`);
check(v.one === v.was + 1, 'with the hair gone, the next find is announced (one at a time)');
check(v.found === v.total && v.thong, 'and in time all of them are, the thong among them');
check(v.paid === 30 * (v.total - v.was - 1) + 120, 'each pays what Gnorman promised');
v = await T(`return { who: game.says.name, said: game.says.history.length }`);
check(v.who === 'Kevin', 'and with the label on his forehead read, what he says is signed "Kevin"');

// ---- and with nothing left to find and nothing left to cut, the legend is told to the end ----
v = await T(`
  T.frame(60 * 16);
  const el = document.getElementById('finale');
  return { shown: !el.hidden, mode: rig.mode, l1: el.querySelector('.l1').textContent, stats: el.querySelector('.stats').textContent, done: !!st.flags.done };
`);
console.log(`the end: "${v.l1}" (${v.stats})`);
check(v.shown && v.mode === 'orbit' && v.done, 'bald, the shaving stops and the end is told');
await page.click('#finale [data-act="admire"]');
v = await T(`return { hidden: document.getElementById('finale').hidden, shorn: mammoth.shorn }`);
check(v.hidden && v.shorn > 0.98, 'he can be left as he is');
await page.click('#view-elf');
await T(`T.frame(30)`);

// ---- what was left behind is found by the help: three patches grown back, somewhere on him ----
v = await T(`
  const H = game.helpers;
  H.settle(st.helpers);
  const M = H.map, cut = Float32Array.from(mammoth.bodyCut), sites = [100, Math.floor(M.S / 2), M.S - 50];
  for (let p = 0; p < cut.length; p++) if (sites.includes(M.siteOf[p])) cut[p] = 9;
  mammoth.setHaircut(cut);
  // (the longest lock rooted on any of the three)
  const longest = () => { let m = 0; for (const site of sites) for (let k = M.first[site]; k < M.first[site + 1]; k++) { const a = M.chunks[M.lockChunk[k]].arrays, i = M.lockAt[k]; m = Math.max(m, Math.min(a.iA[i * 4], a.iCut[i])); } return m; };
  const before = longest(), shorn0 = mammoth.shorn;
  T.frame(90);
  const noticed = !H.idle;
  // (until they have had nothing to do for three seconds together: a patch can look finished for a moment, between one count of it and the next)
  let n = 0, calm = 0; while (calm < 180 && n < 60 * 400) { T.frame(); n++; calm = H.idle && H.pending.length === 0 ? calm + 1 : 0; }
  return { helpers: H.count, before, after: longest(), noticed, took: (n - calm) / 60 + 1.5, idle: H.idle, shorn0, shorn: mammoth.shorn };
`);
console.log(`  three patches left on him (shorn ${(v.shorn0 * 100).toFixed(2)}%): ${v.helpers} lemmings had them off in ${round(v.took)} s (shorn ${(v.shorn * 100).toFixed(2)}%)`);
check(v.helpers === 7 && v.before > 0.03 && v.noticed, `patches of hair left on him (up to ${round(v.before * 100)} cm long) are noticed by the help`);
check(v.idle && v.after < 0.005 && v.took < 380, `and found, wherever they are, and gnawed down to ${round(v.after * 1000)} mm`);
check(v.shorn > 0.985, 'which leaves him bald enough for the legend');

// ---- it is all still there after the page is loaded again ----
const kept = await T(`
  game.choose('sheep'); T.frame(40);
  // (some gold left lying where it fell: it is not to be lost by closing the page)
  game.coins.spout((p, d) => { p.set(-3, 1, 0); d.set(-1, 0.5, 0); }, 90, { n: 9, over: 0.2 });
  T.frame(240);
  game.save(true);
  const raw = localStorage.getItem('mammoth-save-3');
  return { gold: st.gold, hair: st.hair, owned: [...st.owned].sort().join(','), sweeper: st.sweeper, tool: st.tool, shorn: mammoth.shorn, found: st.found.length, lift: st.lift, helpers: st.helpers, used: st.used.length, owed: st.owed, bytes: raw ? raw.length : 0 };
`);
console.log(`kept: ${kept.gold} gold, ${round(kept.hair)} g, [${kept.owned}], shorn ${(kept.shorn * 100).toFixed(3)}% (${kept.bytes} bytes in the browser's storage)`);
check(kept.bytes > 100, 'the game is written to the browser\'s storage');
await load('');
v = await page.evaluate(() => {
  const { shaving: s, mammoth, game } = window.__game, st = game.state;
  return { resumed: game.resumed, gold: st.gold, hair: st.hair, owned: [...st.owned].sort().join(','), sweeper: st.sweeper, tool: st.tool, hand: s.tool.id, shorn: mammoth.shorn, found: st.found.length, lift: st.lift, rigLift: window.__game.rig.lift && window.__game.rig.lift.id, helpers: st.helpers, onHim: game.helpers.count, used: st.used.length, owed: st.owed, coins: game.coins.n, nails: mammoth.horn.roughness };
});
check(await page.evaluate(() => !window.__game.hero.playing), 'no scene is played on coming back, either');
console.log(`after loading the page again: ${v.gold} gold, ${round(v.hair)} g, [${v.owned}], shorn ${(v.shorn * 100).toFixed(3)}%, in hand: ${v.hand}`);
check(v.resumed === true, 'the kept game is taken up again');
check(v.gold === kept.gold && Math.abs(v.hair - kept.hair) < 1e-6 && v.owned === kept.owned  && v.sweeper === kept.sweeper, 'gold, hair and everything bought are as they were');
check(v.hand === kept.tool, 'the tool last used is in hand');
check(v.found === kept.found && v.lift === 'pack' && v.rigLift === 'jet', 'what was found stays found, and the jet pack is still on his back');
check(v.helpers === kept.helpers && v.onHim === kept.helpers && kept.helpers === 7, `and the ${v.helpers} lemmings are still on the payroll, and on him`);
check(Math.abs(v.shorn - kept.shorn) < 0.02 * kept.shorn + 1e-5, 'and so is the haircut');
check(kept.owed === 90 && v.owed === 90 && v.coins > 0, 'gold left lying on the snow is in a heap by his foot, still to be had');
check(v.used === kept.used && v.nails < 0.3, 'and what the novelties did to him is still done');

// ---- and a new game can be started over it ----
v = await page.evaluate(() => {
  const { shaving: s, mammoth, game } = window.__game, st = game.state;
  game.restart();
  return { gold: st.gold, owned: [...st.owned].sort().join(','), shorn: mammoth.shorn, hand: s.next || s.tool.id, raw: localStorage.getItem('mammoth-save-3'), helpers: st.helpers + game.helpers.count, used: st.used.length, owed: st.owed + game.coins.n, nails: mammoth.horn.roughness };
});
check(v.gold === 0 && v.owned === 'hands,scissors' && v.shorn === 0 && v.hand === 'scissors', 'starting again gives back the coat and takes everything else');
check(v.helpers === 0, 'the hired help included');
check(v.used === 0 && v.owed === 0 && v.nails > 0.4, 'and the novelties, the gold on the snow and the varnish on his toenails');

// ---- dev: a button that puts enough gold in the purse to buy everything (beside the purse, in both shops, and on B) ----
v = await page.evaluate(() => {
  const { game, rig } = window.__game, st = game.state, b = document.getElementById('dev-gold');
  return { need: st.everything(), gold: st.gold, chip: !!b && !b.hidden && getComputedStyle(b).display !== 'none' && getComputedStyle(b).pointerEvents !== 'none', label: b ? b.textContent : '', mode: rig.mode };
});
const need = v.need;
check(v.chip && v.mode === 'elf' && /Dev/.test(v.label), `the dev button is beside the purse ("${v.label}")`);
check(need > 12000 && need < 30000 && v.gold === 0, `everything there is to buy comes to ${need} gold, and a new game has none`);
await page.click('#dev-gold');
v = await page.evaluate(() => { const { game } = window.__game, st = game.state; return { gold: st.gold, earned: st.stats.earned, purse: document.getElementById('gold').textContent, hint: document.getElementById('hint').textContent }; });
console.log(`dev: pressed, the purse holds ${v.gold} gold ("${v.hint.slice(0, 70)}...")`);
check(v.gold >= need && v.gold % 1000 === 0 && v.gold - need < 1000, 'pressing it fills the purse with enough for everything');
check(v.earned === 0, 'none of which counts as earned');
check(v.purse.includes(String(v.gold)) && /Dev/.test(v.hint), 'and the purse on screen, and a line under it, say so');
// in the shop: the same button at the foot of the list, and the B key
await page.evaluate(() => { const { game } = window.__game; game.scenes = false; game.raid.start = () => true; game.state.gold = 7; game.open('gnome'); });
await page.click('#dialog [data-act="devgold"]');
v = await page.evaluate(() => { const { game } = window.__game, st = game.state; return { gold: st.gold, foot: document.querySelector('#dialog footer .purse').textContent, said: game.said, dear: document.querySelectorAll('#dialog button.dear').length, tags: document.querySelectorAll('#dialog [data-buy]').length }; });
check(v.gold >= need && v.foot.includes(String(v.gold)), `the same button at the foot of Gnorman's list does the same ("${v.said}")`);
check(v.dear === 0 && v.tags >= 25, `and none of the ${v.tags} price tags is beyond the purse any more`);
await page.click('#dialog [data-buy="electric"]');
await page.keyboard.press('KeyB');
v = await page.evaluate(() => { const { game } = window.__game, st = game.state; return { gold: st.gold, need: st.everything(), owns: st.owns('electric'), dialog: game.dialog }; });
check(v.owns && v.dialog === 'gnome' && v.gold >= v.need && v.need === need - 300, 'B in the shop tops it up again after something has been bought');
// ...and it is enough: every level of everything, whatever can be had again three times over, and lemmings until he is full
v = await page.evaluate(() => {
  const { game } = window.__game, st = game.state, items = game.items, refused = [];
  let bought = 0;
  for (const id of Object.keys(items)) {
    const item = items[id];
    if (item.hire) continue;
    const times = item.levels ? item.levels.length : item.again ? 3 : 1;
    for (let k = 0; k < times; k++) { if (!Number.isFinite(st.price(id))) break; if (st.buy(id)) bought++; else refused.push(id); }
  }
  for (const id of ['plague', 'lemmings', 'lemming']) while (Number.isFinite(st.price(id))) { if (st.buy(id)) bought++; else { refused.push(id); break; } }
  game.close(); game.open('gnome');       // (sending for the cave men shut the shop)
  const left = Object.keys(items).filter((id) => Number.isFinite(st.price(id)) && !items[id].again);
  return { bought, refused, left, gold: st.gold, helpers: st.helpers, tags: [...document.querySelectorAll('#dialog [data-buy]')].map((b) => b.dataset.buy).sort().join(',') };
});
console.log(`dev: bought ${v.bought} things with it; ${v.gold} gold over`);
check(v.refused.length === 0 && v.left.length === 0 && v.gold >= 0, `everything on the list could be bought with it${v.refused.length ? ' (refused: ' + v.refused.join(', ') + ')' : ''}`);
check(v.helpers === 240 && v.tags === 'box,cavemen,tonic', `down to a full complement of lemmings; all that still has a price is what can be had again (${v.tags})`);
await page.evaluate(() => window.__game.game.close());

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no script errors');
await browser.close();
process.exitCode = errors.length ? 1 : 0;
