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
    this.engineGain = null;

    // music sequencer
    this.musicTimer = 0;
    this.tempo = 120;
    this.step = 0;
  }

  async start() {
    if (this.started) return;
    this.started = true;

    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.master);

    // Engine (simple synth)
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 520;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc.start();

    // Start a gentle background beat
    this.musicTimer = 0;
    this.step = 0;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? 0.85 : 0.0;
  }

  update(dt, state) {
    if (!this.ctx || !this.enabled) return;

    // engine pitch from speed
    const speed = state?.player?.speed || 0;
    const nitroOn = (state?.player?.nitro?.t || 0) > 0;
    const targetFreq = 120 + speed * 10 + (nitroOn ? 110 : 0);

    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
    this.engineFilter.frequency.setTargetAtTime(380 + speed * 18, this.ctx.currentTime, 0.08);

    const targetVol = state?.running && !state?.gameOver ? 0.11 : 0.0;
    this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.08);

    // music sequencer (neon synthwave-ish)
    this.musicTimer += dt;
    const spb = 60 / this.tempo;          // seconds per beat
    const stepTime = spb / 2;             // 8th notes

    while (this.musicTimer >= stepTime) {
      this.musicTimer -= stepTime;
      this.step = (this.step + 1) % 16;

      // kick + hat
      if (this.step % 4 === 0) this.kick();
      if (this.step % 2 === 1) this.hat();

      // bassline
      if (this.step % 4 === 0) {
        const bassNotes = [48, 48, 43, 46]; // C, C, G, A#
        const n = bassNotes[(this.step / 4) | 0];
        this.bass(n, 0.16);
      }

      // lead stabs
      if (this.step === 6 || this.step === 14) {
        const leadNotes = [72, 74, 79, 77];
        const n = leadNotes[(Math.random() * leadNotes.length) | 0];
        this.lead(n, 0.10);
      }
    }
  }

  // ---- SFX API ----

  sfx(type) {
    if (!this.ctx || !this.enabled) return;
    if (type === "coin") this.coin();
    if (type === "buff") this.power();
    if (type === "hit") this.hit();
    if (type === "near") this.whoosh();
    if (type === "nitro") this.boost();
    if (type === "life") this.lifeLost();
    if (type === "bonus") this.bonus();
    if (type === "revive") this.revive();
  }

  // ---- Music/SFX synth building blocks ----

  osc(type, freq, dur, gain, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;

    const g = this.ctx.createGain();
    g.gain.value = 0.0001;

    o.connect(g);
    g.connect(dest);

    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.start(t);
    o.stop(t + dur + 0.02);
  }

  midiToHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  kick() {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.connect(g);
    g.connect(this.musicGain);

    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.10);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

    o.start(t);
    o.stop(t + 0.16);
  }

  hat() {
    // noise hat
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;

    const g = this.ctx.createGain();
    g.gain.value = 0.0001;

    noise.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);

    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

    noise.start(t);
    noise.stop(t + 0.05);
  }

  bass(note, dur) {
    const hz = this.midiToHz(note);
    this.osc("square", hz, dur, 0.12, this.musicGain);
  }

  lead(note, dur) {
    const hz = this.midiToHz(note);
    this.osc("sawtooth", hz, dur, 0.08, this.musicGain);
    this.osc("triangle", hz * 2, dur, 0.03, this.musicGain);
  }

  // ---- SFX ----
  coin() { this.osc("triangle", 880, 0.10, 0.12, this.sfxGain); }
  power() { this.osc("sawtooth", 420, 0.14, 0.10, this.sfxGain); }
  whoosh() { this.osc("sine", 160, 0.12, 0.08, this.sfxGain); }
  boost() { this.osc("sawtooth", 260, 0.20, 0.12, this.sfxGain); }
  lifeLost() { this.osc("square", 120, 0.22, 0.12, this.sfxGain); }
  bonus() { this.osc("triangle", 520, 0.25, 0.10, this.sfxGain); }
  revive() { this.osc("triangle", 660, 0.25, 0.12, this.sfxGain); }

  hit() {
    // short noise burst
    const bufferSize = 0.15 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;

    const g = this.ctx.createGain();
    g.gain.value = 0.0001;

    noise.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);

    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    noise.start(t);
    noise.stop(t + 0.17);
  }
}
