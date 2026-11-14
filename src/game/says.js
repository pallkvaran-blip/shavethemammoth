// What the mammoth has to say about it all: a speech bubble by his head,
// every now and then. (The remarks in the hint at the foot of the screen,
// in antics.js and finds.js, are about him; these are from him.)
//
// The rest of the game tells him what has happened with heard(): a cut, a
// find, something bought. He answers when there is a moment: never while a
// shop is open or a scene is playing, never twice in a few seconds, and left
// to himself only once a minute or so.
import * as THREE from 'three';

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (a, b) => a + Math.random() * (b - a);

// ---- what he says -----------------------------------------------------------

/** Before a hair of him has been touched. */
const HELLO = [
  'Lovely evening. I do hope nothing happens to it.',
  'What a peaceful evening. Nothing small and sharp anywhere.',
  'Ten thousand years, and not one bad hair day.',
];
/** To somebody who has been here before, and done things. */
const AGAIN = [
  'Oh. It’s you. And the scissors.',
  'You came back. I had hoped you were a dream.',
  'Still here. Still cold. Thank you for asking.',
];
const AGAIN_BALD = ['Don’t look at me.', 'Yes, well. Here I am. All of me.'];

const FIRST_CUT = [
  'Excuse me. Did you just... you did.',
  'Oh. We are really doing this, then.',
  'I felt that. That one had a name.',
];

/** A tattoo has come to light: what he has to say for himself, one by one, and otherwise. */
const FOUND = {
  left: 'Yes. I know which leg that is.',
  otherleft: 'They put it right. In a sense.',
  bestbefore: 'That is a guideline.',
  thaw: 'I mean it. I have seen what happens.',
  cuthere: 'That was a joke. That was a JOKE.',
  butcher: 'I am told the brisket is very good.',
  livelaugh: 'My sister has the same one. Had.',
  mum: 'She would have liked you. Briefly.',
  death: 'Yes. Well. Here we both are.',
  exit: 'It is a safety notice.',
  kiss: 'Do not.',
  honk: 'I was going through a phase. An interglacial.',
  ride: 'I don’t know what it means either.',
  nosy: 'Well, you are.',
  dnr: 'I have thought about it a great deal.',
  ruler: 'It is cold out.',
  hello: 'Kevin. Yes. Go on, get it out of your system.',
  pad: 'And yet.',
  property: 'We do not talk about her.',
  wide: 'That is a legal requirement.',
  tooclose: 'You are, though.',
  tusks: 'They are very good tusks.',
  thong: 'It was a gift. From me. To me.',
};
/** The first thing ever found on him, whatever it is (but for his name). */
const FOUND_FIRST = 'Gosh, this is embarrassing.';
const FOUND_ANY = ['Nobody was ever supposed to see that.', 'It seemed like a good idea ten thousand years ago.'];

/** Something has been bought, and he has seen what. */
const BOUGHT = {
  sheep: 'Shears. I am not a sheep. I want that on record.',
  garden: 'Garden clippers. I am not a hedge.',
  shaver: 'It hums. I don’t like that it hums.',
  electric: 'Electric? Nobody said anything about electric.',
  twig: 'You are sweeping me up. While I watch.',
  push: 'A bigger broom. For more of me.',
  handvac: 'Must you hoover while I am standing here?',
  shopvac: 'Point that somewhere else. Anywhere else.',
  crate: 'A milk crate. I am being shaved from a milk crate.',
  step: 'Oh, good. Now you can reach my knees.',
  painter: 'That ladder has paint on it. I hope it is paint.',
  fire: 'Is something on fire? Is it me?',
  soda: 'Is that fizzy pop? Strapped to an elf?',
  blower: 'It is very loud. I have enormous ears, you know.',
  jet: 'Elves were never meant to fly. Nor mammoths, but nobody tried.',
  feather: 'Is that a feather? Keep it away from my legs.',
  nosespray: 'I can smell menthol. I do not like where this is going.',
  scratcher: 'What is the little hand for?',
  varnish: 'Red? For me? I could not possibly. What kind of red?',
  tarot: 'Cards. I do not hold with cards.',
  plunger: 'That had better be for the snow.',
  needles: 'Those are very small spears.',
  polish: 'Lambswool. Nobody ever asks the lamb.',
  watch: 'A watch. You will find that I am not suggestible.',
  depil: 'Mammoth strength? Who tried it? On WHOM?',
  lemming: 'Something is climbing my leg. It has very cold feet.',
  lemmings: 'There are more of them. They appear to be organised.',
  plague: 'I am infested. With staff.',
  sack: 'A bigger sack. Planning to take a lot of me, then.',
  suck: 'More suck. Wonderful.',
  tank: 'More fuel. More of you, up here, with me.',
  loyal: 'A loyalty card. For shaving me. I see.',
  foot: 'That poor rabbit.',
  cocoa: 'Is that cocoa? None for me. No. Fine.',
  box: ['Was I in it? Then I don’t care.', 'Was it a hat? I would have liked a hat.'],
  partyhat: 'Is it my birthday? Nobody came to the last four thousand.',
  shades: 'I can’t see what you are doing now. Perfect.',
  pinkdye: 'Why is the vulture laughing? ...Am I pink?',
};

