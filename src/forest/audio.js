// The forest's sound, all synthesised: wind through the trees, a low drone, footsteps, landings, wings.
export class Ambience {
  constructor() { this.muted = false; }

  // Browsers only allow audio after a key press or tap.
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.white = this.noise(2, false);
    const brown = this.noise(4, true);

    // wind: brown noise through a low-pass that opens with the gusts
    const w = ctx.createBufferSource();
    w.buffer = brown; w.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 380; this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.25;
    w.connect(this.windFilter).connect(this.windGain).connect(this.master);
    w.start();
    // leaves: hiss high up, only in the gusts
    const l = ctx.createBufferSource();
    l.buffer = this.white; l.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.5;
    this.leafGain = ctx.createGain(); this.leafGain.gain.value = 0;
    l.connect(bp).connect(this.leafGain).connect(this.master);
    l.start();
    // drone: two soft low tones that beat slowly
    for (const [f, g] of [[55, 0.035], [82.7, 0.02], [110.3, 0.008]]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og).connect(this.master);
      o.start();
    }
  }

  noise(seconds, brown) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  setWind(v) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(260 + v * 380, t, 0.4);
    this.windGain.gain.setTargetAtTime(0.16 + v * 0.18, t, 0.4);
    this.leafGain.gain.setTargetAtTime(Math.max(0, v - 0.55) * 0.05, t, 0.5);
  }

  // A short filtered noise burst.
  burst(freq, gain, decay, delay = 0, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5, decay + 0.05);
  }

  step(power = 1) {
    this.burst(500 + Math.random() * 400, 0.22 * power, 0.09);
    this.burst(2400, 0.025 * power, 0.05, 0.005, 'bandpass');
  }

  land(power) {
    this.burst(260, 0.45 * power, 0.22);
    this.burst(900, 0.12 * power, 0.12, 0.01);
  }

  wings(n) {
    for (let i = 0; i < 7 + n * 2; i++) this.burst(1100 + Math.random() * 800, 0.06, 0.06, i * (0.05 + Math.random() * 0.03), 'bandpass');
  }

  // A low tone with a shaped envelope (growls, the chime at the end).
  tone(type, freq, gain, attack, decay, delay = 0, wobble = 0, cutoff = 2000) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay);
    if (wobble) {
      const l = ctx.createOscillator(); l.frequency.value = wobble;
      const lg = ctx.createGain(); lg.gain.value = gain * 0.8;
      l.connect(lg).connect(g.gain); l.start(t); l.stop(t + attack + decay + 0.1);
    }
    o.connect(f).connect(g).connect(this.master);
    o.start(t); o.stop(t + attack + decay + 0.1);
  }

  snap(v = 1) { this.burst(3500, 0.5 * v, 0.12, 0, 'bandpass'); this.burst(300, 0.6 * v, 0.3); }
  scrape() { this.burst(300 + Math.random() * 200, 0.16, 0.2); this.burst(1600, 0.03, 0.12, 0.03, 'bandpass'); }
  creak() { this.tone('sawtooth', 180 + Math.random() * 40, 0.05, 0.05, 0.25, 0, 30, 900); }
  yelp(v = 1) { this.tone('sawtooth', 520, 0.12 * v, 0.02, 0.35, 0, 9, 1800); this.tone('sine', 700, 0.06 * v, 0.02, 0.4, 0.05); }
  growl() { this.tone('sawtooth', 62, 0.22, 0.4, 0.9, 0, 23, 380); this.tone('sawtooth', 93, 0.1, 0.5, 0.7, 0.05, 17, 500); }
  bark() { this.tone('sawtooth', 120, 0.35, 0.02, 0.35, 0, 30, 700); this.burst(500, 0.3, 0.25); }
  breath(v) { if (v > 0.02) this.burst(180, 0.25 * v, 1.1); }
  fall() { this.burst(600, 0.15, 0.8); }
  splash(v = 1) {
    this.burst(900, 0.5 * v, 0.5);
    this.burst(2600, 0.18 * v, 0.35, 0.02, 'bandpass');
    for (let i = 0; i < 5; i++) this.burst(1800 + Math.random() * 1500, 0.05 * v, 0.08, 0.15 + i * 0.09, 'bandpass');
  }
  bubble() { this.tone('sine', 300 + Math.random() * 300, 0.05, 0.01, 0.12, 0, 0, 1200); }
  grip() { this.burst(1200, 0.12, 0.06, 0, 'bandpass'); this.burst(300, 0.12, 0.1); }
  heave() { this.burst(400, 0.08, 0.25); this.burst(1400, 0.03, 0.15, 0.2, 'bandpass'); }
  chime() { for (const [f, d] of [[392, 0], [523.3, 0.18], [659.3, 0.36], [784, 0.6]]) this.tone('sine', f, 0.07, 0.02, 2.4, d); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
}
