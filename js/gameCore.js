export class GameCore {
  constructor() {
    // Optional callbacks (UI/audio/renderer can subscribe)
    // this.onEvent = (type, payload) => {}
    this.onEvent = null;

    // persistent meta (home economy can use these)
    this.meta = {
      bank: 0,           // long-term coins (from homepage / saved)
      best: 0,           // best score (from homepage / saved)
      skinId: "cyanPink",// cosmetic id
      queued: {          // shop purchases applied at next run start
        magnet: 0,
        shield: 0,
        scorex2: 0,
        nitro: 0
      }
    };

    this.reset();
  }

  // ---------------------------
  // PUBLIC API FOR HOMEPAGE
  // ---------------------------

  setMeta(meta = {}) {
    // Allows main.js to push saved data into GameCore
    // Does not start the game.
    this.meta = {
      ...this.meta,
      ...meta,
      queued: { ...this.meta.queued, ...(meta.queued || {}) }
    };
  }

  queueBuff(type, count = 1) {
    if (!this.meta.queued[type]) this.meta.queued[type] = 0;
    this.meta.queued[type] += Math.max(0, count | 0);
  }

  clearQueued() {
    this.meta.queued = { magnet: 0, shield: 0, scorex2: 0, nitro: 0 };
  }

  // Apply queued shop items to this run (called automatically by start() unless disabled)
  applyQueuedToRun() {
    const q = this.meta.queued || {};
    const total = Object.values(q).reduce((a, b) => a + (b || 0), 0);
    if (total <= 0) return;

    // Timers stack by extending durations
    if (q.magnet) this.active.magnet = Math.max(this.active.magnet, 0) + 6.0 * q.magnet;
    if (q.shield) this.active.shield = Math.max(this.active.shield, 0) + 5.0 * q.shield;
    if (q.scorex2) this.active.scorex2 = Math.max(this.active.scorex2, 0) + 7.0 * q.scorex2;
    if (q.nitro) this.player.nitro.charges = Math.min(2, this.player.nitro.charges + q.nitro);

    this.emit("shop_applied", { queued: { ...q } });
    this.clearQueued();
  }

  // Useful for 3D homepage "garage" preview without gameplay
  getPreviewState() {
    return {
      player: {
        x: 0,
        z: 0,
        speed: 0,
        invulnT: 0,
        nitro: { ...this.player.nitro },
        drift: { ...this.player.drift }
      },
      t: this.t,
      obstacles: [],
      coinPacks: [],
      buffs: [],
      active: { ...this.active }
    };
  }

  // ---------------------------
  // CORE GAME LOOP
  // ---------------------------

  reset() {
    this.running = false;
    this.gameOver = false;

    // world
    this.lanes = [-2.2, 0, 2.2];
    this.player = {
      x: 0,
      lane: 1,
      targetX: 0,
      z: 0,
      speed: 12,
      maxSpeed: 36,
      hp: 1,
      invulnT: 0,
      nitro: { charges: 1, t: 0 },
      drift: { on: false, amount: 0, direction: 0 },
    };

    // stats
    this.score = 0;
    this.coins = 0;
    this.combo = 1;
    this.comboT = 0;

    // objects
    this.obstacles = [];
    this.coinPacks = [];
    this.buffs = []; // {type, x,z, alive}
    this.particles = [];

    // difficulty
    this.t = 0;
    this.spawnT = 0;
    this.coinT = 0;
    this.buffT = 0;
    this.distance = 0;

    // buffs state
    this.active = {
      magnet: 0,
      shield: 0,
      scorex2: 0
    };

    // scoring events
    this.lastNearMiss = 0;

    // seedable challenge support
    this.seed = Math.floor(Math.random() * 1e9);
    this._rng = mulberry32(this.seed);

    // internal stats (for missions / analytics)
    this.stats = {
      runs: 0,
      nearMisses: 0,
      buffsPicked: 0,
      coinsPicked: 0,
      hitsBlocked: 0
    };

    this.emit("reset", {});
  }

  setSeed(seed) {
    this.seed = seed >>> 0;
    this._rng = mulberry32(this.seed);
    this.emit("seed", { seed: this.seed });
  }

  start(opts = {}) {
    // opts: { seed, applyQueued=true }
    const applyQueued = (opts.applyQueued !== false);

    this.reset();

    if (opts.seed != null) this.setSeed(opts.seed);

    this.running = true;
    this.stats.runs++;

    if (applyQueued) this.applyQueuedToRun();

    this.emit("start", { seed: this.seed });
  }

  end(reason = "hit") {
    this.running = false;
    this.gameOver = true;
    this.emit("end", { reason, score: this.score, coins: this.coins, seed: this.seed });
  }

  // input: moveX in [-1..1], nitro boolean, driftDir -1/0/1
  update(dt, input) {
    if (!this.running || this.gameOver) return;

    this.t += dt;

    // difficulty ramp
    const ramp = Math.min(1, this.t / 90);
    const targetSpeed = 14 + ramp * 18;
    this.player.speed = lerp(this.player.speed, Math.min(targetSpeed, this.player.maxSpeed), 0.04);

    // nitro
    if (this.player.nitro.t > 0) {
      this.player.nitro.t = Math.max(0, this.player.nitro.t - dt);
    }
    if (input.nitro && this.player.nitro.charges > 0 && this.player.nitro.t <= 0) {
      this.player.nitro.charges--;
      this.player.nitro.t = 1.25;
      this.emit("nitro", { charges: this.player.nitro.charges });
    }
    const nitroBoost = (this.player.nitro.t > 0) ? 16 : 0;

    // drift / style
    const driftDir = input.driftDir || 0;
    const drifting = driftDir !== 0;
    this.player.drift.on = drifting;
    if (drifting) {
      this.player.drift.direction = driftDir;
      this.player.drift.amount = clamp01(this.player.drift.amount + dt * 1.2);
    } else {
      this.player.drift.amount = clamp01(this.player.drift.amount - dt * 1.6);
    }

    // lateral movement (smooth)
    const maxX = 2.2;
    const desiredX = clamp(input.moveX || 0, -1, 1) * maxX;
    this.player.targetX = desiredX;

    // drift adds sideways responsiveness at higher speed
    const responsiveness = 14 + this.player.drift.amount * 8;
    this.player.x = damp(this.player.x, this.player.targetX, responsiveness, dt);

    // invulnerability
    this.player.invulnT = Math.max(0, this.player.invulnT - dt);

    // buffs timers
    for (const k of Object.keys(this.active)) {
      this.active[k] = Math.max(0, this.active[k] - dt);
    }

    // spawns
    this.spawnT -= dt;
    this.coinT -= dt;
    this.buffT -= dt;

    const speedZ = this.player.speed + nitroBoost;
    this.distance += speedZ * dt;

    // obstacle spawn rate increases over time
    const spawnEvery = lerp(0.75, 0.38, ramp);
    if (this.spawnT <= 0) {
      this.spawnT = spawnEvery;
      this.spawnObstacle();
    }

    if (this.coinT <= 0) {
      this.coinT = lerp(0.55, 0.35, ramp);
      this.spawnCoins();
    }

    if (this.buffT <= 0) {
      this.buffT = 7.5 + this.rand() * 4.5;
      this.spawnBuff();
    }

    // move world objects towards player (increase z towards 0)
    const dz = speedZ * dt;

    // obstacles
    for (const o of this.obstacles) o.z += dz;
    // coins
    for (const c of this.coinPacks) c.z += dz;
    // buffs
    for (const b of this.buffs) b.z += dz;

    // remove passed objects
    this.obstacles = this.obstacles.filter(o => o.z < 6);
    this.coinPacks = this.coinPacks.filter(c => c.z < 6 && c.alive);
    this.buffs = this.buffs.filter(b => b.z < 6 && b.alive);

    // magnet pulls ALL coins from ALL lanes toward player
    if (this.active.magnet > 0) {
      for (const c of this.coinPacks) {
        c.x = damp(c.x, this.player.x, 14, dt);
      }
    }

    // collisions
    this.handleCollisions(dt);

    // score
    const base = speedZ * dt * 10; // distance-based
    const mult = (this.active.scorex2 > 0) ? 2 : 1;
    this.score += Math.floor(base * this.combo * mult);

    // combo decay
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 1;

    // small passive recharge for nitro
    if (this.player.nitro.charges < 2) {
      if (this.t % 6 < dt) this.player.nitro.charges++;
    }

    // milestone events (useful for “Well Done” / achievements)
    // score milestones every 1000
    if (!this._nextScoreMilestone) this._nextScoreMilestone = 1000;
    if (this.score >= this._nextScoreMilestone) {
      this.emit("milestone_score", { score: this.score, milestone: this._nextScoreMilestone });
      this._nextScoreMilestone += 1000;
    }
  }

  handleCollisions(dt) {
    const px = this.player.x;
    const pz = 0;

    // player collision radius
    const pr = 0.55;

    // obstacles
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      const dx = o.x - px;
      const dz = o.z - pz;
      const dist2 = dx * dx + dz * dz;

      // near miss: pass close but not hit (trigger once)
      const nearR = 1.05;
      if (!o.nearMissed && dz > -0.6 && dz < 0.35 && dist2 < nearR * nearR && dist2 > pr * pr) {
        o.nearMissed = true;
        this.onNearMiss();
      }

      // hit
      if (dist2 < pr * pr) {
        if (this.active.shield > 0) {
          o.alive = false;
          this.onHitBlocked();
        } else if (this.player.invulnT <= 0) {
          this.player.invulnT = 1.0;
          this.onHit();
          this.end("hit");
          return;
        }
      }
    }

    // coins
    for (const c of this.coinPacks) {
      if (!c.alive) continue;
      const dx = c.x - px;
      const dz = c.z - pz;
      if (dx * dx + dz * dz < 0.8 * 0.8) {
        c.alive = false;
        this.coins++;
        this.stats.coinsPicked++;
        this.onCollect();
        this.emit("coin", { total: this.coins });
      }
    }

    // buffs
    for (const b of this.buffs) {
      if (!b.alive) continue;
      const dx = b.x - px;
      const dz = b.z - pz;
      if (dx * dx + dz * dz < 0.95 * 0.95) {
        b.alive = false;
        this.stats.buffsPicked++;
        this.applyBuff(b.type);
        this.emit("buff", { type: b.type, active: { ...this.active }, nitro: { ...this.player.nitro } });
      }
    }
  }

  onCollect() {
    this.combo = Math.min(12, this.combo + 0.15);
    this.comboT = 2.4;
  }

  onNearMiss() {
    this.combo = Math.min(12, this.combo + 0.35);
    this.comboT = 2.8;
    this.score += 250 * Math.floor(this.combo);
    this.lastNearMiss = this.t;
    this.stats.nearMisses++;
    this.emit("near_miss", { combo: this.combo, score: this.score });
  }

  onHitBlocked() {
    this.score += 200;
    this.stats.hitsBlocked++;
    this.emit("hit_blocked", {});
  }

  onHit() {
    // game over handled outside
    this.emit("hit", {});
  }

  applyBuff(type) {
    if (type === "magnet") this.active.magnet = 6.0;
    if (type === "shield") this.active.shield = 5.0;
    if (type === "scorex2") this.active.scorex2 = 7.0;
    if (type === "nitro") this.player.nitro.charges = Math.min(2, this.player.nitro.charges + 1);

    // reward feedback
    this.score += 400;
    this.combo = Math.min(12, this.combo + 0.25);
    this.comboT = 2.6;
  }

  spawnObstacle() {
    // choose lane-ish position but allow between-lane to force skill dodges
    const lane = Math.floor(this.rand() * 3);
    const jitter = (this.rand() - 0.5) * 0.6;
    const x = this.lanes[lane] + jitter;

    // spacing ahead
    const z = -70 - this.rand() * 55;

    // vary width
    const w = 0.95 + this.rand() * 0.35;

    this.obstacles.push({
      x, z, w,
      alive: true,
      nearMissed: false,
      kind: (this.rand() < 0.75) ? "car" : "block",
    });

    this.emit("spawn_obstacle", { x, z });
  }

  spawnCoins() {
    const pattern = Math.floor(this.rand() * 4);
    const z0 = -45 - this.rand() * 55;

    if (pattern === 0) {
      // 3-lane row
      for (let i = 0; i < 3; i++) this.coinPacks.push({ x: this.lanes[i], z: z0 - i * 2, alive: true });
    } else if (pattern === 1) {
      // snake
      const start = Math.floor(this.rand() * 3);
      for (let k = 0; k < 7; k++) {
        const lane = (start + k) % 3;
        this.coinPacks.push({ x: this.lanes[lane], z: z0 - k * 2.4, alive: true });
      }
    } else if (pattern === 2) {
      // single line with jitter
      const lane = Math.floor(this.rand() * 3);
      for (let k = 0; k < 9; k++) {
        this.coinPacks.push({ x: this.lanes[lane] + (this.rand() - 0.5) * 0.25, z: z0 - k * 2.2, alive: true });
      }
    } else {
      // spread (magnet feels amazing here)
      for (let k = 0; k < 9; k++) {
        const lane = Math.floor(this.rand() * 3);
        this.coinPacks.push({ x: this.lanes[lane] + (this.rand() - 0.5) * 0.9, z: z0 - k * 2.0, alive: true });
      }
    }

    this.emit("spawn_coins", { count: this.coinPacks.length });
  }

  spawnBuff() {
    const types = ["magnet", "shield", "scorex2", "nitro"];
    const type = types[Math.floor(this.rand() * types.length)];
    const lane = Math.floor(this.rand() * 3);
    const x = this.lanes[lane] + (this.rand() - 0.5) * 0.4;
    const z = -85 - this.rand() * 70;
    this.buffs.push({ type, x, z, alive: true });

    this.emit("spawn_buff", { type, x, z });
  }

  rand() {
    return this._rng();
  }

  emit(type, payload) {
    if (typeof this.onEvent === "function") {
      try { this.onEvent(type, payload); } catch {}
    }
  }
}

// utilities
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
