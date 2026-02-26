export class GameCore {
  constructor() {
    this.onEvent = null;

    // persistent meta (home economy can use these)
    this.meta = {
      bank: 0,
      best: 0,
      skinId: "cyanPink",
      queued: {
        magnet: 0,
        shield: 0,
        scorex2: 0,
        nitro: 0,
        slowmo: 0,
        invis: 0,
      },
      // ghost / challenge
      ghostEnabled: true,
    };

    this.reset();
  }

  // ---------------------------
  // PUBLIC API (HOME)
  // ---------------------------

  setMeta(meta = {}) {
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
    this.meta.queued = { magnet: 0, shield: 0, scorex2: 0, nitro: 0, slowmo: 0, invis: 0 };
  }

  applyQueuedToRun() {
    const q = this.meta.queued || {};
    const total = Object.values(q).reduce((a, b) => a + (b || 0), 0);
    if (total <= 0) return;

    if (q.magnet) this.active.magnet = Math.max(this.active.magnet, 0) + 6.0 * q.magnet;
    if (q.shield) this.active.shield = Math.max(this.active.shield, 0) + 5.0 * q.shield;
    if (q.scorex2) this.active.scorex2 = Math.max(this.active.scorex2, 0) + 7.0 * q.scorex2;
    if (q.slowmo) this.active.slowmo = Math.max(this.active.slowmo, 0) + 4.0 * q.slowmo;
    if (q.invis) this.active.invis = Math.max(this.active.invis, 0) + 4.0 * q.invis;
    if (q.nitro) this.player.nitro.charges = Math.min(3, this.player.nitro.charges + q.nitro);

    this.emit("shop_applied", { queued: { ...q } });
    this.clearQueued();
  }

  getPreviewState() {
    return {
      skinId: this.meta.skinId,
      bank: this.meta.bank,
      best: this.meta.best,
    };
  }

  // ---------------------------
  // CORE GAME STATE
  // ---------------------------

  reset() {
    this.running = false;
    this.gameOver = false;

    // player motion (FREE movement)
    this.player = {
      x: 0,
      targetX: 0,
      zOff: 0,        // forward/back offset relative to origin (negative = forward)
      targetZ: 0,

      speed: 12,
      maxSpeed: 36,

      invulnT: 0,

      nitro: { charges: 1, t: 0 },

      drift: { on: false, amount: 0, direction: 0 },

      lives: 2,
      reviveUsed: false,
    };

    // stats
    this.score = 0;
    this.coins = 0;
    this.combo = 1;
    this.comboT = 0;

    // objects
    this.obstacles = [];
    this.coinPacks = [];
    this.buffs = [];
    this.particles = [];

    // difficulty
    this.t = 0;
    this.spawnT = 0;
    this.coinT = 0;
    this.buffT = 0;
    this.distance = 0;

    // bonus round (parity)
    this.inBonus = false;
    this.bonusT = 0;
    this.nextBonusAt = 500; // distance threshold

    // buffs state
    this.active = {
      magnet: 0,
      shield: 0,
      scorex2: 0,
      slowmo: 0,
      invis: 0,
    };

    // events
    this.lastNearMiss = 0;

    // seedable challenge support
    this.seed = Math.floor(Math.random() * 1e9);
    this._rng = mulberry32(this.seed);

    // ghost (gameplay-time sampled)
    this.ghost = {
      enabled: !!this.meta.ghostEnabled,
      rec: [],
      play: null,      // array of samples: {t,x,z,r}
      t: 0,
      recAcc: 0,
      playing: false,
    };

    // internal stats
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
    const s = Number(seed);
    if (!Number.isFinite(s)) return;
    this.seed = (s | 0) >>> 0;
    this._rng = mulberry32(this.seed);
  }

  rand() { return this._rng(); }

  start(opts = {}) {
    const applyQueued = (opts.applyQueued !== false);

    this.reset();
    if (opts.seed != null) this.setSeed(opts.seed);

    // optional ghost playback (challenge)
    if (opts.ghostPlay && Array.isArray(opts.ghostPlay)) {
      this.ghost.play = opts.ghostPlay;
      this.ghost.playing = true;
      this.emit("ghost_mode", { on: true });
    } else {
      this.emit("ghost_mode", { on: false });
    }

    this.running = true;
    this.stats.runs++;
    if (applyQueued) this.applyQueuedToRun();

    this.emit("start", { seed: this.seed });
  }

  revive() {
    if (!this.gameOver) return false;
    if (this.player.reviveUsed) return false;

    // spend 100 run coins
    if (this.coins < 100) return false;

    this.coins -= 100;
    this.player.reviveUsed = true;

    this.gameOver = false;
    this.running = true;

    // give protection window and a shield burst
    this.player.invulnT = 1.5;
    this.active.shield = Math.max(this.active.shield, 0) + 1.8;

    this.emit("revive", { coins: this.coins });
    return true;
  }

  end(reason = "hit") {
    this.running = false;
    this.gameOver = true;
    this.emit("end", {
      reason,
      score: this.score,
      coins: this.coins,
      seed: this.seed,
      ghostRec: this.ghost.rec
    });
  }

  // input:
  // moveX, moveY in [-1..1]
  // nitro boolean
  // driftDir -1/0/1
  update(dt, input) {
    if (!this.running || this.gameOver) return;

    // slowmo affects dt (parity)
    let timeScale = (this.active.slowmo > 0) ? 0.55 : 1.0;
    dt *= timeScale;

    this.t += dt;

    // difficulty ramp
    const ramp = Math.min(1, this.t / 90);
    const targetSpeed = 14 + ramp * 18;
    this.player.speed = lerp(this.player.speed, Math.min(targetSpeed, this.player.maxSpeed), 0.04);

    // bonus round trigger
    if (!this.inBonus && this.distance >= this.nextBonusAt) {
      this.inBonus = true;
      this.bonusT = 7.5;
      this.nextBonusAt += 650;
      this.emit("bonus_start", { t: this.bonusT });
    }
    if (this.inBonus) {
      this.bonusT = Math.max(0, this.bonusT - dt);
      if (this.bonusT <= 0) {
        this.inBonus = false;
        this.emit("bonus_end", {});
      }
    }

    // nitro
    if (this.player.nitro.t > 0) this.player.nitro.t = Math.max(0, this.player.nitro.t - dt);

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

    // FREE movement: X and forward/back Z (NO auto-centering)
const maxX = 3.2;
const maxZ = 2.0;     // back limit
const minZ = -5.5;    // forward limit

const dead = 0.06;
const mxRaw = clamp(input.moveX || 0, -1, 1);
const myRaw = clamp(input.moveY || 0, -1, 1);

// if no input, HOLD last target (do not snap back to center)
if (Math.abs(mxRaw) > dead) {
  this.player.targetX = mxRaw * maxX;
}
if (Math.abs(myRaw) > dead) {
  const targetZ = lerp(maxZ, minZ, (myRaw + 1) * 0.5);
  this.player.targetZ = targetZ;
}

// smoother / slower movement feel
const xResponse = 9 + this.player.drift.amount * 4; // was too fast
const zResponse = 7;                                // slower forward/back

this.player.x = damp(this.player.x, this.player.targetX, xResponse, dt);
this.player.zOff = damp(this.player.zOff, this.player.targetZ, zResponse, dt);

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

    // obstacle spawn (disabled during bonus)
    const spawnEvery = lerp(0.75, 0.38, ramp);
    if (!this.inBonus && this.spawnT <= 0) {
      this.spawnT = spawnEvery;
      this.spawnObstacle();
    }

    // coins: more during bonus
    if (this.coinT <= 0) {
      this.coinT = this.inBonus ? 0.22 : lerp(0.55, 0.35, ramp);
      this.spawnCoins();
    }

    // buffs
    if (this.buffT <= 0) {
      this.buffT = 7.5 + this.rand() * 4.5;
      this.spawnBuff();
    }

    // move world objects toward player
    const dz = speedZ * dt;

    // obstacles: each has its own speed, so relative movement differs
    for (const o of this.obstacles) {
      // lane change AI
      o.laneCooldown = Math.max(0, o.laneCooldown - dt);

      // choose a lane switch sometimes, more likely if close to player
      const close = (o.z - this.player.zOff) > -28 && (o.z - this.player.zOff) < -6;
      const chance = close ? 0.035 : 0.010;
      if (o.laneCooldown <= 0 && this.rand() < chance) {
        const dir = (this.rand() < 0.5) ? -1 : 1;
        o.targetLane = clampInt(o.targetLane + dir, 0, 2);
        o.laneCooldown = 0.8 + this.rand() * 1.4;
      }

      // avoid occupying exactly the player's lane when super close (feels “smart”)
      if (close && this.rand() < 0.05) {
        const playerLane = xToLane(this.player.x);
        if (o.targetLane === playerLane) {
          o.targetLane = clampInt(o.targetLane + ((this.rand() < 0.5) ? -1 : 1), 0, 2);
          o.laneCooldown = 1.2;
        }
      }

      // smooth lane movement
      const laneXs = [-2.6, 0, 2.6];
      o.targetX = laneXs[o.targetLane] + (this.rand() - 0.5) * 0.15;
      o.x = damp(o.x, o.targetX, 10, dt);

      // forward motion: obstacle “drives” too
      // if obstacle speed is close to player, it hangs around
      const rel = (speedZ - o.speed);
      o.z += rel * dt;

      // tiny steering wobble for life
      o.yaw = damp(o.yaw, (o.targetX - o.x) * 0.25, 8, dt);
    }

    // coins/buffs move by player speed
    for (const c of this.coinPacks) c.z += dz;
    for (const b of this.buffs) b.z += dz;

    // remove passed objects
    this.obstacles = this.obstacles.filter(o => o.z < 8);
    this.coinPacks = this.coinPacks.filter(c => c.z < 8 && c.alive);
    this.buffs = this.buffs.filter(b => b.z < 8 && b.alive);

    // magnet pulls coins toward player
    if (this.active.magnet > 0) {
      for (const c of this.coinPacks) {
        c.x = damp(c.x, this.player.x, 14, dt);
      }
    }

    // collisions
    this.handleCollisions(dt);

    // score
    const base = speedZ * dt * 10;
    const mult = (this.active.scorex2 > 0) ? 2 : 1;
    this.score += Math.floor(base * this.combo * mult);

    // combo decay
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = 1;

    // passive nitro recharge
    if (this.player.nitro.charges < 3) {
      if (this.t % 6 < dt) this.player.nitro.charges++;
    }

    // ghost record + playback (sampled on gameplay time)
    this.updateGhost(dt);

    // milestone
    if (!this._nextScoreMilestone) this._nextScoreMilestone = 1000;
    if (this.score >= this._nextScoreMilestone) {
      this.emit("milestone_score", { score: this.score, milestone: this._nextScoreMilestone });
      this._nextScoreMilestone += 1000;
    }
  }

  updateGhost(dt) {
    // record
    if (this.ghost.enabled) {
      this.ghost.t += dt;
      this.ghost.recAcc += dt;

      const sampleEvery = 0.05; // 20 Hz
      while (this.ghost.recAcc >= sampleEvery) {
        this.ghost.recAcc -= sampleEvery;
        this.ghost.rec.push({
          t: Number(this.ghost.t.toFixed(3)),
          x: Number(this.player.x.toFixed(3)),
          z: Number(this.player.zOff.toFixed(3)),
          r: Number((this.player.drift.amount * (this.player.drift.direction || 0)).toFixed(3)),
        });
      }
    }

    // playback
    if (this.ghost.playing && Array.isArray(this.ghost.play) && this.ghost.play.length > 2) {
      // Keep a ghostTime that matches gameplay time (NOT real time)
      if (!this.ghost._playT) this.ghost._playT = 0;
      this.ghost._playT += dt;

      // find sample window
      const arr = this.ghost.play;
      let i = this.ghost._playIdx || 0;
      while (i < arr.length - 2 && arr[i + 1].t < this.ghost._playT) i++;
      this.ghost._playIdx = i;

      const a = arr[i];
      const b = arr[Math.min(i + 1, arr.length - 1)];
      const span = Math.max(0.0001, (b.t - a.t));
      const u = clamp01((this.ghost._playT - a.t) / span);

      const gx = lerp(a.x, b.x, u);
      const gz = lerp(a.z, b.z, u);
      const gr = lerp(a.r || 0, b.r || 0, u);

      this.emit("ghost_frame", { x: gx, z: gz, r: gr });
    }
  }

  handleCollisions(dt) {
    const px = this.player.x;
    const pz = this.player.zOff; // player “forward/back”

    // smaller collision while invisible
    const baseR = (this.active.invis > 0) ? 0.35 : 0.55;
    const pr = baseR;

    // obstacles
    for (const o of this.obstacles) {
      const dx = (o.x - px);
      const dz = (o.z - pz);
      const rr = pr + o.r;

      // near miss
      const dist2 = dx * dx + dz * dz;
      const near = (rr + 0.45);
      if (dist2 < near * near && dist2 > rr * rr) {
        if (this.t - this.lastNearMiss > 0.35) {
          this.lastNearMiss = this.t;
          this.stats.nearMisses++;
          this.combo = Math.min(12, this.combo + 1);
          this.comboT = 1.3;
          this.emit("near_miss", { combo: this.combo });
        }
      }

      // hit
      if (dist2 < rr * rr) {
        if (this.player.invulnT > 0) continue;

        if (this.active.shield > 0) {
          this.active.shield = 0;
          this.player.invulnT = 0.7;
          this.stats.hitsBlocked++;
          this.emit("shield_break", {});
          // knock obstacle aside slightly
          o.x += (dx >= 0 ? 0.55 : -0.55);
          o.laneCooldown = 1.2;
          return;
        }

        // lose life
        this.player.lives--;
        this.player.invulnT = 1.2;
        this.emit("life_lost", { lives: this.player.lives });

        // push player a bit back to give recovery feel
        this.player.zOff = Math.min(2.0, this.player.zOff + 1.0);

        if (this.player.lives <= 0) {
          this.end("hit");
        }
        return;
      }
    }

    // coins
    for (const c of this.coinPacks) {
      if (!c.alive) continue;
      const dx = (c.x - px);
      const dz = (c.z - pz);
      if (dx * dx + dz * dz < (pr + 0.35) ** 2) {
        c.alive = false;
        const amt = c.amt || 1;
        this.coins += amt;
        this.stats.coinsPicked += amt;
        this.comboT = 1.3;
        this.emit("coin", { coins: this.coins, amt });
      }
    }

    // buffs
    for (const b of this.buffs) {
      if (!b.alive) continue;
      const dx = (b.x - px);
      const dz = (b.z - pz);
      if (dx * dx + dz * dz < (pr + 0.5) ** 2) {
        b.alive = false;
        this.stats.buffsPicked++;
        this.applyBuff(b.type);
      }
    }
  }

  applyBuff(type) {
    const t = type || "magnet";
    if (t === "magnet") this.active.magnet = Math.max(this.active.magnet, 0) + 6.0;
    if (t === "shield") this.active.shield = Math.max(this.active.shield, 0) + 5.0;
    if (t === "scorex2") this.active.scorex2 = Math.max(this.active.scorex2, 0) + 7.0;
    if (t === "slowmo") this.active.slowmo = Math.max(this.active.slowmo, 0) + 4.0;
    if (t === "invis") this.active.invis = Math.max(this.active.invis, 0) + 4.0;
    if (t === "nitro") this.player.nitro.charges = Math.min(3, this.player.nitro.charges + 1);

    this.emit("buff", { type: t, active: { ...this.active }, nitro: this.player.nitro.charges });
  }

  spawnObstacle() {
    // lane-based traffic car positions, but player is free to drift between
    const laneXs = [-2.6, 0, 2.6];
    const lane = (this.rand() * 3) | 0;

    const ramp = Math.min(1, this.t / 90);

    // obstacle “car speed” in world (so relative speed varies)
    const base = 8 + ramp * 10;
    const speed = base + (this.rand() - 0.5) * 5;

    this.obstacles.push({
      x: laneXs[lane],
      targetX: laneXs[lane],
      z: -60 - this.rand() * 22,
      r: 0.62,
      speed,
      targetLane: lane,
      laneCooldown: 0.5 + this.rand() * 0.9,
      yaw: 0,
      kind: (this.rand() < 0.15) ? "truck" : "car"
    });
  }

  spawnCoins() {
    const laneXs = [-2.6, 0, 2.6];
    const lane = (this.rand() * 3) | 0;

    // coin lines a bit more dense during bonus
    const count = this.inBonus ? 7 : 5;
    for (let i = 0; i < count; i++) {
      this.coinPacks.push({
        x: laneXs[lane] + (this.rand() - 0.5) * 0.35,
        z: -40 - i * (this.inBonus ? 1.8 : 2.4),
        alive: true,
        amt: 1
      });
    }
  }

  spawnBuff() {
    const laneXs = [-2.6, 0, 2.6];
    const lane = (this.rand() * 3) | 0;

    // include parity buffs
    const pool = ["magnet", "shield", "scorex2", "nitro", "slowmo", "invis"];
    const type = pool[(this.rand() * pool.length) | 0];

    this.buffs.push({
      type,
      x: laneXs[lane],
      z: -60 - this.rand() * 18,
      alive: true,
    });
  }

  emit(type, payload) {
    if (typeof this.onEvent === "function") this.onEvent(type, payload);
  }
}

// ------------------ helpers ------------------

function lerp(a, b, t) { return a + (b - a) * t; }

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function clamp01(v) { return clamp(v, 0, 1); }

function damp(current, target, lambda, dt) {
  // exponential smoothing
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampInt(v, a, b) { return Math.max(a, Math.min(b, v | 0)); }

function xToLane(x) {
  // map free X to a “virtual” lane
  if (x < -0.9) return 0;
  if (x > 0.9) return 2;
  return 1;
}
