// The game around the shaving. The elf starts with nothing but the small bad
// scissors. Cut hair is picked up and carried to Mortimer, who pays gold for
// it; gold buys better tools, and ways of reaching more of the mammoth, from
// Gnorman's stall. This file holds that together: who stands where, what the
// player owns, the two shops, and what is kept between visits.
import * as THREE from 'three';
import { GameState, packLengths, unpackLengths } from './state.js';
import { ITEMS, SECTIONS, HAIR_PRICE, inSection } from './catalog.js';
import { TOOL_ORDER } from './shaving.js';
import { buildGnome, buildStall } from './people/gnome.js';
import { buildVulture, buildWigTable } from './people/vulture.js';
import { UNCUT } from '../mammoth/groom.js';
import { Finds } from './finds.js';

const $ = (id) => document.getElementById(id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const grams = (g) => (g >= 1000 ? `${(g / 1000).toFixed(g >= 10000 ? 1 : 2)} kg` : `${Math.round(g)} g`);

/** Where the traders have set up: a short walk from the mammoth's right foreleg, on the side the elf starts. */
const PITCH = {
  gnome: { x: 3.75, z: 3.35, towards: [2.3, 1.75] },
  vulture: { x: 0.55, z: 3.9, towards: [1.0, 0.6] },
};

const SAYS = {
  gnome: {
    hello: [
      'Welcome, welcome! Biggest fan. BIGGEST. Have you seen him? Magnificent. Now take it all off.',
      'I have followed that mammoth for nine years. He has never once looked at me. Buy something.',
      'Back again! He was asking after you. Well, he broke wind in your direction. Same thing.',
      'Everything is sharp, everything is final, and everything was his idea, if anyone asks.',
    ],
    poor: [
      'That is not enough gold. That is barely any gold. Go and cut something off him.',
      'I do not do credit. I did credit once. I keep his kneecaps in a jar.',
      'You cannot afford that. You can afford to look at it. Looking is free until Thursday.',
    ],
    sold: [
      'A fine choice. Do not come crying to me. Come buying to me.',
      'Sold! He will hate that. I shall watch from here, with a sandwich.',
      'Pleasure doing business. I use the word pleasure loosely, as in most things.',
    ],
  },
  vulture: {
    hello: [
      'Ah. A customer. And alive. How... novel.',
      'Mortimer. Toupees for the bald, the balding, and the recently departed. You have hair?',
      'I usually wait for them to stop moving. You are saving me weeks.',
      'Do not mind the skull. He haggled.',
    ],
    empty: [
      'Your sack is empty. Like the eyes of my last client.',
      'Bring me hair. On the hoof, off the hoof, I am not particular.',
      'Nothing? I have waited at bedsides with better prospects.',
    ],
    sold: [
      'Exquisite. Greasy. Faintly warm. I shall make it into something a widow will regret.',
      'Ginger. They always want ginger. Nobody knows why, and those who did are dead.',
      'A pleasure. Do come back. Or do not. I get paid either way, eventually.',
    ],
  },
};

export class Game {
  constructor({ scene, terrain, mammoth, shaving, rig, sound, hint, storage = true, dev = {} }) {
    Object.assign(this, { scene, terrain, mammoth, shaving, rig, sound, hint });
    this.hero = null;            // the elf, who plays a scene when he gets a new tool (set once he is made)
    this.lifter = null;          // the ladders and packs, as seen and heard (likewise)
    this.antics = null;          // what the mammoth gets up to, and wears (likewise)
    this.scenes = !dev.noscene;
    this.state = new GameState({ storage });
    this.resumed = !dev.fresh && this.state.load();
    if (dev.unlock) {
      for (const id of Object.keys(ITEMS)) if (!ITEMS[id].levels && !ITEMS[id].again && !ITEMS[id].wear && !ITEMS[id].flag) this.state.owned.add(id);
      Object.assign(this.state, { climber: 'fire', pack: 'jet', lift: 'ladder' });
      this.scenes = false;
    }
    if (dev.gold != null) this.state.gold = dev.gold;
    this.time = 0;
    this.dialog = null;          // 'gnome' or 'vulture' while one of them is being talked to
    this.pleased = { gnome: 0, vulture: 0 };
    this.casters = [];
    this._v = new THREE.Vector3();
    this.saveIn = 4;
    this.lastCut = -1;

    // ---- the traders ----
    this.people = {};
    const place = (who, builders) => {
      const p = PITCH[who], y = terrain.height(p.x, p.z);
      const turn = Math.atan2(p.towards[0] - p.x, p.towards[1] - p.z);
      const set = builders.map((build) => build());
      for (const part of set) {
        part.group.position.set(p.x, y, p.z);
        part.group.rotation.y = turn;
        part.group.updateMatrixWorld(true);
        scene.add(part.group);
        this.casters.push(...part.meshes);
      }
      this.people[who] = { ...p, y, turn, parts: set, front: [p.x + Math.sin(turn) * 0.5, p.z + Math.cos(turn) * 0.5] };
      return set;
    };
    const [stall, gnome] = place('gnome', [buildStall, buildGnome]);
    gnome.group.position.y += 0.06;                              // on his box
    gnome.group.translateZ(-0.11);
    gnome.group.updateMatrixWorld(true);
    this.gnome = gnome; this.stall = stall;
    const [table, vulture] = place('vulture', [buildWigTable, buildVulture]);
    vulture.group.position.y += 0.1;                             // on his stump
    vulture.group.translateZ(-0.05);
    vulture.group.updateMatrixWorld(true);
    this.vulture = vulture; this.table = table;
    // nobody walks through a stall
    rig.obstacles = [{ x: PITCH.gnome.x, z: PITCH.gnome.z, r: stall.radius }, { x: PITCH.vulture.x, z: PITCH.vulture.z, r: table.radius }];

    // ---- the sack ----
    shaving.room = () => this.state.room;
    shaving.onHair = (g) => this.state.pick(g);
    let toldFull = 0;
    shaving.onFull = () => {
      if (this.time - toldFull < 6) return;
      toldFull = this.time;
      hint(`<strong>Your ${this.sackName()} ${this.state.level('sack') ? 'is' : 'are'} full.</strong> Mortimer the vulture buys hair, over by the wigs.`, 5);
    };

    // ---- what is in hand ----
    if (!this.state.owns(shaving.tool.id)) shaving.setTool(this.state.tool);
    this.applyUpgrades();
    this.state.on((what) => this.onState(what));

    // ---- the haircut, as it was left ----
    // Kept twice over: lock by lock, which is exact but only fits a coat grown
    // at the same detail; and point by point of the hide, which fits any coat
    // but is a little generous at the edges of what was cut.
    if (this.state.haircut) {
      const cut = unpackLengths(this.state.haircut, mammoth.bodyCut.length, UNCUT);
      const kept = this.state.locks, g = mammoth.groom;
      let locks = null;
      if (kept && kept.n === mammoth.strands) {
        locks = { long: unpackLengths(kept.long, g.long.iCut.length, UNCUT), short: unpackLengths(kept.short, g.short.iCut.length, UNCUT) };
        if (!locks.long || !locks.short) locks = null;
      }
      if (cut) mammoth.setHaircut(cut, locks);
    }

    // what is under the coat, waiting to be found
    this.finds = new Finds({ mammoth, state: this.state, hint, sound });

    this.buildDialog();
    this.refresh();
    window.addEventListener('pagehide', () => this.save(true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.save(true); });
  }

  sackName() { return ['pockets', 'sack', 'wheelbarrow', 'bottomless sack'][Math.min(3, this.state.level('sack'))]; }

  /** Things bought that change how other things work. */
  applyUpgrades() {
    const s = this.state;
    this.shaving.reachMore = [1, 1.33, 1.67][Math.min(2, s.level('suck'))];
    this.rig.pace = s.flags.cocoa ? 1.25 : 1;
    // what the up key works: the pack if one is worn, else the ladder
    let lift = null;
    if (s.lift === 'pack' && s.pack) {
      const f = ITEMS[s.pack].fly;
      lift = { kind: 'pack', id: s.pack, thrust: f.thrust, tank: f.tank * [1, 1.5, 2][Math.min(2, s.level('tank'))], refill: f.refill, air: f.air, hover: f.air > 0 };
    } else if (s.climber) {
      const c = ITEMS[s.climber].climb;
      lift = { kind: 'ladder', id: s.climber, top: c.top, lean: c.lean };
    }
    const was = this.rig.lift;
    if (this.rig.ladder && (!lift || lift.kind !== 'ladder' || !was || was.id !== lift.id)) { this.rig.ladder = null; this.rig.onLift('away'); }
    this.rig.lift = lift;
    if (lift && lift.kind === 'pack' && (!was || was.id !== lift.id || was.tank !== lift.tank)) this.rig.fuel = lift.tank;
    if (this.lifter) this.lifter.use(lift);
  }

  /** The T key: with a ladder and a pack both, change which of them the up key works. */
  swapLift() {
    const s = this.state;
    if (!s.climber || !s.pack) return false;
    s.lift = s.lift === 'pack' ? 'ladder' : 'pack';
    s.changed('use');
    this.applyUpgrades();
    this.hint(s.lift === 'pack' ? `<strong>${ITEMS[s.pack].name}.</strong> Hold <kbd>R</kbd> or the right mouse button to burn.` : `<strong>${ITEMS[s.climber].name}.</strong> <kbd>R</kbd> stands it up and climbs; <kbd>F</kbd> comes down.`, 5);
    return true;
  }

  onState(what) {
    this.refresh();
    if (what.startsWith('bought:')) {
      const id = what.slice(7), item = ITEMS[id];
      this.applyUpgrades();
      if (id === 'tonic') this.regrow();
      if (id === 'box') this.lucky();
      if (item.wear && this.antics) this.antics.dress();
      if (id === 'pinkdye' && this.antics) { this.antics.dye(); this.tell = '<strong>He is pink.</strong> All of him. He has not looked yet.'; }
      if (item.kind === 'cutter') { this.state.tool = id; this.shaving.take(id); this.celebrate(id); }
      if (item.kind === 'sweeper' && this.shaving.tool.def.sweep) this.shaving.setTool(id);
      if (item.kind === 'ladder') this.tell = `<strong>${item.name}.</strong> <span class="desk">Press <kbd>R</kbd> to stand it up where you are and climb; <kbd>F</kbd> comes down, <kbd>A</kbd> and <kbd>D</kbd> walk it sideways.</span><span class="nomouse">Hold Up to stand it where you are and climb.</span> He is taller than it is.`;
      if (item.kind === 'pack') this.tell = `<strong>${item.name}.</strong> <span class="desk">Hold <kbd>R</kbd> or the right mouse button to burn.</span><span class="nomouse">Hold Up to burn.</span> It fills up again on the ground. You can land on him.${this.state.climber ? ' <span class="desk"><kbd>T</kbd> swaps back to the ladder.</span>' : ''}`;
    }
  }

  /** The tonic: the coat comes back, in his own colour, and the shave starts again (what was bought is kept). */
  regrow() {
    const s = this.state;
    this.mammoth.setHaircut(null);
    s.stats.tonics++;
    s.flags.pink = false; s.flags.done = false; s.flags.told = {};
    if (this.antics) this.antics.dye();
    this.hint('<strong>It all grew back.</strong> He is furious, and fluffy.', 6);
    s.dirty = true;
  }

  /** The mystery box. On average it is a way of giving Gnorman forty gold. */
  lucky() {
    const s = this.state, r = Math.random();
    if (r < 0.42) this.said = pick(['A sock. One. Left foot. Enjoy.', 'It is empty. No, wait. No, it is empty.', 'A drawing of what you could have won. I did it myself.']);
    else if (r < 0.57) this.said = 'A smaller mystery box! ...With nothing in it. That is the mystery.';
    else if (r < 0.82) { const g = 30 + Math.floor(Math.random() * 41); s.earn(g); this.said = `${g} gold! Somebody’s purse. Finders keepers. Do not look at the initials.`; }
    else if (r < 0.94) { const got = s.pick(100); this.said = got > 1 ? `Hair! ${Math.round(got)} grams of it. Not his. Do not ask whose.` : 'Hair! ...Which you have no room for. I will keep it. Lovely doing business.'; }
    else { s.earn(250); this.said = 'TWO HUNDRED AND FIFTY GOLD. I did not know that was in there. I want it noted that I did not know.'; }
    this.fillDialog();
  }

  /** Bald. The legend is fulfilled; say so, and ask what next. */
  finale() {
    const el = $('finale'), s = this.state;
    if (!el) return;
    if (this.dialog) this.close();
    el.querySelector('.stats').textContent = `${Math.round(s.stats.sold / 100) / 10} kg of hair sold · ${s.stats.earned} gold earned · ${s.found.length} of ${this.finds.total} things found under it${s.stats.farts ? ` · ${s.stats.farts} incidents` : ''}`;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    this.sound.fanfare('grand');
    this.sound.trumpet();
    if (!this._finaleWired) {
      this._finaleWired = true;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        el.classList.remove('show'); el.hidden = true;
        if (b.dataset.act === 'regrow') { this.regrow(); this.state.stats.tonics--; this.save(true); }
      });
    }
    this.save(true);
  }

  // ---- the scene for a new tool ----------------------------------------------------------

  /** A new cutting tool: everything stops while it is admired. Returns true if the scene is being played. */
  celebrate(id) {
    const got = this.state.flags.got || (this.state.flags.got = {});
    got[id] = true;
    this.state.dirty = true;
    if (!this.hero || !this.scenes || this.rig.mode !== 'elf') return false;
    // (for anyone who has asked their machine for less motion, the news without the camera going round)
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.sound.fanfare(id === 'scissors' ? 'droop' : 'grand');
      this.hint(`<strong>You got the ${ITEMS[id].name}!</strong> ${ITEMS[id].got || ''}`, 8);
      this.tipIn = 12;
      return false;
    }
    // bought at a stall: he steps out from under its awning with his back to it, and the shop waits
    const who = this.dialog, d = $('dialog');
    const stall = who ? { x: this.people[who].x, z: this.people[who].z, r: (who === 'gnome' ? this.stall : this.table).radius } : null;
    this.shaving.squeeze(false);
    return this.hero.celebrate(id, {
      away: stall,
      onDone: () => {
        if (who && this.dialog === who && d) { this.fillDialog(); this.face(who); }
        else if (id === 'scissors') this.hint('<strong>Small bad scissors.</strong> Walk up to the mammoth and cut. <span class="desk"><kbd>Left mouse</kbd> or <kbd>Space</kbd> cuts, <kbd>W A S D</kbd> walks, <kbd>Q</kbd> swaps to picking the hair up.</span>', 10);
      },
    });
  }

  /** The elf has climbed down to the snow. The first time, he takes a moment over what he has been given to do the job. */
  arrive() {
    if (!(this.state.flags.got || {}).scissors) return this.celebrate('scissors');
    return false;
  }

  // ---- tools --------------------------------------------------------------------------

  /** The cutting tools owned, in the order of the number keys. */
  get cutters() { return TOOL_ORDER.filter((id) => this.state.owns(id)); }

  /** Take a tool in hand, if it has been bought. */
  choose(id) {
    if (!this.state.owns(id) || !this.shaving.tools[id]) return false;
    this.shaving.setTool(id);
    if (ITEMS[id].kind === 'cutter') this.state.tool = id; else this.state.sweeper = id;
    this.state.changed('tool');
    return true;
  }

  /** The n-th cutting tool the player owns (n from 0), or the next or previous one. */
  chooseNumber(n) { const id = TOOL_ORDER[n]; return id ? this.choose(id) : false; }
  step(dir) {
    const have = [...this.cutters, this.state.sweeper], now = have.indexOf(this.shaving.next || this.shaving.tool.id);
    return this.choose(have[(Math.max(0, now) + dir + have.length) % have.length]);
  }

  /** Swap between cutting and picking up. */
  toggleSweep() {
    const sweeping = !!(this.shaving.tools[this.shaving.next || this.shaving.tool.id].def.sweep);
    return this.choose(sweeping ? this.state.tool : this.state.sweeper);
  }

  // ---- the head-up display --------------------------------------------------------------

  refresh() {
    const s = this.state;
    const gold = $('gold'), bag = $('bag');
    if (gold) gold.textContent = `${s.gold} gold`;
    if (bag) {
      bag.textContent = `${grams(s.hair)} of ${grams(s.capacity)}`;
      bag.classList.toggle('full', s.room < 1);
    }
    const now = this.shaving.next || this.shaving.tool.id;
    for (const b of document.querySelectorAll('[data-tool]')) {
      const id = b.dataset.tool;
      if (id === 'sweep') {
        b.lastChild.textContent = ITEMS[s.sweeper].name;
        b.setAttribute('aria-pressed', String(!!this.shaving.tools[now].def.sweep));
      } else {
        b.hidden = !s.owns(id);
        b.setAttribute('aria-pressed', String(id === now));
      }
    }
    if (this.dialog) this.fillDialog();
  }

  // ---- talking to people ------------------------------------------------------------------

  /** Who the elf is standing in front of, if anyone ('gnome', 'vulture' or null). */
  nearby() {
    const p = this.rig.pos;
    let best = null, bestD = 0.95;
    for (const who of ['gnome', 'vulture']) {
      const at = this.people[who], d = Math.hypot(p.x - at.front[0], p.z - at.front[1]);
      if (d < bestD) { best = who; bestD = d; }
    }
    return best;
  }

  /** The E key: talk to whoever is there, or stop talking. Returns true if it did something. */
  interact() {
    if (this.dialog) { this.close(); return true; }
    const who = this.rig.mode === 'elf' ? this.nearby() : null;
    if (!who) return false;
    this.open(who);
    return true;
  }

  buildDialog() {
    const d = $('dialog');
    if (!d) return;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.buy) this.buy(b.dataset.buy);
      else if (b.dataset.use) this.use(b.dataset.use);
      else if (b.dataset.act === 'sell') this.sell();
      else if (b.dataset.act === 'close') this.close();
    });
  }

  open(who) {
    const d = $('dialog');
    if (!d) return;
    this.dialog = who;
    this.said = pick(SAYS[who].hello);
    if (who === 'vulture' && this.state.hair < 1) this.said = pick(SAYS.vulture.empty);
    // they have eyes: now and then they remark on the state he is in
    const s = this.state, shorn = this.mammoth.shorn, notes = [];
    if (who === 'gnome') {
      if (s.flags.pink) notes.push('PINK! You made him PINK. I have never loved him more.');
      if (s.found.includes('thong')) notes.push('You have seen the thong, then. We do not speak of the thong.');
      if (s.worn.includes('partyhat')) notes.push('He looks so happy in the hat. You cannot tell, but I can. Nine years.');
      if (shorn > 0.9) notes.push('There is hardly any of him left to be a fan of. I shall be a fan of what there is.');
      else if (shorn > 0.4) notes.push('He is half the mammoth he was. I have had to let out my scrapbook.');
      if (s.found.length >= 10) notes.push('The tattoos! I knew about four. I was present for one.');
    } else if (s.hair >= 1) {
      if (s.flags.pink) notes.push('Pink. How... commercial. I will take all of it.');
      if (shorn > 0.5) notes.push('He is looking thin on top. And on the sides. I could do something for him. At a price.');
      if (s.worn.includes('shades')) notes.push('Sunglasses. On a mammoth. I have buried men for less.');
    }
    if (notes.length && Math.random() < 0.6) this.said = pick(notes);
    this.state.stats.visits++;
    this.face(who);
    this.shaving.squeeze(false);
    d.hidden = false;
    d.dataset.who = who;
    this.fillDialog();
    d.querySelector('.sheet').scrollTop = 0;
    this.sound.blip(who);
  }

  /** Stand still and turn to one of the traders (a little to one side on a wide screen, where the list of wares has the other). */
  face(who) {
    const at = this.people[who], p = this.rig.pos, far = Math.hypot(at.x - p.x, at.z - p.z);
    const wide = window.innerWidth >= 960;
    this.rig.hold(true, { yaw: Math.atan2(-(at.x - p.x), -(at.z - p.z)) + (wide ? 0.42 : 0), pitch: Math.atan2(at.y + (who === 'gnome' ? 0.3 : 0.5) - p.y, far) });
  }

  close() {
    const d = $('dialog');
    if (!this.dialog || !d) return;
    this.dialog = null;
    d.hidden = true;
    this.rig.hold(false);
    this.save(true);
    // (anything bought that wants explaining is explained on the way out)
    if (this.tell) { this.hint(this.tell, 12); this.tipIn = 16; this.tell = null; }
  }

  price() { return HAIR_PRICE * (this.state.flags.foot ? 1.15 : 1) * (this.state.flags.pink ? 1.2 : 1); }

  fillDialog() {
    const d = $('dialog'), s = this.state, who = this.dialog;
    if (!d || !who) return;
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let html = '';
    if (who === 'vulture') {
      const offer = Math.floor(s.hair * this.price() + 1e-6);
      html += `<header><h2>Mortimer</h2><p class="trade">Fine toupees. Hair bought by the gram.</p><p class="says">“${esc(this.said)}”</p></header>`;
      html += `<div class="weigh"><p class="big">${grams(s.hair)}</p><p>in your ${this.sackName()}, at ${(this.price() * 100).toFixed(0)} gold the hundred grams${s.flags.foot ? " (the rabbit's foot is working)" : ''}${s.flags.pink ? ' (pink is extra)' : ''}</p>`;
      html += `<button type="button" class="deal" data-act="sell" ${offer > 0 ? '' : 'disabled'}>${offer > 0 ? `Sell it all for ${offer} gold` : 'Nothing to sell'}</button>`;
      const lying = this.shaving.clippings.lying;
      if (lying >= 1) html += `<p class="aside">There is another ${grams(lying)} lying about on the snow. He can see it from here. He is counting.</p>`;
      html += '</div>';
    } else {
      html += `<header><h2>Gnorman’s</h2><p class="trade">Sharp things &amp; sundries. Gold only.</p><p class="says">“${esc(this.said)}”</p></header>`;
      for (const sec of SECTIONS) {
        const ids = inSection(sec.id).filter((id) => s.available(id));
        if (!ids.length) continue;
        html += `<section><h3>${sec.title}</h3><p class="note">${sec.note}</p><ul>`;
        for (const id of ids) {
          const item = ITEMS[id];
          let name = item.name, blurb = item.blurb, action;
          const p = s.price(id);
          if (item.levels) {
            const at = s.level(id), next = item.levels[at];
            if (next) { name = next.name; blurb = next.blurb; }
            else { name = item.levels[at - 1].name; blurb = 'You have the best there is. I checked. I looked everywhere.'; }
          }
          if (Number.isFinite(p)) action = `<button type="button" data-buy="${id}" ${p > s.gold ? 'class="dear"' : ''}>${p} gold</button>`;
          else if (['sweeper', 'ladder', 'pack'].includes(item.kind)) {
            const inUse = s.sweeper === id || (s.climber === id && s.lift !== 'pack') || (s.pack === id && s.lift === 'pack');
            action = inUse ? '<span class="have">In use</span>' : `<button type="button" class="use" data-use="${id}">Use this</button>`;
          } else action = '<span class="have">Yours</span>';
          html += `<li><div><strong>${esc(name)}</strong><span>${esc(blurb)}</span></div>${action}</li>`;
        }
        html += '</ul></section>';
      }
    }
    html += `<footer><span class="purse">${s.gold} gold</span><button type="button" data-act="close">Leave <kbd class="desk">E</kbd></button></footer>`;
    const sheet = d.querySelector('.sheet'), top = sheet.scrollTop;
    sheet.innerHTML = html;
    sheet.scrollTop = top;
  }

  buy(id) {
    const s = this.state;
    if (s.price(id) > s.gold) { this.said = pick(SAYS.gnome.poor); this.sound.blip('no'); this.fillDialog(); return; }
    this.said = pick(SAYS.gnome.sold);
    if (s.buy(id)) { this.pleased.gnome = 1; this.sound.coin(3); }
  }

  /** Switch to something already owned (a different ladder, an older broom). */
  use(id) {
    const s = this.state, item = ITEMS[id];
    if (!s.owns(id)) return;
    if (item.kind === 'sweeper') { s.sweeper = id; if (this.shaving.tool.def.sweep) this.shaving.setTool(id); }
    if (item.kind === 'ladder') { s.climber = id; s.lift = 'ladder'; }
    if (item.kind === 'pack') { s.pack = id; s.lift = 'pack'; }
    s.changed('use');
    this.applyUpgrades();
  }

  sell() {
    const paid = this.state.sell(this.price());
    if (paid > 0) { this.said = pick(SAYS.vulture.sold); this.pleased.vulture = 1; this.sound.coin(Math.min(8, 2 + Math.floor(paid / 20))); }
    else this.said = pick(SAYS.vulture.empty);
    this.fillDialog();
  }

  // ---- every frame --------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    const p = this.rig.pos, elf = this.rig.mode === 'elf';
    for (const who of ['gnome', 'vulture']) {
      const at = this.people[who], dx = p.x - at.x, dz = p.z - at.z, d = Math.hypot(dx, dz);
      // which way the visitor is, from where the trader stands and the way they face
      const look = Math.atan2(dx, dz) - at.turn;
      const near = elf ? 1 - THREE.MathUtils.smoothstep(d, 0.9, 2.4) : 0;
      this.pleased[who] = Math.max(0, this.pleased[who] - dt * 0.8);
      this[who].update(dt, this.time, Math.atan2(Math.sin(look), Math.cos(look)), near, this.pleased[who]);
    }
    this.table.update(dt, this.time, this.dialog === 'vulture' && this.state.hair > 1 ? 1 : this.pleased.vulture);

    // who can be talked to from here
    const playing = !!(this.hero && this.hero.playing);
    const who = elf && !this.dialog && !playing ? this.nearby() : null;
    const prompt = $('prompt');
    if (prompt && who !== this.prompting) {
      this.prompting = who;
      prompt.hidden = !who;
      if (who) prompt.innerHTML = `<kbd class="desk">E</kbd> Talk to ${who === 'gnome' ? 'Gnorman' : 'Mortimer'}`;
    }

    this.finds.update(dt, !elf || !!this.dialog || playing);
    if (this.antics) this.antics.update(dt, { elf, busy: !!this.dialog || playing });
    this.guide(dt, elf);

    // keep the haircut: it is the one thing that cannot be bought back (well, it can, for 150 gold)
    this.saveIn -= dt;
    if (this.saveIn <= 0) { this.saveIn = 5; this.save(false); }
  }

  /** A word of advice, once each, when it is first needed: how the hair turns into gold and the gold into tools. */
  guide(dt, elf) {
    this.tipIn = (this.tipIn ?? 3) - dt;
    if (!elf || this.dialog || this.tipIn > 0 || (this.hero && this.hero.playing)) return;
    this.tipIn = 1;
    const s = this.state, told = s.flags.tips || (s.flags.tips = {}), sweeping = !!this.shaving.tool.def.sweep;
    const tell = (id, html, seconds = 10) => { told[id] = true; s.dirty = true; this.tipIn = seconds + 4; this.hint(html, seconds); };
    if (!told.pickup && !sweeping && s.stats.picked < 1 && this.shaving.clippings.lying > 2.5) {
      tell('pickup', '<strong>That hair is worth gold.</strong> <span class="desk">Press <kbd>Q</kbd> to</span><span class="nomouse">Tap the hands button to</span> put the scissors away, look at the hair on the snow, and hold the cut button to gather it.');
    } else if (!told.sell && s.stats.sold < 1 && s.hair >= Math.min(40, s.capacity * 0.6)) {
      tell('sell', '<strong>Mortimer the vulture buys hair.</strong> He is under the sign with his name on it, a few paces from the mammoth. Walk up to him<span class="desk"> and press <kbd>E</kbd></span>.');
    } else if (!told.shop && s.stats.spent < 1 && s.gold >= 15) {
      tell('shop', '<strong>Gnorman sells better tools</strong> at the striped stall, and something to carry more hair in. You can afford a thing or two.');
    } else if (!told.reach && !s.climber && !s.pack && s.stats.sold > 700) {
      tell('reach', '<strong>Running out of mammoth you can reach?</strong> Gnorman has ladders. And worse ideas.');
    }
  }

  save(now) {
    if (this.mammoth.cutLength !== this.lastCut) {
      this.lastCut = this.mammoth.cutLength;
      this.state.haircut = packLengths(this.mammoth.bodyCut);
      const g = this.mammoth.groom;
      this.state.locks = this.state.haircut ? { n: this.mammoth.strands, long: packLengths(g.long.iCut), short: packLengths(g.short.iCut) } : null;
      this.state.dirty = true;
    }
    if (now || this.state.dirty) this.state.save();
  }

  /** Start again from nothing. */
  restart() {
    this.state.wipe();
    this.mammoth.setHaircut(null);
    this.shaving.setTool('scissors');
    this.applyUpgrades();
    if (this.antics) { this.antics.dress(); this.antics.dye(); }
    this.refresh();
  }
}
