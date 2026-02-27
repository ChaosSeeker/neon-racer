// Neon Racer 3D - GameCore
// - Free movement (left/right + forward/back) without auto-centering
// - Lane-switching obstacle AI (smooth lateral moves)
// - Nitro, drift style, near-miss scoring, coins, buffs
// - Bonus rounds, revive, simple seeded RNG for repeatable runs

export class GameCore {
  constructor() {
    this.onEvent = null;

    // persistent meta (used by homepage economy / shop)
    this.meta = {
      bank: 0,
      best: 0,
      skinId: "cyanPink",
      queued: { magnet: 0, shield: 0, scorex2: 0, nitro: 0, slowmo: 0, invis: 0 },
      ghostEnabled: false,
    };

    this.reset();
  }

  // ---------------------------
  // HOME API
  // ---------------------------
  setMeta(meta = {}) {
    this.meta = {
      ...this.meta,
      ...meta,
      queued: { ...this.meta.queued, ...(meta.queued || {}) },
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

    this.player = {
      x: 0,
      targetX: 0,

      // forward/back offset relative to origin (negative = forward)
      zOff: 0,
      targetZ: 0,

      speed: 12,
      maxSpeed: 36,

      invulnT: 0,
      nitro: { charges: 1, t: 0 },
      drift: { on: false, amount: 0, direction: 0 },

      lives: 2,
      reviveUsed: false,
    };

    this.score = 0;
    this.coins = 0;
    this.combo = 1;
    this.comboT = 0;

    this.obstacles = []; // {x,z, targetX, speed, w, l, kind, yaw, laneMoveT}
    this.coinPacks = []; // {x,z, alive, value}
    this.buffs = [];     // {type, x,z, alive}

    this.t = 0;
    this.spawnT = 0;
    this.coinT = 0;
    this.buffT = 0;
    this.distance = 0;

    // bonus round parity with 2D
    this.inBonus = false;
    this.bonusT = 0;
    this.nextBonusAt = 520;

    this.active = {
      magnet: 0,
      shield: 0,
      scorex2: 0,
      slowmo: 0,
      invis: 0,
    };

    this.lastNearMiss = 0;

    this.seed = (Math.random() * 1e9) | 0;
    this._rng = mulberry32(this.seed >>> 0);

    this.stats = {
      runs: 0,
      nearMisses: 0,
      buffsPicked: 0,
      coinsPicked: 0,
      hitsBlocked: 0,
    };

    // (Optional) ghost hooks - kept for UI parity
    this.ghost = { enabled: !!this.meta.ghostEnabled, playing: false };

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

    this.running = true;
    this.gameOver = false;
    this.stats.runs++;

    if (applyQueued) this.applyQueuedToRun();

    this.emit("start", { seed: this.seed });
  }

  revive() {
    if (!this.gameOver) return false;
    if (this.player.reviveUsed) return false;
    if (this.coins < 100) return false;

    this.coins -= 100;
    this.player.reviveUsed = true;

    this.gameOver = false;
    this.running = true;

    this.player.invulnT = 1.5;
    this.active.shield = Math.max(this.active.shield, 0) + 1.8;

    this.emit("revive", { coins: this.coins });
    return true;
  }

  end(reason = "hit") {
    this.running = false;
    this.gameOver = true;
    this.emit("end", { reason, score: this.score, coins: this.coins, seed: this.seed });
  }

  // input: { moveX, moveY in [-1..1], nitro boolean, driftDir -1/0/1 }
  update(dt, input = {}) {
    if (!this.running || this.gameOver) return;

    // slowmo affects dt
    const timeScale = (this.active.slowmo > 0) ? 0.55 : 1.0;
    dt *= timeScale;

    this.t += dt;

    // difficulty ramp
    const ramp = Math.min(1, this.t / 90);
    const targetSpeed = 14 + ramp * 18;
    this.player.speed = lerp(this.player.speed, Math.min(targetSpeed, this.player.maxSpeed), 0.04);

    // bonus trigger
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

    // drift style (visual + handling)
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
    const maxX = 5.2;
    const maxZ = 2.0;   // back limit
    const minZ = -5.5;  // forward limit

    const dead = 0.06;
    const mxRaw = clamp(input.moveX || 0, -1, 1);
    const myRaw = clamp(input.moveY || 0, -1, 1);

    // If no input, HOLD last target (do not snap back)
    if (Math.abs(mxRaw) > dead) {
      this.player.targetX = mxRaw * maxX;
    }
    if (Math.abs(myRaw) > dead) {
      // map [-1..1] => [maxZ..minZ]
      const targetZ = lerp(maxZ, minZ, (myRaw + 1) * 0.5);
      this.player.targetZ = targetZ;
    }

    // smoother / slightly slower feel
    const xResponse = 9 + this.player.drift.amount * 4;
    const zResponse = 7;
    this.player.x = damp(this.player.x, this.player.targetX, xResponse, dt);
    this.player.zOff = damp(this.player.zOff, this.player.targetZ, zResponse, dt);

    // invulnerability
    this.player.invulnT = Math.max(0, this.player.invulnT - dt);

    // timers
    for (const k of Object.keys(this.active)) {
      this.active[k] = Math.max(0, this.active[k] - dt);
    }

    // spawns
    this.spawnT -= dt;
    this.coinT -= dt;
    this.buffT -= dt;

    const speedZ = this.player.speed + nitroBoost;
    this.distance += speedZ * dt;

    // obstacle spawn (disabled in bonus)
    const spawnEvery = lerp(0.78, 0.40, ramp);
    if (!this.inBonus && this.spawnT <= 0) {
      this.spawnT = spawnEvery;
      this.spawnObstacle(ramp);
    }

    // coins
    if (this.coinT <= 0) {
      this.coinT = this.inBonus ? 0.22 : lerp(0.58, 0.36, ramp);
      this.spawnCoins();
    }

    // buffs
    if (!this.inBonus && this.buffT <= 0) {
      this.buffT = lerp(7.5, 5.2, ramp);
      if (this.rand() < 0.85) this.spawnBuff();
    }

    // move world objects toward player
    this.updateObstacles(dt, speedZ, ramp);
    this.updateCoins(dt, speedZ);
    this.updateBuffs(dt, speedZ);

    // scoring
    const mult = (this.active.scorex2 > 0) ? 2 : 1;
    this.score += (speedZ * dt) * this.combo * mult;

    // combo decay
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT <= 0) this.combo = lerp(this.combo, 1, 0.08);

    // collisions
    this.handleCollisions(speedZ);

    // clean up
    this.obstacles = this.obstacles.filter(o => o.z > -180 && o.z < 30);
    this.coinPacks = this.coinPacks.filter(c => c.z > -180 && c.z < 30 && c.alive);
    this.buffs = this.buffs.filter(b => b.z > -180 && b.z < 30 && b.alive);
  }

