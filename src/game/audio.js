// Sound, made from scratch with the Web Audio API: the scrape and clack of
// blades, the crunch of hair being cut, boots in snow, and the wind. There are
// no recordings; every sound is shaped from noise and a few tones.
//
// Each tool has its own voice: heavy clippers with wooden handles that knock,
// sprung shears that ring, and small bad scissors that tick and squeak. The
// electric ones run for as long as they are held: a motor's hum, the clatter
// of the cutter in step with it, and a note that sags when the work is heavy.

const VOICES = {
  garden: {
    slide: [2600, 5600, 0.05], hiss: 0.018,                                      // blades sliding over each other: band swept from-to, level
    ring: [[1870, 0.05, 0.09], [3140, 0.035, 0.07], [4760, 0.02, 0.05], [7300, 0.01, 0.03]],   // the steel rings: pitch, level, decay
    click: [2400, 0.16],                                                         // the snap as the blades meet
    knock: [210, 130, 0.09, 0.045],                                              // wooden handles knock together
    release: [4200, 2400, 0.022, 0.07],
    cutFloor: 0, cutGain: 1,
  },
  sheep: {
    slide: [3000, 6800, 0.045], hiss: 0.02,
    ring: [[1180, 0.06, 0.2], [2650, 0.045, 0.15], [4100, 0.028, 0.1], [6900, 0.012, 0.05]],   // one piece of spring steel: it sings
    click: [3000, 0.12],
    knock: [360, 250, 0.03, 0.03],
    release: [3600, 5200, 0.016, 0.03],
    twang: [640, 1050, 0.022, 0.07],                                             // the bow throwing the blades open
    cutFloor: 0.1, cutGain: 0.9,
  },
  scissors: {
    slide: [5200, 8200, 0.02], hiss: 0.008,
    ring: [[4200, 0.02, 0.03], [6800, 0.012, 0.025]],                            // thin metal, hardly a ring at all
    click: [3500, 0.06],
    knock: [900, 700, 0.025, 0.02],                                              // plastic handles tick together
    release: [5000, 3600, 0.01, 0.09],
    squeak: 0.6,                                                                 // a dry rivet complains as they open, more often than not
    rattle: true,
    cutFloor: 0.22, cutGain: 0.7,
  },
};

