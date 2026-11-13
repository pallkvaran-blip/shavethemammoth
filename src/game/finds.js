// What turns up under the hair. Each tattoo (and the thong) counts as found
// once enough of the hide it is on has been cut short enough to see it. A
// find is announced once, pays a little, and is kept with the saved game.
import { TATTOOS, THONG } from '../mammoth/tattoos.js';

const SEEN = 0.03;          // hair this short (metres) no longer hides what is under it
export const THONG_PAYS = 120, TATTOO_PAYS = 30;

const SAYS = {
  left: 'It is on his right leg.',
  otherleft: 'It is on his left leg. He had it done second.',
  bestbefore: 'He is some way past it.',
  thaw: 'Somebody did.',
  cuthere: 'Helpful, if a little forward.',
  butcher: 'He lost a bet, or won one. Hard to say.',
  livelaugh: 'Two out of three so far.',
  mum: 'Everybody had one.',
  death: 'About that.',
  exit: 'It points the way.',
  kiss: 'You are not going to.',
  honk: 'He has not got a horn. He has got a trunk. It is worse.',
  ride: 'He means it kindly.',
  nosy: 'You are lying on your back under a mammoth with a pair of scissors. Yes.',
  dnr: 'Noted.',
  ruler: 'Nobody asked.',
  hello: 'Kevin.',
  pad: 'You are standing on it.',
  property: 'It has been a long ten thousand years.',
};

/** Whether a point of the hide (rest pose) is under the thong: the same sum the skin's shader does. */
export function underThong(x, y, z) {
  const t = THONG;
  if (Math.abs(x - t.band) < t.wide) return true;
  if (x > t.band + t.wide || x < t.end) return false;
  const w = y > t.split ? t.strap * 0.8 + 0.9 * Math.max(0, x - (t.band - 0.3)) : t.strap + 0.5 * Math.max(0, x - (t.band - 0.5));
  return Math.abs(z) < w;
}

export class Finds {
  constructor({ mammoth, state, hint, sound }) {
    Object.assign(this, { mammoth, state, hint, sound });
    const P = mammoth.data.body.positions, Nrm = mammoth.data.body.normals, n = P.length / 3;
    // the points of the hide each one lies on
    this.spots = mammoth.tattoos.map((t, i) => {
      const at = [], reach = 0.1 + 0.32 * Math.max(t.w, t.h);
      for (let v = 0; v < n; v++) {
        const dx = P[v * 3] - t.centre.x, dy = P[v * 3 + 1] - t.centre.y, dz = P[v * 3 + 2] - t.centre.z;
        if (Math.abs(dx * t.u.x + dy * t.u.y + dz * t.u.z) > t.w * 0.8 || Math.abs(dx * t.v.x + dy * t.v.y + dz * t.v.z) > t.h * 0.8) continue;
        if (Math.abs(dx * t.n.x + dy * t.n.y + dz * t.n.z) > reach) continue;
        if (Nrm[v * 3] * t.n.x + Nrm[v * 3 + 1] * t.n.y + Nrm[v * 3 + 2] * t.n.z < 0.25) continue;
        at.push(v);
      }
      return { id: t.id, name: TATTOOS[i].name, at, need: 0.6, pays: TATTOO_PAYS };
    });
    const worn = [];
    for (let v = 0; v < n; v++) if (underThong(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])) worn.push(v);
    this.spots.push({ id: 'thong', name: 'the thong', at: worn, need: 0.3, pays: THONG_PAYS });
    this.total = this.spots.length;
    this.wait = 1.5;
    this.onFind = () => {};
  }

  get count() { return this.state.found.length; }

  /** How much of one is uncovered, 0..1. */
  shown(spot) {
    const cut = this.mammoth.bodyCut;
    let k = 0;
    for (const v of spot.at) if (cut[v] < SEEN) k++;
    return spot.at.length ? k / spot.at.length : 0;
  }

  /** How many are uncovered but not yet announced. */
  pending() {
    let n = 0;
    for (const spot of this.spots) if (!this.state.found.includes(spot.id) && this.shown(spot) >= spot.need) n++;
    return n;
  }

  update(dt, quiet = false) {
    this.wait -= dt;
    if (this.wait > 0 || quiet) return;
    this.wait = 0.5;
    const s = this.state;
    for (const spot of this.spots) {
      if (s.found.includes(spot.id) || this.shown(spot) < spot.need) continue;
      s.found.push(spot.id);
      s.earn(spot.pays);
      this.sound.coin(4);
      const left = this.total - s.found.length;
      if (spot.id === 'thong') this.hint(`<strong>He is wearing a thong.</strong> Pink. Of course he is. Gnorman pays ${spot.pays} gold to have that confirmed.`, 9);
      else this.hint(`<strong>A tattoo: ${spot.name}.</strong> ${SAYS[spot.id] || ''} Gnorman pays ${spot.pays} gold for gossip. ${left ? `${left} more under there somewhere.` : 'That is all of them. You know him better than his mother did.'}`, 9);
      this.wait = 3;            // one at a time
      this.onFind(spot);
      return;
    }
  }
}