/** How far it has gone. (The hint says so in its own words a moment before.) */
const SO_FAR = {
  0.1: 'Is this going to take all day?',
  0.25: 'It is getting draughty in here.',
  0.5: 'Half an elephant. The wrong half.',
  0.75: 'I can see my own knees. I have knees!',
  0.9: 'Leave me something. One tuft. A dignity tuft.',
};

const SOLD = [
  'That was my hair he just bought. Just so we are clear.',
  'Do I get a cut? Of the money. I have had the other kind.',
  'A toupee. I am going to be somebody’s toupee.',
];
const REGROWN = ['Oh, that is better. ...Why are you still holding those?', 'I’m back. Put the scissors down.'];
const NEW_GAME = ['I had the strangest dream.'];
const BALD = ['I got my wish. I am an elephant. I hate it.'];
const THUD = ['Are you all right? Don’t tell me. I don’t mind either way.', 'That sounded expensive.'];
const PERCHED = ['You are standing on me. We both know you are standing on me.'];
const EYE_LEVEL = ['Oh. Hello. Eye level. I preferred you as a rumour.'];
const FLYING = ['It flies now. Wonderful. It flies.'];
const UNDER = ['Don’t look up.', 'Mind your head. And mine. And everything.', 'It is private under there.'];
const BEHIND = ['I wouldn’t stand there.', 'Nobody good ever stands back there.'];
const PARDON = ['Pardon.', 'That was the wind.', 'Pardon me. No, pardon you.'];
const SNEEZED = ['Bless me.', 'Sorry about your... everything.'];
const DAWDLING = ['Take your time. I have only got the one interglacial.', 'Are we resting? I was not told we were resting.'];
const STOPPED = ['Is that it? Are we done? ...No. Of course not.'];
const WAITING = ['Take a good look. It is the last time I will look like this.', 'Still here. Still woolly. For now.'];