// The electric tools. hum: strokes of the cutter a second, and the shape of
// the wave; body: where the hum is cut off above, and how loud it is; clatter:
// the band the cutter rattles in, how sharply tuned, how loud; sag: how far
// the note drops under a full load; whine: the motor's own note above it all.
const MOTORS = {
  electric: { hum: 92, wave: 'sawtooth', body: [1400, 0.05], clatter: [2100, 0.8, 0.05], sag: 0.16, whine: [1240, 0.006] },
  shaver: { hum: 168, wave: 'square', body: [2600, 0.011], clatter: [4300, 1.6, 0.012], sag: 0.34, whine: [3350, 0.0035] },
  // the vacuums: mostly rushing air, over a motor
  handvac: { hum: 236, wave: 'sawtooth', body: [2400, 0.009], clatter: [3100, 0.35, 0.05], sag: 0.1, whine: [2950, 0.006] },
  shopvac: { hum: 118, wave: 'sawtooth', body: [900, 0.022], clatter: [1300, 0.3, 0.11], sag: 0.08, whine: [1420, 0.005] },
  // the packs: two bottles of pop letting go, two leaf blowers, and something that should not be sold to elves
  soda: { hum: 46, wave: 'triangle', body: [320, 0.006], clatter: [6400, 0.22, 0.2], sag: 0, whine: [880, 0.0008] },
  blower: { hum: 134, wave: 'sawtooth', body: [1150, 0.04], clatter: [1750, 0.4, 0.15], sag: 0, whine: [1980, 0.006] },
  jet: { hum: 61, wave: 'sawtooth', body: [520, 0.06], clatter: [760, 0.28, 0.34], sag: 0, whine: [2700, 0.005] },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.gust = 0;
    this.motors = {};
  }

  /** Browsers only allow sound after a click or key press: call this from one. */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    // a gentle limiter, so a burst of snips never clips
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
    this.master.connect(comp); comp.connect(ctx.destination);

    // two seconds of white noise, and a crackle (sparse sharp grains) for hair
    const n = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.crackle = ctx.createBuffer(1, n, ctx.sampleRate);
    const c = this.crackle.getChannelData(0);
    let level = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.012) level = 0.5 + Math.random() * 0.5;   // a fibre gives way
      c[i] = (Math.random() * 2 - 1) * level;
      level *= 0.985;
    }

    // wind: filtered noise that swells with the gusts
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 420; band.Q.value = 0.45;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 1500;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.0;
    this.windBand = band;
    src.connect(band); band.connect(low); low.connect(this.windGain); this.windGain.connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  /** A burst of noise through a filter, with an attack-decay envelope. */
  _noise({ buffer = this.noise, type = 'bandpass', freq = 2000, freqTo = null, q = 1, gain = 0.1, attack = 0.004, hold = 0.02, decay = 0.05, when = 0, rate = 1 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + attack + hold + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + hold + decay + 0.02);
  }

  /** A decaying tone; `wobble` (Hz) makes it waver. */
  _tone({ freq, freqTo = null, gain = 0.05, decay = 0.08, type = 'sine', when = 0, wobble = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(freqTo, t + decay);
    if (wobble) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = wobble; depth.gain.value = freq * 0.04;
      lfo.connect(depth); depth.connect(o.frequency);
      lfo.start(t); lfo.stop(t + decay + 0.02);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + decay + 0.02);
  }

  /** A note on something like a horn: two saws a hair apart, through a filter that opens as it speaks. `fall` (semitones) lets it sag away after `fallAt`. */
  _horn({ freq, when = 0, length = 0.3, gain = 0.05, bright = 2600, fall = 0, fallAt = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.1;
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(bright, t + 0.05);
    f.frequency.exponentialRampToValueAtTime(fall ? 380 : bright * 0.5, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.022);
    g.gain.setValueAtTime(gain * 0.85, t + Math.max(0.03, length - 0.09));
    g.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.14);
    for (const detune of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = detune;
      o.frequency.setValueAtTime(freq, t);
      if (fall) { o.frequency.setValueAtTime(freq, t + fallAt); o.frequency.exponentialRampToValueAtTime(freq * Math.pow(2, -fall / 12), t + length); }
      o.connect(f); o.start(t); o.stop(t + length + 0.18);
    }
    f.connect(g); g.connect(this.master);
  }

  /**
   * Something has been won. 'grand': four notes climbing to a chord that is
   * held, with a drum under it and bells over it. 'droop': the same, until
   * the chord thinks about what it is celebrating.
   */
  fanfare(kind = 'grand') {
    if (!this.ctx) return;
    const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
    [G4, C5, E5, G5].forEach((f, i) => this._horn({ freq: f, when: i * 0.17, length: 0.13, gain: 0.045 }));
    const at = 0.68, droop = kind === 'droop';
    for (const [f, gain] of [[C5, 0.04], [E5, 0.034], [G5, 0.034], [C6, 0.03], [C5 / 2, 0.035]]) {
      this._horn({ freq: f, when: at, length: droop ? 1.5 : 1.7, gain, bright: 3000, fall: droop ? 8 : 0, fallAt: 0.42 });
    }
    // the drum
    this._tone({ freq: 110, freqTo: 55, gain: 0.16, decay: 0.5, when: at });
    this._noise({ type: 'lowpass', freq: 500, q: 0.6, gain: 0.08, attack: 0.002, hold: 0.02, decay: 0.3, when: at });
    if (droop) {
      // ...and the last of the air going out of it
      this._tone({ freq: 196, freqTo: 82, gain: 0.07, decay: 0.7, type: 'triangle', when: at + 1.45, wobble: 7 });
      return;
    }
    // bells
    [C6, 1318.5, 1568, 2093, 1568, 2093, 2637].forEach((f, i) => this._tone({ freq: f, gain: 0.022, decay: 0.5, when: at + 0.12 + i * 0.085 }));
    this._noise({ type: 'highpass', freq: 6000, q: 0.5, gain: 0.012, attack: 0.02, hold: 0.25, decay: 0.9, when: at });
  }

  /** The blades sliding across each other as they close. */
  slide(voice = 'garden', seconds = 0.09) {
    if (!this.ctx) return;
    const v = VOICES[voice] || VOICES.garden;
    this._noise({ freq: v.slide[0], freqTo: v.slide[1], q: 1.4, gain: v.slide[2], attack: 0.008, hold: Math.max(0.01, seconds - 0.03), decay: 0.03 });
    this._noise({ type: 'highpass', freq: 7000, q: 0.7, gain: v.hiss, attack: 0.008, hold: Math.max(0.01, seconds - 0.03), decay: 0.03 });
  }

  /** The blades meet and the handles stop. */
  clack(voice = 'garden', strength = 1) {
    if (!this.ctx) return;
    const v = VOICES[voice] || VOICES.garden;
    const k = 0.6 + 0.4 * strength;
    this._noise({ type: 'highpass', freq: v.click[0], q: 0.7, gain: v.click[1] * k, attack: 0.001, hold: 0.003, decay: 0.012 });
    // steel rings briefly, at tones that are not in tune with each other
    const detune = 0.97 + Math.random() * 0.06;
    for (const [freq, gain, decay] of v.ring) this._tone({ freq: freq * detune, gain: gain * k, decay });
    this._tone({ freq: v.knock[0], freqTo: v.knock[1], gain: v.knock[2] * k, decay: v.knock[3], type: 'triangle' });
    // loose blades chatter for a moment afterwards
    if (v.rattle) for (let i = 1; i <= 3; i++) this._noise({ type: 'highpass', freq: 3800, q: 0.7, gain: 0.03 / i, attack: 0.001, hold: 0.002, decay: 0.008, when: 0.018 * i + Math.random() * 0.006 });
  }

  /** The handles opening again. */
  release(voice = 'garden') {
    if (!this.ctx) return;
    const v = VOICES[voice] || VOICES.garden;
    this._noise({ freq: v.release[0], freqTo: v.release[1], q: 1.2, gain: v.release[2], attack: 0.01, hold: v.release[3], decay: 0.05 });
    if (v.twang) this._tone({ freq: v.twang[0], freqTo: v.twang[1], gain: v.twang[2], decay: v.twang[3], type: 'triangle' });
    if (v.squeak && Math.random() < v.squeak) {
      const f = 1900 + Math.random() * 500;
      this._tone({ freq: f, freqTo: f * 1.35, gain: 0.012, decay: 0.11, wobble: 38, when: 0.02 });
    }
  }

  /** Poor blades sticking part way through a stroke. */
  stick(voice = 'scissors') {
    if (!this.ctx) return;
    this._noise({ type: 'lowpass', freq: 1300, q: 0.8, gain: 0.07, attack: 0.002, hold: 0.008, decay: 0.03 });
    this._tone({ freq: 620, freqTo: 480, gain: 0.03, decay: 0.04, type: 'triangle' });
    void voice;
  }

  /** A broom drawn across the snow, or a handful of hair grabbed. */
  swish(voice = 'broom') {
    if (!this.ctx) return;
    if (voice === 'hands') this._noise({ buffer: this.crackle, freq: 2600, q: 0.8, gain: 0.05, attack: 0.01, hold: 0.04, decay: 0.08 });
    else this._noise({ freq: 2200, freqTo: 900, q: 0.9, gain: 0.07, attack: 0.03, hold: 0.12, decay: 0.16 });
  }

  /** A piece of hair arrives up a nozzle. */
  pop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - (this._popped || 0) < 0.04) return;      // (not every one: they come in handfuls)
    this._popped = t;
    this._noise({ type: 'lowpass', freq: 700 + Math.random() * 500, q: 1.2, gain: 0.05, attack: 0.002, hold: 0.004, decay: 0.03 });
  }

  /** Gold changing hands: n coins, one after another. */
  coin(n = 1) {
    if (!this.ctx) return;
    for (let i = 0; i < n; i++) {
      const when = i * 0.07 + Math.random() * 0.02, f = 2100 + Math.random() * 500;
      this._tone({ freq: f, gain: 0.035, decay: 0.22, when });
      this._tone({ freq: f * 1.51, gain: 0.02, decay: 0.16, when });
      this._noise({ type: 'highpass', freq: 5000, q: 0.7, gain: 0.02, attack: 0.001, hold: 0.002, decay: 0.01, when });
    }
  }

  /** A word from one of the traders (nobody here speaks anything you would know), or a flat "no". */
  blip(who = 'gnome') {
    if (!this.ctx) return;
    if (who === 'no') { this._tone({ freq: 180, freqTo: 120, gain: 0.05, decay: 0.18, type: 'square' }); return; }
    const base = who === 'vulture' ? 150 : 330, n = who === 'vulture' ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const f = base * (0.8 + Math.random() * 0.7);
      this._tone({ freq: f, freqTo: f * (0.8 + Math.random() * 0.5), gain: 0.035, decay: who === 'vulture' ? 0.16 : 0.07, type: who === 'vulture' ? 'sawtooth' : 'triangle', when: i * (who === 'vulture' ? 0.15 : 0.075), wobble: who === 'vulture' ? 28 : 0 });
    }
  }

  /** The switch of an electric tool, thumbed on or off. */
  switch(voice, on) {
    if (!this.ctx) return;
    this._noise({ type: 'highpass', freq: on ? 2600 : 2100, q: 0.7, gain: 0.05, attack: 0.001, hold: 0.002, decay: 0.012 });
    this._tone({ freq: on ? 340 : 260, freqTo: on ? 250 : 190, gain: 0.02, decay: 0.03, type: 'triangle' });
    void voice;
  }

  /** The parts of one running motor, made the first time it is switched on. They play on, silent, between uses. */
  _makeMotor(def) {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(this.master);
    // the hum: the cutter's strokes, and the same an octave up
    const osc = ctx.createOscillator(); osc.type = def.wave; osc.frequency.value = def.hum * 0.3;
    const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.value = def.hum * 0.6;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = def.body[0]; low.Q.value = 0.6;
    const humGain = ctx.createGain(); humGain.gain.value = def.body[1];
    const hum2 = ctx.createGain(); hum2.gain.value = def.body[1] * 0.45;
    osc.connect(low); low.connect(humGain); humGain.connect(out);
    osc2.connect(hum2); hum2.connect(out);
    // the clatter: noise in a band, let through in step with the strokes
    const noise = ctx.createBufferSource(); noise.buffer = this.noise; noise.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = def.clatter[0]; band.Q.value = def.clatter[1];
    const gate = ctx.createGain(); gate.gain.value = 0.55;
    const beat = ctx.createOscillator(); beat.type = 'square'; beat.frequency.value = def.hum * 0.3;
    const depth = ctx.createGain(); depth.gain.value = 0.45;
    beat.connect(depth); depth.connect(gate.gain);
    const clatter = ctx.createGain(); clatter.gain.value = def.clatter[2];
    noise.connect(band); band.connect(gate); gate.connect(clatter); clatter.connect(out);
    // the motor's own whine
    const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = def.whine[0] * 0.3;
    const whineGain = ctx.createGain(); whineGain.gain.value = def.whine[1];
    whine.connect(whineGain); whineGain.connect(out);
    // hair going through the cutter
    const hair = ctx.createBufferSource(); hair.buffer = this.crackle; hair.loop = true;
    const hairBand = ctx.createBiquadFilter(); hairBand.type = 'bandpass'; hairBand.frequency.value = 3400; hairBand.Q.value = 0.6;
    const hairGain = ctx.createGain(); hairGain.gain.value = 0;
    hair.connect(hairBand); hairBand.connect(hairGain); hairGain.connect(this.master);
    for (const n of [osc, osc2, beat, whine]) n.start();
    noise.start(0, Math.random()); hair.start(0, Math.random());
    return { out, osc, osc2, beat, whine, clatter, hairGain };
  }

  /**
   * An electric tool's motor. Call every frame with how fast it is turning
   * (0..1), how hard it is working (0..1) and how many locks a second are
   * going through it.
   */
  motor(voice, power, load = 0, cutting = 0) {
    if (!this.ctx) return;
    const def = MOTORS[voice];
    if (!def) return;
    let m = this.motors[voice];
    if (!m) {
      if (power < 0.002) return;
      m = this.motors[voice] = this._makeMotor(def);
    }
    const t = this.ctx.currentTime;
    // the note climbs as the motor comes up to speed, and sags under load
    const speed = (0.3 + 0.7 * power) * (1 - def.sag * load);
    m.osc.frequency.setTargetAtTime(def.hum * speed, t, 0.02);
    m.osc2.frequency.setTargetAtTime(def.hum * 2.01 * speed, t, 0.02);
    m.beat.frequency.setTargetAtTime(def.hum * speed, t, 0.02);
    m.whine.frequency.setTargetAtTime(def.whine[0] * speed, t, 0.02);
    m.out.gain.setTargetAtTime(power < 0.002 ? 0 : Math.min(1, power * 1.15) * (1 + 0.35 * load), t, 0.025);
    m.clatter.gain.setTargetAtTime(def.clatter[2] * (1 + 1.4 * load), t, 0.03);
    m.hairGain.gain.setTargetAtTime(power * Math.min(0.16, 0.02 * Math.sqrt(cutting)), t, 0.04);
  }

  // ---- the mammoth himself ----

  /** A long low sound from somewhere inside him. */
  rumble() {
    if (!this.ctx) return;
    const f = 42 + Math.random() * 14;
    this._tone({ freq: f, freqTo: f * 0.8, gain: 0.2, decay: 1.5, type: 'sine', wobble: 3 + Math.random() * 3 });
    this._tone({ freq: f * 2.02, freqTo: f * 1.5, gain: 0.06, decay: 1.1, type: 'triangle', wobble: 5 });
    this._noise({ type: 'lowpass', freq: 220, q: 0.7, gain: 0.07, attack: 0.15, hold: 0.5, decay: 0.7 });
  }

  /** What it sounds like. `big` for the ones he has been saving. */
  fart(big = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, long = big ? 1.5 + Math.random() * 0.6 : 0.5 + Math.random() * 0.4;
    const f0 = big ? 62 : 84 + Math.random() * 20;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.25, t + long * 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + long);
    // the flutter is the whole of the character
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(big ? 21 : 31, t); lfo.frequency.linearRampToValueAtTime(big ? 12 : 22, t + long);
    const depth = ctx.createGain(); depth.gain.value = 0.5;
    const trem = ctx.createGain(); trem.gain.value = 0.5;
    lfo.connect(depth); depth.connect(trem.gain);
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.setValueAtTime(900, t); low.frequency.exponentialRampToValueAtTime(260, t + long); low.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(big ? 0.3 : 0.2, t + 0.03);
    g.gain.setValueAtTime(big ? 0.3 : 0.2, t + long * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + long);
    o.connect(trem); trem.connect(low); low.connect(g); g.connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + long + 0.05); lfo.stop(t + long + 0.05);
    this._noise({ type: 'bandpass', freq: 700, freqTo: 300, q: 0.8, gain: 0.05, attack: 0.02, hold: long * 0.5, decay: long * 0.4 });
  }

  /** He trumpets: one rising note with a rasp in it. */
  trumpet() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, long = 1.1;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.setValueAtTime(700, t); band.frequency.linearRampToValueAtTime(1500, t + 0.35); band.frequency.linearRampToValueAtTime(900, t + long); band.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
    g.gain.setValueAtTime(0.22, t + long * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + long);
    for (const [mult, type] of [[1, 'sawtooth'], [1.505, 'square'], [2.01, 'sawtooth']]) {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(230 * mult, t);
      o.frequency.exponentialRampToValueAtTime(470 * mult, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(390 * mult, t + long);
      const lfo = ctx.createOscillator(), d = ctx.createGain();
      lfo.frequency.value = 27; d.gain.value = 22 * mult;
      lfo.connect(d); d.connect(o.frequency);
      o.connect(band); o.start(t); lfo.start(t); o.stop(t + long + 0.05); lfo.stop(t + long + 0.05);
    }
    band.connect(g); g.connect(this.master);
    this._noise({ type: 'bandpass', freq: 1300, q: 0.9, gain: 0.05, attack: 0.05, hold: 0.5, decay: 0.4 });
  }

  /** A sneeze the size of a weather system. */
  sneeze() {
    if (!this.ctx) return;
    this._noise({ type: 'bandpass', freq: 500, freqTo: 1600, q: 1.2, gain: 0.06, attack: 0.5, hold: 0.05, decay: 0.05 });           // the breath going in
    this._noise({ type: 'bandpass', freq: 2200, freqTo: 500, q: 0.5, gain: 0.34, attack: 0.012, hold: 0.09, decay: 0.55, when: 0.72 });
    this._tone({ freq: 190, freqTo: 70, gain: 0.2, decay: 0.45, type: 'sawtooth', when: 0.72 });
  }

  /** A foot on a rung. */
  rung() {
    if (!this.ctx) return;
    const f = 300 + Math.random() * 80;
    this._tone({ freq: f, freqTo: f * 0.7, gain: 0.05, decay: 0.06, type: 'triangle' });
    this._noise({ type: 'bandpass', freq: 1100, q: 1.2, gain: 0.04, attack: 0.002, hold: 0.008, decay: 0.04 });
  }

  /** A ladder being stood up, walked sideways a hop, or put away: wood (or tin) knocking on itself. */
  clatter(n = 3) {
    if (!this.ctx) return;
    for (let i = 0; i < n; i++) {
      const when = i * (0.05 + Math.random() * 0.03), f = 240 + Math.random() * 260;
      this._tone({ freq: f, freqTo: f * 0.6, gain: 0.06, decay: 0.07, type: 'triangle', when });
      this._noise({ type: 'bandpass', freq: 1500 + Math.random() * 900, q: 0.9, gain: 0.05, attack: 0.002, hold: 0.01, decay: 0.05, when });
    }
  }

  /** Coming down: on his feet, or not. */
  thud(hard = false) {
    if (!this.ctx) return;
    this._tone({ freq: hard ? 95 : 130, freqTo: 45, gain: hard ? 0.22 : 0.09, decay: hard ? 0.3 : 0.14 });
    this._noise({ type: 'lowpass', freq: hard ? 900 : 1400, q: 0.5, gain: hard ? 0.14 : 0.07, attack: 0.004, hold: 0.03, decay: hard ? 0.22 : 0.12 });
    if (hard) this._noise({ buffer: this.crackle, freq: 2400, q: 1.6, gain: 0.07, attack: 0.01, hold: 0.05, decay: 0.2 });
  }

  /** Hair parting under the blades; amount is the number of locks cut. */
  cut(amount, voice = 'garden') {
    if (!this.ctx || amount <= 0) return;
    const vo = VOICES[voice] || VOICES.garden;
    const v = Math.max(vo.cutFloor, Math.min(1, Math.sqrt(amount / 160))) * vo.cutGain;
    this._noise({ buffer: this.crackle, type: 'bandpass', freq: 3200, q: 0.6, gain: 0.34 * v, attack: 0.003, hold: 0.03 + 0.04 * v, decay: 0.06, rate: 0.9 + Math.random() * 0.3 });
    this._noise({ type: 'bandpass', freq: 1500, q: 0.8, gain: 0.07 * v, attack: 0.004, hold: 0.03, decay: 0.07 });
  }

  /** A foot coming down in snow. */
  step(run = false) {
    if (!this.ctx) return;
    const v = run ? 1 : 0.7;
    this._noise({ type: 'lowpass', freq: 1300 + Math.random() * 400, q: 0.5, gain: 0.07 * v, attack: 0.012, hold: 0.035, decay: 0.11 });
    this._noise({ buffer: this.crackle, freq: 2300 + Math.random() * 500, q: 2.2, gain: 0.05 * v, attack: 0.02, hold: 0.03, decay: 0.07 });
  }

  /** Keep the wind in step with the gusts on screen (0..1). */
  setWind(gust) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.012 + 0.03 * gust, t, 0.4);
    this.windBand.frequency.setTargetAtTime(360 + 260 * gust, t, 0.5);
  }
}
