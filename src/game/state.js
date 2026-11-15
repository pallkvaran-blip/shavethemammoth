// What the player has: gold, the hair he is carrying, what has been bought, how
// far the shave has got. Kept in the browser between visits, so that closing
// the page does not grow the coat back.
import { ITEMS, MOST_HELP } from './catalog.js';

const KEY = 'mammoth-save-3';

// Lengths of hair are kept a byte each: 255 for never cut, otherwise a step
// on a scale that is fine for stubble (a fiftieth of a millimetre at the skin)
// and coarser for long hair (half a centimetre at half a metre).
const SPAN = 1.2;      // metres: nothing on him is longer

/** Pack lengths of hair (metres; anything of SPAN or more counts as uncut). Returns '' if nothing has been cut. */
export function packLengths(cut) {
  const bytes = new Uint8Array(cut.length);
  let any = false;
  for (let i = 0; i < cut.length; i++) {
    const v = cut[i];
    if (v >= SPAN) bytes[i] = 255;
    else { bytes[i] = Math.min(254, Math.round(Math.sqrt(Math.max(0, v) / SPAN) * 254)); any = true; }
  }
  if (!any) return '';
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(s);
}

/** The reverse. Returns null if the text is not for a coat of this size (it was made differently then). */
export function unpackLengths(text, length, uncut) {
  const cut = new Float32Array(length).fill(uncut);
  if (!text) return cut;
  let raw;
  try { raw = atob(text); } catch { return null; }
  if (raw.length !== length) return null;
  for (let i = 0; i < length; i++) { const b = raw.charCodeAt(i); if (b !== 255) cut[i] = SPAN * (b / 254) ** 2; }
  return cut;
}

export class GameState {
  constructor({ storage = true } = {}) {
    this.storage = storage;
    this.listeners = new Set();
    this.dirty = false;
    this.fresh();
  }

