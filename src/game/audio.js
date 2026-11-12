// Sound, made from scratch with the Web Audio API: the scrape and clack of the
// shears, the crunch of hair being cut, boots in snow, and the wind. There are
// no recordings; every sound is shaped from noise and a few tones.
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

  /** A decaying tone. */
  _tone({ freq, freqTo = null, gain = 0.05, decay = 0.08, type = 'sine', when = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(freqTo, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + decay + 0.02);
  }

  /** The blades sliding across each other as they close. */
  slide(seconds = 0.09) {
    if (!this.ctx) return;
    this._noise({ freq: 2600, freqTo: 5600, q: 1.4, gain: 0.05, attack: 0.008, hold: Math.max(0.01, seconds - 0.03), decay: 0.03 });
    this._noise({ type: 'highpass', freq: 7000, q: 0.7, gain: 0.018, attack: 0.008, hold: Math.max(0.01, seconds - 0.03), decay: 0.03 });
  }

  /** The blades meet and the handles stop. */
  clack(strength = 1) {
    if (!this.ctx) return;
    const v = 0.6 + 0.4 * strength;
    this._noise({ type: 'highpass', freq: 2400, q: 0.7, gain: 0.16 * v, attack: 0.001, hold: 0.003, decay: 0.012 });
    // steel rings briefly, at tones that are not in tune with each other
    const detune = 0.97 + Math.random() * 0.06;
    this._tone({ freq: 1870 * detune, gain: 0.05 * v, decay: 0.09 });
    this._tone({ freq: 3140 * detune, gain: 0.035 * v, decay: 0.07 });
    this._tone({ freq: 4760 * detune, gain: 0.02 * v, decay: 0.05 });
    this._tone({ freq: 7300 * detune, gain: 0.01 * v, decay: 0.03 });
    // wooden handles knock
    this._tone({ freq: 210, freqTo: 130, gain: 0.09 * v, decay: 0.045, type: 'triangle' });
  }

  /** The handles opening again. */
  release() {
    if (!this.ctx) return;
    this._noise({ freq: 4200, freqTo: 2400, q: 1.2, gain: 0.022, attack: 0.01, hold: 0.07, decay: 0.05 });
  }

  /** Hair parting under the blades; amount is the number of locks cut. */
  cut(amount) {
    if (!this.ctx || amount <= 0) return;
    const v = Math.min(1, Math.sqrt(amount / 160));
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
