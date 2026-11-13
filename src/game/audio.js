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