  spawnObstacle(ramp = 0) {
    const kind = (this.rand() < 0.18 + ramp * 0.10) ? "truck" : "car";
    const w = (kind === "truck") ? 1.35 : 1.05;
    const l = (kind === "truck") ? 2.6 : 2.2;

    const x = lerp(-4.8, 4.8, this.rand());
    const z = -70 - this.rand() * 45;

    const baseSpeed = 8 + ramp * 10;
    const speed = baseSpeed + this.rand() * (6 + ramp * 6);

    // lateral AI: occasionally pick a new lateral target (like lane switching)
    const targetX = clamp(x + (this.rand() - 0.5) * 3.4, -5.2, 5.2);

    this.obstacles.push({
      kind,
      x,
      z,
      targetX,
      speed,
      w,
      l,
      yaw: 0,
      laneMoveT: 0,
      laneMoveCd: 0.3 + this.rand() * 1.1,
    });
  }

  spawnCoins() {
    // spawn a short line/arc of coins (bonus spawns more)
    const count = this.inBonus ? 6 : 4;
    const baseZ = -40 - this.rand() * 35;
    const centerX = lerp(-4.6, 4.6, this.rand());

    for (let i = 0; i < count; i++) {
      const x = clamp(centerX + (i - (count - 1) / 2) * 0.75, -5.2, 5.2);
      const z = baseZ - i * 2.2;
      this.coinPacks.push({ x, z, alive: true, value: 1 });
    }
  }

  spawnBuff() {
    const types = ["magnet", "shield", "scorex2", "slowmo", "invis"];
    const type = types[(this.rand() * types.length) | 0];
    const x = lerp(-4.8, 4.8, this.rand());
    const z = -55 - this.rand() * 50;
    this.buffs.push({ type, x, z, alive: true });
  }

