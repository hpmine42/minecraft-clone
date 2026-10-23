// audio.js — Procedural sounds with WebAudio (no audio files).
// Must be initialized after a user gesture (click/touch).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.enabled = true;
    this.noiseBuffer = null;
    this._lastStep = 0;
    this._ambientNodes = null;
  }

  /** Must be called from a user event (mobile requirement). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // Noise buffer (1 second of white noise)
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Short filtered noise burst. */
  _noiseBurst(duration, filterFreq, gain = 0.3, type = 'lowpass', q = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, duration + 0.05);
    src.stop(t + duration + 0.05);
  }

  /** Tone with an envelope. */
  _tone(freq, duration, gain = 0.2, type = 'sine', slideTo = null, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this._now() + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // ---- Game sounds -------------------------------------------------------
  dig(material = 'grass') {
    const presets = {
      grass: [420, 0.12, 0.22],
      dirt: [380, 0.12, 0.22],
      stone: [240, 0.1, 0.3],
      wood: [300, 0.11, 0.26],
      sand: [520, 0.1, 0.2],
      glass: [900, 0.08, 0.22],
      wool: [300, 0.09, 0.16],
    };
    const [f, d, g] = presets[material] || presets.dirt;
    this._noiseBurst(d, f, g);
    this._tone(f * 0.6, d * 0.8, g * 0.4, 'triangle');
  }

  place(material = 'stone') {
    this.dig(material);
    this._tone(180, 0.07, 0.16, 'square', 120);
  }

  step(material = 'grass') {
    const now = performance.now();
    if (now - this._lastStep < 280) return;
    this._lastStep = now;
    const presets = { grass: 500, dirt: 420, stone: 320, wood: 380, sand: 620, water: 900, snow: 700 };
    this._noiseBurst(0.06, presets[material] || 450, 0.1);
  }

  jump() {
    this._tone(320, 0.12, 0.12, 'sine', 420);
    this._noiseBurst(0.06, 600, 0.06);
  }

  land() {
    this._noiseBurst(0.1, 300, 0.2);
    this._tone(140, 0.1, 0.12, 'triangle', 90);
  }

  hurt() {
    this._tone(220, 0.18, 0.28, 'sawtooth', 130);
    this._noiseBurst(0.12, 800, 0.14, 'highpass');
  }

  eat() {
    for (let i = 0; i < 3; i++) {
      this._noiseBurst(0.07, 700 + i * 200, 0.16);
      this._tone(180 + i * 40, 0.06, 0.08, 'triangle', 120, i * 0.09);
    }
  }

  splash() {
    this._noiseBurst(0.25, 900, 0.26, 'highpass');
    this._tone(500, 0.18, 0.1, 'sine', 220);
  }

  pickup() {
    this._tone(620, 0.09, 0.16, 'sine', 880);
    this._tone(880, 0.1, 0.12, 'sine', 1100, 0.07);
  }

  craft() {
    this._tone(440, 0.1, 0.15, 'triangle', 620);
    this._tone(620, 0.12, 0.13, 'triangle', 840, 0.09);
    this._tone(840, 0.16, 0.11, 'triangle', 990, 0.18);
  }

  levelUp() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this._tone(n, 0.22, 0.14, 'triangle', null, i * 0.11));
  }

  explode() {
    this._noiseBurst(0.5, 220, 0.4);
    this._tone(90, 0.5, 0.3, 'sawtooth', 40);
  }

  // ---- Mobs ---------------------------------------------------------------
  zombie() {
    this._tone(95 + Math.random() * 25, 0.5, 0.18, 'sawtooth', 70);
    this._tone(140, 0.35, 0.1, 'square', 90);
  }

  pig() {
    this._tone(300, 0.12, 0.2, 'sawtooth', 220);
    this._tone(340, 0.14, 0.16, 'sawtooth', 260, 0.12);
    this._noiseBurst(0.1, 500, 0.1);
  }

  cow() {
    this._tone(180, 0.55, 0.2, 'sawtooth', 140);
    this._tone(240, 0.5, 0.1, 'triangle', 180);
  }

  sheep() {
    this._tone(280, 0.35, 0.18, 'sawtooth', 320);
    this._tone(280, 0.35, 0.12, 'sawtooth', 240, 0.25);
  }

  chicken() {
    for (let i = 0; i < 3; i++) {
      this._tone(720 + Math.random() * 180, 0.07, 0.12, 'square', 560, i * 0.09);
    }
    this._noiseBurst(0.08, 1200, 0.06, 'highpass');
  }

  mobHurt() {
    this._tone(320, 0.15, 0.16, 'sawtooth', 180);
    this._noiseBurst(0.1, 600, 0.1);
  }

  // ---- Ambient -------------------------------------------------------------
  startRain() {
    if (!this.ctx || this._ambientNodes) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.12, this._now() + 2);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    this._ambientNodes = { src, g };
  }

  stopRain() {
    if (!this._ambientNodes) return;
    const { src, g } = this._ambientNodes;
    g.gain.linearRampToValueAtTime(0.0001, this._now() + 1.5);
    setTimeout(() => { try { src.stop(); } catch (e) { /* ignore */ } }, 1800);
    this._ambientNodes = null;
  }

  setRainIntensity(v) {
    if (this._ambientNodes) {
      this._ambientNodes.g.gain.value = 0.12 * v;
    }
  }
}