/** Left to himself, with an elf at work on him. Each of these comes round once before any comes again. */
const IDLE = [
  'Is this going to take all day?',
  'I wish I was an elephant. Nobody shaves an elephant.',
  'You missed a bit. I am not saying where.',
  'Could you at least warm the blades?',
  'I had plans today. Standing here, mostly. But still.',
  'Do you do this to everyone, or am I special?',
  'My mother warned me about elves.',
  'A little off the top, I said. A LITTLE.',
  'That tickles. Stop it. No, carry on. No, stop.',
  'Ten thousand years I spent growing that.',
  'There is a draught where there has never been a draught.',
  'Is it cold, or is it you?',
  'Tell me when it is over. Or don’t.',
  'Somewhere, an elephant is laughing.',
];
/** The same, when something in particular is true. */
const IDLE_WHEN = [
  [(c) => c.tool === 'scissors' && c.shorn < 0.3, 'Small scissors. Big mammoth. I admire the optimism.'],
  [(c) => c.motor, 'It buzzes in my tusks.'],
  [(c) => c.sweeping, 'That is me you are sweeping up, you know.'],
  [(c) => c.full, 'Full already? There is so much more of me.'],
  [(c) => c.pink, 'Do I look pink to you? I feel pink.'],
  [(c) => c.hat, 'Is the hat still on? I can feel a hat.'],
  [(c) => c.shades, 'I look magnificent. Nobody tell me otherwise.'],
  [(c) => c.shorn > 0.6, 'I used to be somebody.'],
  [(c) => c.shorn < 0.04 && c.minutes > 4, 'At this rate I shall be extinct first.'],
  [(c) => c.named, 'Nobody has called me Kevin in nine thousand years.'],
  [(c) => c.found > 0, 'I was young. It was the Pleistocene.'],
  [(c) => c.found > 2, 'Stop reading me.'],
  [(c) => c.found > 4, 'In my day a mammoth kept his hide to himself.'],
  [(c) => c.raids > 0, 'Nice boys, the cave men. Dreadful manners. Lovely apologies.'],
  [(c) => c.used > 2, 'I have paid out more this week than in the last ten thousand years.'],
  [(c) => c.help > 0, 'They tickle. All of them. All the time.'],
  [(c) => c.help > 5, 'One of them is in my ear. Hello? Yes. Out.'],
  [(c) => c.help > 20, 'I have more lemmings than hair. This was not the plan.'],
];

// ---- saying it --------------------------------------------------------------

/** How long a line stays up: long enough to read it twice. */
const holdFor = (line) => Math.min(8, Math.max(3.2, 1.6 + line.split(/\s+/).length * 0.42));

export class Says {
  constructor({ mammoth, rig, state, sound, shaving }) {
    Object.assign(this, { mammoth, rig, state, sound, shaving });
    this.el = document.getElementById('says');
    this.note = this.el && this.el.querySelector('.note');
    this.queue = [];               // what he has yet to say: { line, key, wait, age }
    this.now = null;               // what he is saying: { line, left }
    this.quiet = 2.5;              // seconds before he may speak again
    this.idleIn = between(35, 60); // seconds of being worked on before he says something unprompted
    this.spoken = [];              // idle lines used since the last time round
    this.history = [];             // the last things he said, newest last (for the tests, and for anyone curious)
    this.cutAt = mammoth.cutLength;
    this.sinceCut = 0; this.under = 0; this.behind = 0; this.minutes = 0;
    this.wasElf = false; this.greeted = false; this.helloIn = 2.6; this.pinned = false;
    this._v = new THREE.Vector3();
    this.x = 0; this.y = 0; this.w = 0; this.h = 0; this.top = 14; this.tail = ''; this.at = -1;
    this.aside = false;            // the label is to keep off his face (something is happening there: see gags.js)
  }

  /** Lines said once a game are ticked off here, and kept with it. */
  get said() { return this.state.flags.said || (this.state.flags.said = {}); }

  /** Whose words they are. (There is a name under the hair of his forehead.) */
  get name() { return this.state.found.includes('hello') ? 'Kevin' : 'The mammoth'; }

  /**
   * Have him say something when there is a moment. `key`: only once a game. `wait`: seconds to leave first (so that
   * he answers what has just been said about him, and does not talk over it). `first`: ahead of anything waiting.
   */
  say(line, { key = null, wait = 0, first = false } = {}) {
    if (Array.isArray(line)) line = pick(line);
    if (!line || !this.el) return false;
    if (key) { if (this.said[key]) return false; this.said[key] = true; this.state.dirty = true; }
    if (this.queue.some((q) => q.line === line) || (this.now && this.now.line === line)) return false;
    const item = { line, wait, age: 0 };
    if (first) this.queue.unshift(item); else this.queue.push(item);
    if (this.queue.length > 3) this.queue.splice(first ? 3 : 0, 1);       // (he is not going to catch up: something is let go)
    return true;
  }

