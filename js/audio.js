export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;

    this.enabled = true;
    this.started = false;

    // engine
    this.engineOsc = null;
    this.engineFilter = null;

    // music
    this.musicTimer = 0;
    this.tempo = 118;
    this.step = 0;
  }

  async start() {
    if (this.started) return;
    this.started = true;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.24;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.45;
    this.sfxGain.connect(this.master);

    // engine base
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 380;

    const engineGain = this.ctx.createGain();
    engineGain.gain.value = 0.0;

    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(engineGain);
    engineGain.connect(this.sfxGain);

    this.engineGain = engineGain;

    this.engineOsc.start();

    // start music loop (simple synthwave arpeggio)
    this.musicTimer = this.ctx.currentTime;
    this.step = 0;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.75 : 0.0;
    return this.enabled;
  }

  update(dt, state) {
    if (!this.ctx || !this.started) return;

    // engine pitch follows speed
    const speed = state?.player?.speed ?? 12;
    const nitro = (state?.player?.nitro?.t ?? 0) > 0;
    const targetFreq = 70 + speed * 9 + (nitro ? 120 : 0);

    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.03);
    this.engineFilter.frequency.setTargetAtTime(280 + speed * 14, this.ctx.currentTime, 0.05);
    this.engineGain.gain.setTargetAtTime(state?.running && !state?.gameOver ? 0.08 : 0.0, this.ctx.currentTime, 0.08);

    // schedule music steps
    const spb = 60 / this.tempo;
    const stepDur = spb / 2; // 8th notes
    while (this.musicTimer < this.ctx.currentTime + 0.12) {
      this.playStep(this.musicTimer, this.step);
      this.musicTimer += stepDur;
      this.step++;
    }
  }

  playStep(t, step) {
    // minor-ish neon vibe
    const scale = [0, 3, 5, 7, 10, 12]; // Aeolian fragments
    const root = 48; // C2
    const n = scale[step % scale.length] + root + (step % 16 < 8 ? 12 : 24);

    const freq = midiToHz(n);
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);

    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq * 2.2, t);
    f.Q.setValueAtTime(8, t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);

    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);

    o.start(t);
    o.stop(t + 0.25);
  }

  sfx(type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (type === "coin") blip(this.ctx, this.sfxGain, t, 620, 0.06);
    if (type === "buff") blip(this.ctx, this.sfxGain, t, 340, 0.10);
    if (type === "near") sweep(this.ctx, this.sfxGain, t, 220, 920, 0.12);
    if (type === "hit") noiseHit(this.ctx, this.sfxGain, t, 0.22);
    if (type === "nitro") sweep(this.ctx, this.sfxGain, t, 180, 1200, 0.18);
  }
}

function midiToHz(m){ return 440 * Math.pow(2, (m - 69) / 12); }

function blip(ctx, out, t, freq, dur) {
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(freq, t);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

function sweep(ctx, out, t, f0, f1, dur) {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseHit(ctx, out, t, dur) {
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 420;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(f); f.connect(g); g.connect(out);
  src.start(t); src.stop(t + dur + 0.02);
}