  updateObstacles(dt, speedZ, ramp) {
    for (const o of this.obstacles) {
      // relative motion
      const rel = speedZ - o.speed;
      o.z += rel * dt;

      // lane-switching AI: occasionally pick a new lateral target
      o.laneMoveCd -= dt;
      if (o.laneMoveCd <= 0) {
        o.laneMoveCd = 0.5 + this.rand() * lerp(1.4, 0.8, ramp);

        // avoid targeting directly into player too often; keep it fun
        const prefer = (this.rand() < 0.45) ? (this.player.x + (this.rand() - 0.5) * 2.4) : (this.rand() * 10.4 - 5.2);
        o.targetX = clamp(prefer, -5.2, 5.2);
      }

      // smooth lateral move
      o.x = damp(o.x, o.targetX, 5.5, dt);

      // yaw into turns
      const dx = (o.targetX - o.x);
      o.yaw = lerp(o.yaw, clamp(-dx * 0.18, -0.35, 0.35), 0.08);
    }
  }

  updateCoins(dt, speedZ) {
    const magnetOn = this.active.magnet > 0;
    for (const c of this.coinPacks) {
      c.z += speedZ * dt;

      if (magnetOn) {
        const dz = c.z - (this.player.zOff - 1.2);
        if (Math.abs(dz) < 10) {
          c.x = lerp(c.x, this.player.x, 0.06);
        }
      }
    }
  }

  updateBuffs(dt, speedZ) {
    for (const b of this.buffs) b.z += speedZ * dt;
  }

  handleCollisions(speedZ) {
    // player hitbox
    const px = this.player.x;
    const pz = this.player.zOff;
    const pw = 0.95;
    const pl = 2.0;

    // invis reduces hit probability
    const invis = this.active.invis > 0;

    // obstacles
    for (const o of this.obstacles) {
      // near-miss window
      const dz = Math.abs(o.z - (pz - 0.6));
      const dx = Math.abs(o.x - px);
      const near = (dz < 1.5 && dx < (o.w + 0.9));

      if (near) {
        // count near miss once per obstacle pass
        if (!o._nearTagged && dx > (o.w + 0.10) && dx < (o.w + 0.55)) {
          o._nearTagged = true;
          this.lastNearMiss = this.t;
          this.combo = clamp(this.combo + 0.35, 1, 6);
          this.comboT = 1.1;
          this.stats.nearMisses++;
          this.emit("near", { combo: this.combo });
        }
      }

      // hit check
      if (invis) continue;
      if (this.player.invulnT > 0) continue;

      if (aabb(px, pz, pw, pl, o.x, o.z, o.w, o.l)) {
        // shield blocks
        if (this.active.shield > 0) {
          this.active.shield = Math.max(0, this.active.shield - 1.2);
          this.player.invulnT = 0.55;
          this.stats.hitsBlocked++;
          this.emit("shield_hit", { shield: this.active.shield });
          continue;
        }

        this.player.lives--;
        this.player.invulnT = 1.1;
        this.combo = 1;
        this.comboT = 0;

        this.emit("hit", { lives: this.player.lives });

        if (this.player.lives <= 0) {
          this.end("hit");
        }
      }
    }

    // coins
    for (const c of this.coinPacks) {
      if (!c.alive) continue;
      if (Math.abs(c.z - (pz - 0.6)) < 1.3 && Math.abs(c.x - px) < 1.0) {
        c.alive = false;
        this.coins += c.value || 1;
        this.stats.coinsPicked++;
        this.combo = clamp(this.combo + 0.08, 1, 6);
        this.comboT = 0.55;
        this.emit("coin", { coins: this.coins });
      }
    }

    // buffs
    for (const b of this.buffs) {
      if (!b.alive) continue;
      if (Math.abs(b.z - (pz - 0.6)) < 1.5 && Math.abs(b.x - px) < 1.1) {
        b.alive = false;
        this.stats.buffsPicked++;

        if (b.type === "magnet") this.active.magnet = Math.max(this.active.magnet, 0) + 6.5;
        if (b.type === "shield") this.active.shield = Math.max(this.active.shield, 0) + 4.5;
        if (b.type === "scorex2") this.active.scorex2 = Math.max(this.active.scorex2, 0) + 7.0;
        if (b.type === "slowmo") this.active.slowmo = Math.max(this.active.slowmo, 0) + 4.0;
        if (b.type === "invis") this.active.invis = Math.max(this.active.invis, 0) + 4.0;

        this.emit("buff", { type: b.type, active: { ...this.active }, nitro: { ...this.player.nitro } });
      }
    }
  }

  emit(type, payload) {
    try {
      if (typeof this.onEvent === "function") this.onEvent(type, payload);
    } catch {}
  }
}

// ---------------------------
// Helpers
// ---------------------------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Critically damped smoothing (frame-rate independent)
function damp(current, target, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * t;
}

function aabb(ax, az, aw, al, bx, bz, bw, bl) {
  return (Math.abs(ax - bx) * 2 < (aw + bw)) && (Math.abs(az - bz) * 2 < (al + bl));
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