  /** Something has happened that he may have a view on. */
  heard(what, detail) {
    const s = this.state;
    switch (what) {
      case 'find': this.say(s.found.length <= 1 && detail !== 'hello' ? FOUND_FIRST : FOUND[detail] || FOUND_ANY, { wait: 1.6 }); break;
      case 'bought': if (detail !== 'tonic') this.say(BOUGHT[detail], { wait: 0.8 }); break;
      case 'milestone': this.say(SO_FAR[detail], { key: 'far' + detail, wait: 6.5 }); break;
      case 'sold': if (!this.said.sold || Math.random() < 0.3) { this.said.sold = true; s.dirty = true; this.say(SOLD, { wait: 1 }); } break;
      case 'regrow': for (const k of Object.keys(this.said)) if (k.startsWith('far') || k === 'cut') delete this.said[k]; this.cutAt = 0; this.say(REGROWN, { wait: 1.5, first: true }); break;
      case 'newgame': this.queue.length = 0; this.cutAt = 0; this.say(NEW_GAME, { wait: 1.5 }); break;
      case 'bald': this.say(BALD, { key: 'bald', wait: 1.2, first: true }); break;
      case 'thud': this.say(THUD, { wait: 0.6 }); break;
      case 'perched': this.say(PERCHED, { key: 'perched', wait: 1.5 }); break;
      case 'high': this.say(EYE_LEVEL, { key: 'high', wait: 1 }); break;
      case 'fart': this.say(PARDON, { wait: 0.5, first: true }); this.quiet = Math.min(this.quiet, 0.4); break;
      case 'sneeze': this.say(SNEEZED, { wait: 0.9, first: true }); this.quiet = Math.min(this.quiet, 0.4); break;
      default: break;
    }
  }

  /** Say it now, over whatever he was saying (something has just been done to him: see gags.js). */
  blurt(line) {
    if (!line || !this.el || this.pinned) return;
    this.queue = this.queue.filter((q) => q.line !== line);
    if (this.now && this.now.line === line) { this.now.left = holdFor(line); return; }
    this._show(line);
    this.quiet = 0;
    this.idleIn = Math.max(this.idleIn, between(40, 75));
  }

  /** Put a line up now and leave it there (dev: ?says=...). */
  pin(line) {
    this.pinned = true;
    this._show(line);
    this.now.left = Infinity;
  }