  /** A new game: the bad scissors, bare hands, and empty pockets. */
  fresh() {
    this.gold = 0;
    this.hair = 0;                         // grams carried
    this.owned = new Set(['scissors', 'hands']);
    this.levels = {};                      // upgrades: id -> level bought
    this.tool = 'scissors';                // the cutting tool last in hand
    this.sweeper = 'hands';                // what the hair is picked up with
    this.climber = null;                   // the ladder being carried, if any
    this.pack = null;                      // the jet pack worn, if any
    this.lift = null;                      // which of those the up key works: 'ladder' or 'pack'
    this.found = [];                       // tattoos uncovered
    this.worn = [];                        // extras the mammoth has been given to wear
    this.helpers = 0;                      // lemmings on the payroll
    this.used = [];                        // novelties that have been used up (until he has a new coat)
    this.owed = 0;                         // gold that has come out of him and is still lying on the snow
    this.stats = { cut: 0, picked: 0, sold: 0, earned: 0, spent: 0, visits: 0, tonics: 0 };
    this.flags = {};
    this.haircut = '';                     // the hide, point by point (see Game.save)
    this.locks = null;                     // and lock by lock, for a coat of the same detail
    this.dirty = true;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(what = 'state') { this.dirty = true; for (const fn of this.listeners) fn(what, this); }

  owns(id) { return this.owned.has(id); }
  level(id) { return this.levels[id] || 0; }


  /** What something costs now (an upgrade costs more each time), or Infinity if there is no more of it to buy. */
  price(id) {
    const item = ITEMS[id];
    if (!item) return Infinity;
    let p;
    if (item.levels) {
      const at = this.level(id);
      if (at >= item.levels.length) return Infinity;
      p = item.levels[at].price;
    } else {
      if (this.owns(id) && !item.again) return Infinity;
      if (this.used.includes(id)) return Infinity;                                // (it worked once, and that was it)
      if (item.hire && this.helpers + item.hire > MOST_HELP) return Infinity;     // (there is only so much mammoth)
      p = item.price;
    }
    return Math.max(1, Math.round(p * (this.flags.loyal ? 0.9 : 1)));
  }

  /**
   * What it would cost to buy everything there still is to buy: every level of everything, lemmings until there is no
   * room for another, and whatever can be had again and again (the cave men, the tonic, the mystery box) `again` times.
   * Nobody is expected to earn this; it is what the dev button asks for (see Game.devGold).
   */
  everything(again = 3) {
    let total = 0;
    for (const id of Object.keys(ITEMS)) {
      const item = ITEMS[id];
      if (item.levels) { for (let l = this.level(id); l < item.levels.length; l++) total += item.levels[l].price; }
      else if (item.hire) continue;
      else if (item.again) total += item.price * again;
      else if (!this.owns(id) && !this.used.includes(id)) total += item.price;
    }
    // (lemmings in the biggest lots that there is room for)
    let room = Math.max(0, MOST_HELP - this.helpers);
    for (const item of Object.values(ITEMS).filter((i) => i.hire).sort((x, y) => y.hire - x.hire)) { const n = Math.floor(room / item.hire); total += n * item.price; room -= n * item.hire; }
    return total;
  }

  /** Whether the shop will sell it yet: some things want another thing first. */
  available(id) {
    const item = ITEMS[id];
    return !!item && (!item.needs || item.needs.every((n) => this.owns(n) || this.level(n) > 0));
  }

  /** Buy something. Returns false if it cannot be afforded or is not for sale. */
  buy(id) {
    const item = ITEMS[id], p = this.price(id);
    if (!item || !Number.isFinite(p) || p > this.gold || !this.available(id)) return false;
    this.gold -= p;
    this.stats.spent += p;
    if (item.levels) this.levels[id] = this.level(id) + 1;
    else this.owned.add(id);
    if (item.kind === 'sweeper') this.sweeper = id;
    if (item.kind === 'ladder') { this.climber = id; this.lift = 'ladder'; }
    if (item.kind === 'pack') { this.pack = id; this.lift = 'pack'; }
    if (item.flag) this.flags[item.flag] = true;
    if (item.wear && !this.worn.includes(item.wear)) this.worn.push(item.wear);
    if (item.hire) this.helpers += item.hire;
    this.changed('bought:' + id);
    return true;
  }

  /** A novelty has been used up: it is no longer owned, and is not for sale again until he has a new coat. */
  spend(id) {
    this.owned.delete(id);
    if (!this.used.includes(id)) this.used.push(id);
    this.changed('used:' + id);
  }

  /** Hair picked up (there is no limit to what he can carry); returns the grams. */
  pick(grams) {
    const take = Math.max(0, grams);
    if (take > 0) { this.hair += take; this.stats.picked += take; this.changed('hair'); }
    return take;
  }

  /** Sell all the hair carried, at a price per gram. Returns the gold paid. */
  sell(perGram) {
    const paid = Math.floor(this.hair * perGram + 1e-6);
    if (paid <= 0) return 0;
    this.stats.sold += this.hair;
    this.hair = 0;
    this.earn(paid);
    return paid;
  }

  earn(gold) {
    this.gold += gold;
    this.stats.earned += gold;
    this.changed('gold');
  }

  // ---- keeping it ----------------------------------------------------------------

  toJSON() {
    return {
      v: 3, gold: this.gold, hair: this.hair, owned: [...this.owned], levels: this.levels, tool: this.tool, sweeper: this.sweeper,
      climber: this.climber, pack: this.pack, lift: this.lift, found: this.found, worn: this.worn, helpers: this.helpers, used: this.used, owed: this.owed, stats: this.stats, flags: this.flags, haircut: this.haircut, locks: this.locks,
    };
  }

  save() {
    if (!this.storage || !this.dirty) return;
    try { localStorage.setItem(KEY, JSON.stringify(this)); this.dirty = false; } catch { /* no storage here: the game still plays, it just is not kept */ }
  }

  /** Returns true if there was a game to carry on with. */
  load() {
    if (!this.storage) return false;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { d = null; }
    if (!d || d.v !== 3) return false;
    this.gold = +d.gold || 0;
    this.hair = +d.hair || 0;
    // (what is no longer sold: whoever had one has the better thing it made way for)
    const now = (id) => ({ shaver: 'electric', twig: 'push', handvac: 'shopvac', step: 'fire', painter: 'fire', soda: 'jet', blower: 'jet' })[id] || id;
    for (const k of ['tool', 'sweeper', 'climber', 'pack']) d[k] = now(d[k]);
    this.owned = new Set(['scissors', 'hands', ...(Array.isArray(d.owned) ? d.owned.map(now).filter((id) => ITEMS[id]) : [])]);
    this.levels = d.levels && typeof d.levels === 'object' ? d.levels : {};
    this.tool = this.owned.has(d.tool) ? d.tool : 'scissors';
    this.sweeper = this.owned.has(d.sweeper) ? d.sweeper : 'hands';
    this.climber = this.owned.has(d.climber) ? d.climber : null;
    this.pack = this.owned.has(d.pack) ? d.pack : null;
    this.lift = d.lift === 'pack' && this.pack ? 'pack' : this.climber ? 'ladder' : this.pack ? 'pack' : null;
    this.found = Array.isArray(d.found) ? d.found : [];
    this.worn = Array.isArray(d.worn) ? d.worn : [];
    this.helpers = Math.max(0, Math.min(MOST_HELP, Math.floor(+d.helpers || 0)));
    this.used = Array.isArray(d.used) ? d.used.filter((id) => ITEMS[id] && !this.owned.has(id)) : [];
    this.owed = Math.max(0, Math.floor(+d.owed || 0));
    this.stats = { ...this.stats, ...(d.stats || {}) };
    this.flags = d.flags && typeof d.flags === 'object' ? d.flags : {};
    this.haircut = typeof d.haircut === 'string' ? d.haircut : '';
    this.locks = d.locks && typeof d.locks === 'object' && typeof d.locks.long === 'string' && typeof d.locks.short === 'string' ? d.locks : null;
    this.dirty = false;
    return true;
  }

  wipe() {
    try { localStorage.removeItem(KEY); } catch { /* nothing was kept */ }
    this.fresh();
    this.changed('new');
  }
}
