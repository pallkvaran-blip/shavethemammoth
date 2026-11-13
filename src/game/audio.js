// Sound, made from scratch with the Web Audio API: the scrape and clack of
// blades, the crunch of hair being cut, boots in snow, and the wind. There are
// no recordings; every sound is shaped from noise and a few tones.
//
// Each tool has its own voice: heavy clippers with wooden handles that knock,
// sprung shears that ring, and small bad scissors that tick and squeak.

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

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.gust = 0;
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