  _show(line) {
    const el = this.el;
    this.now = { line, left: holdFor(line) };
    this.history.push(line);
    if (this.history.length > 40) this.history.shift();
    el.querySelector('.line').textContent = line;
    el.querySelector('.who').textContent = this.name;
    el.hidden = false;
    clearTimeout(this._gone);
    this.w = this.note.offsetWidth; this.h = this.note.offsetHeight;
    // (kept clear of what is written along the top of the screen, and of the edge of a screen that is not square)
    this.keep = [...document.querySelectorAll('#hud .top > .wordmark, #hud .readouts')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const top = document.querySelector('#hud .top');
    this.top = top ? Math.max(14, top.getBoundingClientRect().top) : 14;
    this.note.style.setProperty('--tilt', `${(Math.random() < 0.5 ? -1 : 1) * between(0.6, 1.6)}deg`);
    this.tail = ''; this.at = -1; this.px = this.py = NaN;
    this._place(0, true);
    // (shown on the next frame, so that it grows out of its tail and is not simply there)
    requestAnimationFrame(() => { if (this.now && this.now.line === line) el.classList.add('show'); });
    if (this.sound && this.sound.mutter) this.sound.mutter(Math.min(6, 2 + Math.round(line.split(/\s+/).length / 3)));
  }

  /** Whatever he is saying is taken down now (the game has turned to look at somebody else). */
  hush() { this._hide(); }

  _hide() {
    if (!this.now) return;
    this.now = null;
    this.el.classList.remove('show');
    clearTimeout(this._gone);
    this._gone = setTimeout(() => { if (!this.now) this.el.hidden = true; }, 260);
  }

  /** Where the label goes: by his mouth if that is in the picture, and otherwise at the edge nearest it, pointing. */
  _place(dt, snap = false) {
    const cam = this.rig.camera, W = window.innerWidth, H = window.innerHeight, w = this.w, h = this.h;
    const v = this.mammoth.bone('head').localToWorld(this._v.set(0.62, -0.3, 0)).applyMatrix4(cam.matrixWorldInverse);
    let ax, ay;
    if (v.z > -0.05) {
      // behind the eye: all that can be said is which way it lies
      const l = Math.hypot(v.x, v.y) || 1;
      ax = W / 2 + (v.x / l) * 1e4; ay = H / 2 - (v.y / l) * 1e4;
    } else {
      v.applyMatrix4(cam.projectionMatrix);
      ax = (v.x * 0.5 + 0.5) * W; ay = (0.5 - v.y * 0.5) * H;
    }
    let x, y;
    if (ay < 0 || ay > H) {
      // he is out of the picture, above it (looked up at from his feet) or below: the label keeps to the middle of
      // that edge, clear of what is written in the corners
      x = Math.min(W * 0.7, Math.max(W * 0.3, ax)) - w / 2;
      y = ay < 0 ? this.top : H;
    } else if (ax < 0 || ax > W) {
      // or off to one side: at that side, as high as he is
      x = ax < 0 ? 0 : W;
      y = ay - h / 2;
    } else {
      // up and to one side of him, as in a comic: the side with more room
      const side = ax < W / 2 ? 1 : -1;
      x = ax - w / 2 + side * w * 0.3; y = ay - h - 30;
      if (y < this.top) { x = side > 0 ? ax + 36 : ax - w - 36; y = ay - h * 0.62; }
      if (this.aside) {
        // (his face is what is being looked at: the label goes in front of it, down by his tusks)
        const f = this.mammoth.bone('head').localToWorld(this._v.set(1.6, -0.5, 0)).project(cam), front = (f.x * 0.5 + 0.5) * W >= ax ? 1 : -1;
        x = front > 0 ? ax + 46 : ax - w - 46; y = ay - h * 0.2;
      }
    }
    // (while the picture has bars across its top and bottom, for a scene, the label keeps below the upper one)
    const top = document.body.classList.contains('cine') ? Math.max(this.top, H * 0.11 + 10) : this.top;
    x = Math.min(W - w - 14, Math.max(14, x));
    y = Math.min(H * 0.6 - h, Math.max(top, y));
    for (const r of this.keep || []) if (x < r.right + 10 && x + w > r.left - 10 && y < r.bottom + 10) y = r.bottom + 10;
    const k = snap ? 1 : 1 - Math.exp(-dt * 12);
    this.x += (x - this.x) * k; this.y += (y - this.y) * k;
    const px = Math.round(this.x), py = Math.round(this.y);
    // the tail: on the edge that faces him, as near to him along it as it can be
    const dx = ax - (px + w / 2), dy = ay - (py + h / 2);
    const upright = Math.abs(dy) / h > (Math.abs(dx) / w) * (this.tail === 'down' || this.tail === 'up' ? 0.85 : 1.18);
    const tail = upright ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left';
    const at = Math.round(upright ? Math.min(w - 28, Math.max(28, ax - px)) : Math.min(h - 20, Math.max(20, ay - py)));
    if (px !== this.px || py !== this.py) { this.px = px; this.py = py; this.el.style.transform = `translate3d(${px}px, ${py}px, 0)`; }
    if (tail !== this.tail) { this.tail = tail; this.el.dataset.tail = tail; }
    if (at !== this.at) {
      this.at = at;
      this.el.style.setProperty('--at', `${at}px`);
      // (it grows out of where its tail is)
      this.note.style.setProperty('--ox', upright ? `${at}px` : dx > 0 ? '100%' : '0%');
      this.note.style.setProperty('--oy', upright ? (dy > 0 ? '100%' : '0%') : `${at}px`);
    }
  }

  /** Something for him to say unprompted, as things stand. */
  _idle() {
    const s = this.state, tool = this.shaving ? this.shaving.tool : null;
    const c = {
      tool: tool ? tool.id : '', motor: !!(tool && tool.def.motor), sweeping: !!(tool && tool.def.sweep), full: s.hair > 0 && s.room <= 0,
      pink: !!s.flags.pink, hat: s.worn.includes('partyhat'), shades: s.worn.includes('shades'),
      shorn: this.mammoth.shorn, minutes: this.minutes, named: s.found.includes('hello'), found: s.found.length, help: s.helpers || 0, raids: s.stats.raids || 0, used: (s.used || []).length,
    };
    const fits = IDLE_WHEN.filter(([when, line]) => when(c) && !this.spoken.includes(line)).map((e) => e[1]);
    let from = IDLE.filter((line) => !this.spoken.includes(line));
    if (!from.length) { this.spoken = []; from = IDLE; }
    const line = fits.length && Math.random() < 0.5 ? pick(fits) : pick(from);
    this.spoken.push(line);
    return line;
  }

  /**
   * Every frame. `elf`: the shaving is under way. `busy`: a shop is open, a scene is playing or the game is otherwise
   * saying something of its own, and he holds his tongue. `seen`: what is laid over the scene is showing at all.
   */
  update(dt, { elf, busy, seen = true }) {
    if (!this.el) return;
    const s = this.state, rig = this.rig;
    if (this.pinned) { this._place(dt, true); return; }
    if (busy || !seen) { if (this.now) this._hide(); for (const q of this.queue) q.age += dt * 0.25; return; }

    // ---- what he notices for himself ----
    if (!this.greeted) {
      this.helloIn -= dt;
      if (this.helloIn <= 0) {
        this.greeted = true;
        const begun = this.mammoth.shorn > 0.004 || s.stats.picked > 0;
        if (!elf) this.say(this.mammoth.shorn > 0.97 ? AGAIN_BALD : begun ? AGAIN : HELLO);
      }
    }
    const cut = this.mammoth.cutLength;
    if (cut > this.cutAt + 1e-6) {
      this.sinceCut = 0;
      if (elf && this.cutAt === 0 && this.mammoth.shorn < 0.02) this.say(FIRST_CUT, { key: 'cut', wait: 0.7, first: true });
    }
    this.cutAt = cut;
    if (elf) {
      this.minutes += dt / 60; this.sinceCut += dt;
      const onSnow = rig.height < 0.4;
      this.under = onSnow && rig.pos.x > -1.1 && rig.pos.x < 0.85 && Math.abs(rig.pos.z) < 0.45 ? this.under + dt : 0;
      this.behind = onSnow && rig.pos.x < -1.9 && rig.pos.x > -4 && Math.abs(rig.pos.z) < 1.2 ? this.behind + dt : 0;
      if (this.under > 7) { this.under = -60; this.say(UNDER); }
      if (this.behind > 5) { this.behind = -90; this.say(BEHIND); }
      if (rig.thrusting && rig.height > 0.6) this.say(FLYING, { key: 'flew', wait: 1 });
      if (this.sinceCut > 75 && this.mammoth.shorn > 0.002 && this.mammoth.shorn < 0.97) { this.sinceCut = -60; this.say(DAWDLING); }
    } else if (this.wasElf && this.greeted && this.mammoth.shorn > 0.01 && this.mammoth.shorn < 0.97 && Math.random() < 0.4) {
      this.say(STOPPED, { wait: 1.4 });
    }
    this.wasElf = elf;

    // ---- saying it ----
    this.quiet = Math.max(0, this.quiet - dt);
    if (this.now) {
      this.now.left -= dt;
      if (this.now.left <= 0) { this._hide(); this.quiet = 4; } else this._place(dt);
      return;
    }
    for (const q of this.queue) { q.wait -= dt; q.age += dt; }
    while (this.queue.length && this.queue[0].age > 40) this.queue.shift();      // (the moment has passed)
    // the first thing waiting whose moment has come (something told to wait does not hold up what was said after it)
    const next = this.quiet <= 0 ? this.queue.findIndex((q) => q.wait <= 0) : -1;
    if (next >= 0) {
      this._show(this.queue.splice(next, 1)[0].line);
      this.idleIn = Math.max(this.idleIn, between(40, 75));
      return;
    }
    // left to himself: once a minute or so while he is being worked on, and much more seldom when only looked at
    this.idleIn -= elf ? dt : dt * 0.35;
    if (this.idleIn <= 0 && !this.queue.length && this.greeted) {
      this.idleIn = between(50, 105);
      if (elf) this.say(this._idle());
      else if (this.mammoth.shorn < 0.97) this.say(WAITING);
    }
  }
}
