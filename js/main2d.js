
/*
  Neon Racer (2D) - Home + Game
  Requirements implemented:
  - Player default car + obstacles: (car, bus, bike) from provided sprites
  - Home layout styled to match reference (background image + panels)
  - Leaderboard shown on right side (localStorage), Leaderboard button removed
  - Editable player name saved locally
  - Modal windows (Garage/Shop/Missions/Daily...) with top-right X close
  - Smooth but faster controls; car remains under control (clamped + smoothed)
  - Moveable joystick (drag the ring to reposition), quick reflex response
  - Difficulty ramps after score 500 very slowly (visible, not frustrating)
  - WebAudio SFX generated (no external files)
*/

(() => {
  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- Storage ----------
  const LS = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
  };

  const KEYS = {
    name: "nr_playerName",
    coins: "nr_coins",
    best: "nr_bestScore",
    joy: "nr_joyPos",
    leaderboard: "nr_leaderboard_v1"
  };

  // ---------- UI ----------
  const screens = {
    loading: $("loading"),
    home: $("home"),
    game: $("game"),
    modalOverlay: $("modalOverlay"),
    modalClose: $("modalClose"),
    modalTitle: $("modalTitle"),
    modalBody: $("modalBody"),
    nameOverlay: $("nameOverlay"),
    nameInput: $("nameInput"),
    playerNameText: $("playerNameText"),
    coinText: $("coinText"),
    leaderList: $("leaderList"),
    homeCarCanvas: $("homeCarCanvas"),

    playBtn: $("playBtn"),
    settingsBtn: $("settingsBtn"),
    editNameBtn: $("editNameBtn"),
    saveNameBtn: $("saveNameBtn"),
    cancelNameBtn: $("cancelNameBtn"),

    gameCanvas: $("gameCanvas"),
    scoreText: $("scoreText"),
    bestText: $("bestText"),
    countdown: $("countdown"),
    pauseBtn: $("pauseBtn"),
    homeBtn: $("homeBtn"),
    gameOver: $("gameOver"),
    finalScoreText: $("finalScoreText"),
    restartBtn: $("restartBtn"),
    goHomeBtn: $("goHomeBtn"),

    joyRoot: $("joyRoot"),
    joyBase: $("joyBase"),
    joyKnob: $("joyKnob"),
  };

  function showScreen(name) {
    screens.home.classList.toggle("hidden", name !== "home");
    screens.game.classList.toggle("hidden", name !== "game");
  }

  function openModal(title, bodyHtml) {
    screens.modalTitle.textContent = title;
    screens.modalBody.innerHTML = bodyHtml;
    screens.modalOverlay.classList.remove("hidden");
  }
  function closeModal() {
    screens.modalOverlay.classList.add("hidden");
  }

  function openNameEdit() {
    screens.nameInput.value = state.playerName;
    screens.nameOverlay.classList.remove("hidden");
    setTimeout(() => screens.nameInput.focus(), 0);
  }
  function closeNameEdit() {
    screens.nameOverlay.classList.add("hidden");
  }

  // ---------- Leaderboard (local) ----------
  function getLeaderboard() {
    return LS.get(KEYS.leaderboard, []);
  }
  function setLeaderboard(list) {
    LS.set(KEYS.leaderboard, list);
  }
  function addScoreToLeaderboard(name, score) {
    const list = getLeaderboard();
    list.push({ name, score, t: Date.now() });
    list.sort((a, b) => b.score - a.score);
    setLeaderboard(list.slice(0, 10));
  }
  function renderLeaderboard() {
    const list = getLeaderboard();
    screens.leaderList.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="leaderName">No scores yet</span><span class="leaderScore">—</span>`;
      screens.leaderList.appendChild(li);
      return;
    }
    list.forEach((row) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="leaderName">${escapeHtml(row.name || "Player")}</span><span class="leaderScore">${row.score}</span>`;
      screens.leaderList.appendChild(li);
    });
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  }

  // ---------- Audio (WebAudio) ----------
  let audioCtx = null;
  let audioOn = true;
  let engineOsc = null;
  let engineGain = null;

  function ensureAudio() {
    if (!audioOn) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
  }

  function beep(freq = 440, dur = 0.08, type = "sine", vol = 0.08) {
    if (!audioOn) return;
    ensureAudio();
    if (!audioCtx) return;

    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function startEngine() {
    if (!audioOn) return;
    ensureAudio();
    if (!audioCtx || engineOsc) return;
    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 90;
    engineGain.gain.value = 0.0001;
    engineOsc.connect(engineGain).connect(audioCtx.destination);
    engineOsc.start();
    // fade in
    const t0 = audioCtx.currentTime;
    engineGain.gain.exponentialRampToValueAtTime(0.04, t0 + 0.25);
  }

  function stopEngine() {
    if (!engineOsc || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    engineGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    engineOsc.stop(t0 + 0.22);
    engineOsc = null;
    engineGain = null;
  }

  // ---------- Assets ----------
  const assets = {
    player: new Image(),
    obsYellow: new Image(),
    obsBus: new Image(),
    obsBike: new Image(),
  };

  function loadImage(img, src) {
    return new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load " + src));
      img.src = src;
    });
  }

  async function loadAssets() {
    // Provided sprites (created into assets folder)
    await Promise.all([
      loadImage(assets.player, "assets/player_car.png"),
      loadImage(assets.obsYellow, "assets/obstacle_yellow.png"),
      loadImage(assets.obsBus, "assets/obstacle_bus.png"),
      loadImage(assets.obsBike, "assets/obstacle_bike.png"),
    ]);
  }

  // ---------- Home preview ----------
  function drawHomeCarPreview() {
    const c = screens.homeCarCanvas;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;

    ctx.clearRect(0, 0, w, h);

    // simple "garage floor"
    ctx.fillStyle = "rgba(0,0,0,0.0)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 0; i < 7; i++) {
      const y = 24 + i * 30;
      ctx.fillRect(30, y, w - 60, 1);
    }

    // car
    const carW = 190;
    const carH = carW * (assets.player.height / assets.player.width);
    ctx.drawImage(assets.player, (w - carW) / 2, (h - carH) / 2, carW, carH);
  }

  // ---------- Game ----------
  const state = {
    playerName: "Player123",
    coins: 75,
    best: 0,

    running: false,
    paused: false,
    score: 0,

    // input
    keyLeft: false,
    keyRight: false,
    joyX: 0, // -1..1

    // joystick placement
    joyPos: { x: 22, y: 22 }, // left/bottom padding; stored as px from left/bottom
  };

  const game = {
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,

    // road
    roadW: 520,
    roadX: 0,

    // player physics
    px: 0,
    py: 0,
    vx: 0,

    // movement tuning (fast + under control)
    maxSideSpeed: 980,     // px/s
    accel: 2200,           // px/s^2
    damping: 0.86,         // velocity damping per frame-ish

    // scrolling
    scroll: 0,
    baseForward: 780,      // px/s
    forward: 780,          // px/s (dynamic)

    // obstacles
    obstacles: [],
    spawnT: 0,
    spawnInterval: 900,    // ms
  };

  const obstacleTypes = [
    { id:"car",  img: () => assets.obsYellow, w: 86,  h: 150,  hitPad: 10 },
    { id:"bus",  img: () => assets.obsBus,    w: 92,  h: 190,  hitPad: 10 },
    { id:"bike", img: () => assets.obsBike,   w: 64,  h: 150,  hitPad: 8  },
  ];

  function resizeGameCanvas() {
    const c = screens.gameCanvas;
    const rect = c.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    game.dpr = dpr;

    c.width = Math.floor(rect.width * dpr);
    c.height = Math.floor(rect.height * dpr);
    game.w = c.width;
    game.h = c.height;
    game.ctx = c.getContext("2d");

    // road size relative to screen
    game.roadW = Math.min(560 * dpr, game.w * 0.66);
    game.roadX = (game.w - game.roadW) / 2;

    // player start
    game.px = game.w / 2;
    game.py = game.h - 220 * dpr;
  }

  function resetGame() {
    state.score = 0;
    game.obstacles.length = 0;
    game.spawnT = 0;
    game.spawnInterval = 900;
    game.scroll = 0;
    game.forward = game.baseForward;
    game.px = game.w / 2;
    game.vx = 0;
    state.running = false;
    state.paused = false;
    screens.scoreText.textContent = "0";
  }

  function difficultyFromScore(score) {
    // Visible but very slow ramp AFTER 500.
    // - Slightly faster forward speed
    // - Slightly faster spawn
    // - Very small chance of double-spawn
    const over = Math.max(0, score - 500);
    const speedBoost = Math.min(120, over * 0.08);           // +120 px/s max, very slow
    const spawnBoost = Math.min(160, over * 0.05);           // reduce interval up to 160ms
    const doubleChance = Math.min(0.18, over * 0.00015);     // 0 → 0.18 gradually

    return {
      forward: game.baseForward + speedBoost,
      spawnInterval: 900 - spawnBoost,
      doubleChance
    };
  }

  function spawnObstacle() {
    const dpr = game.dpr;
    const roadLeft = game.roadX + 44 * dpr;
    const roadRight = game.roadX + game.roadW - 44 * dpr;

    const t = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
    const laneCount = 3;
    const laneW = (roadRight - roadLeft) / laneCount;
    const lane = Math.floor(Math.random() * laneCount);
    const x = roadLeft + laneW * lane + laneW / 2;

    const scale = 1.0 + (t.id === "bike" ? 0.05 : 0.0);
    const w = t.w * dpr * scale;
    const h = t.h * dpr * scale;

    game.obstacles.push({
      type: t,
      x,
      y: -h - 20 * dpr,
      w,
      h,
      vy: game.forward * (0.92 + Math.random() * 0.12),
    });
  }

  function update(dt) {
    if (!state.running || state.paused) return;

    // difficulty
    const diff = difficultyFromScore(state.score);
    game.forward = diff.forward;
    game.spawnInterval = diff.spawnInterval;

    // score
    state.score += Math.floor(dt * 60); // about 60 points per second
    screens.scoreText.textContent = String(state.score);

    // engine pitch
    if (audioCtx && engineOsc) {
      const target = 90 + (game.forward - game.baseForward) * 0.12;
      engineOsc.frequency.setTargetAtTime(target, audioCtx.currentTime, 0.08);
    }

    // input
    const keyInput = (state.keyLeft ? -1 : 0) + (state.keyRight ? 1 : 0);
    const input = clamp(keyInput + state.joyX, -1, 1);

    // physics: accelerate toward input * maxSideSpeed with smoothing and damping
    const targetV = input * game.maxSideSpeed;
    const dv = clamp(targetV - game.vx, -game.accel * dt, game.accel * dt);
    game.vx += dv;
    game.vx *= Math.pow(game.damping, dt * 60);

    game.px += game.vx * dt;

    // clamp to road bounds
    const dpr = game.dpr;
    const halfCar = 46 * dpr;
    const minX = game.roadX + 44 * dpr + halfCar;
    const maxX = game.roadX + game.roadW - 44 * dpr - halfCar;
    game.px = clamp(game.px, minX, maxX);

    // scroll background
    game.scroll += game.forward * dt;

    // spawn
    game.spawnT += dt * 1000;
    while (game.spawnT >= game.spawnInterval) {
      game.spawnT -= game.spawnInterval;
      spawnObstacle();
      if (Math.random() < diff.doubleChance) {
        // very occasional extra obstacle, but keep space
        setTimeout(() => spawnObstacle(), 110);
      }
    }

    // obstacles update
    for (let i = game.obstacles.length - 1; i >= 0; i--) {
      const o = game.obstacles[i];
      o.y += o.vy * dt;
      // cleanup
      if (o.y > game.h + 240 * dpr) game.obstacles.splice(i, 1);
    }

    // collision
    const playerRect = getPlayerRect();
    for (const o of game.obstacles) {
      const pad = o.type.hitPad * dpr;
      const r = {
        x: o.x - o.w / 2 + pad,
        y: o.y + pad,
        w: o.w - pad * 2,
        h: o.h - pad * 2
      };
      if (aabb(playerRect, r)) {
        crash();
        break;
      }
    }
  }

  function getPlayerRect() {
    const dpr = game.dpr;
    const w = 88 * dpr;
    const h = w * (assets.player.height / assets.player.width);
    const x = game.px - w / 2;
    const y = game.py - h / 2;
    return { x: x + 10*dpr, y: y + 14*dpr, w: w - 20*dpr, h: h - 26*dpr };
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function draw() {
    const ctx = game.ctx;
    if (!ctx) return;

    // clear
    ctx.clearRect(0, 0, game.w, game.h);

    // background
    ctx.fillStyle = "#04060b";
    ctx.fillRect(0, 0, game.w, game.h);

    // subtle vignette
    const vg = ctx.createRadialGradient(game.w/2, game.h*0.6, game.h*0.2, game.w/2, game.h*0.6, game.h*0.9);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,game.w,game.h);

    // road
    drawRoad(ctx);

    // obstacles
    for (const o of game.obstacles) {
      const img = o.type.img();
      ctx.drawImage(img, o.x - o.w/2, o.y, o.w, o.h);
    }

    // player
    drawPlayer(ctx);
  }

  function drawRoad(ctx) {
    const dpr = game.dpr;

    // road panel
    ctx.fillStyle = "rgba(10,16,26,0.85)";
    ctx.fillRect(game.roadX, 0, game.roadW, game.h);

    // side glow
    ctx.fillStyle = "rgba(0,246,255,0.12)";
    ctx.fillRect(game.roadX, 0, 8*dpr, game.h);
    ctx.fillRect(game.roadX + game.roadW - 8*dpr, 0, 8*dpr, game.h);

    // lane lines
    const laneCount = 3;
    const laneW = game.roadW / laneCount;

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2 * dpr;
    for (let i = 1; i < laneCount; i++) {
      const x = game.roadX + i * laneW;
      ctx.beginPath();
      const dash = 34 * dpr;
      const gap = 26 * dpr;
      const offset = (game.scroll * 0.6) % (dash + gap);
      for (let y = -dash; y < game.h + dash; y += (dash + gap)) {
        ctx.moveTo(x, y + offset);
        ctx.lineTo(x, y + offset + dash);
      }
      ctx.stroke();
    }

    // center glow
    ctx.fillStyle = "rgba(0,246,255,0.06)";
    ctx.fillRect(game.roadX + game.roadW/2 - 2*dpr, 0, 4*dpr, game.h);
  }

  function drawPlayer(ctx) {
    const dpr = game.dpr;
    const w = 96 * dpr;
    const h = w * (assets.player.height / assets.player.width);
    const x = game.px - w / 2;
    const y = game.py - h / 2;

    // soft neon shadow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.filter = "blur(" + (6*dpr) + "px)";
    ctx.drawImage(assets.player, x, y + 6*dpr, w, h);
    ctx.restore();
    ctx.filter = "none";
    ctx.globalAlpha = 1;

    ctx.drawImage(assets.player, x, y, w, h);
  }

  // ---------- Loop ----------
  let lastT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (!state.running || state.paused) {
      draw(); // still draw
      lastT = t;
      return;
    }
    if (!lastT) lastT = t;
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    update(dt);
    draw();
  }

  // ---------- Countdown + Start ----------
  async function startGame() {
    ensureAudio();
    stopEngine();
    resetGame();
    resizeGameCanvas();

    showScreen("game");
    screens.gameOver.classList.add("hidden");
    screens.countdown.classList.remove("hidden");

    // countdown 3-2-1-GO
    for (const n of ["3", "2", "1", "GO"]) {
      screens.countdown.textContent = n;
      beep(n === "GO" ? 880 : 660, n === "GO" ? 0.12 : 0.08, "square", 0.06);
      await wait(520);
    }
    screens.countdown.classList.add("hidden");

    state.running = true;
    state.paused = false;
    startEngine();
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function crash() {
    if (!state.running) return;
    state.running = false;
    stopEngine();
    beep(140, 0.18, "sawtooth", 0.10);
    beep(90, 0.22, "triangle", 0.08);

    // best
    state.best = Math.max(state.best, state.score);
    LS.set(KEYS.best, state.best);
    screens.bestText.textContent = String(state.best);

    // leaderboard
    addScoreToLeaderboard(state.playerName, state.score);
    renderLeaderboard();

    // show overlay
    screens.finalScoreText.textContent = String(state.score);
    screens.gameOver.classList.remove("hidden");
  }

  // ---------- Input ----------
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") state.keyLeft = true;
    if (e.key === "ArrowRight" || e.key === "d") state.keyRight = true;

    if (e.key === "Escape") {
      if (!screens.modalOverlay.classList.contains("hidden")) closeModal();
      if (!screens.nameOverlay.classList.contains("hidden")) closeNameEdit();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a") state.keyLeft = false;
    if (e.key === "ArrowRight" || e.key === "d") state.keyRight = false;
  });

  // Moveable joystick: drag ring to move; drag knob to steer.
  function setupJoystick() {
    // restore position (px from left/bottom)
    const saved = LS.get(KEYS.joy, null);
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
      state.joyPos = { x: saved.x, y: saved.y };
    }
    applyJoyPos();

    const base = screens.joyBase;
    const knob = screens.joyKnob;
    const root = screens.joyRoot;

    let mode = "none"; // "move" | "steer"
    let startX = 0, startY = 0;
    let baseStartX = 0, baseStartY = 0;
    let pointerId = null;

    const rectCenter = () => {
      const r = base.getBoundingClientRect();
      return { cx: r.left + r.width/2, cy: r.top + r.height/2, r: r.width/2 };
    };

    root.addEventListener("pointerdown", (e) => {
      pointerId = e.pointerId;
      root.setPointerCapture(pointerId);

      const { cx, cy, r } = rectCenter();
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);

      startX = e.clientX;
      startY = e.clientY;
      baseStartX = state.joyPos.x;
      baseStartY = state.joyPos.y;

      // If touching near outer ring -> move joystick
      // If touching near center -> steer
      mode = (dist > r * 0.62) ? "move" : "steer";

      if (mode === "steer") updateKnob(dx, dy, r);
      e.preventDefault();
    }, { passive:false });

    root.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointerId) return;

      if (mode === "move") {
        // joystick coordinates stored from left/bottom
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        // convert dy to bottom space (positive up)
        state.joyPos.x = clamp(baseStartX + dx, 10, window.innerWidth - 170);
        state.joyPos.y = clamp(baseStartY - dy, 10, window.innerHeight - 240);
        applyJoyPos();
      } else if (mode === "steer") {
        const { cx, cy, r } = rectCenter();
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        updateKnob(dx, dy, r);
      }
      e.preventDefault();
    }, { passive:false });

    function endPointer(e) {
      if (e.pointerId !== pointerId) return;
      if (mode === "move") {
        LS.set(KEYS.joy, state.joyPos);
      }
      mode = "none";
      pointerId = null;
      centerKnob();
      state.joyX = 0;
      e.preventDefault();
    }
    root.addEventListener("pointerup", endPointer, { passive:false });
    root.addEventListener("pointercancel", endPointer, { passive:false });

    function updateKnob(dx, dy, radius) {
      const max = radius * 0.52;
      const dist = Math.hypot(dx, dy);
      const nx = dist ? dx / dist : 0;
      const ny = dist ? dy / dist : 0;
      const amt = Math.min(max, dist);
      const kx = nx * amt;
      const ky = ny * amt;

      knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

      // steering uses X only (quick reflex)
      const xNorm = clamp(kx / max, -1, 1);
      // apply gentle curve for control
      state.joyX = Math.sign(xNorm) * Math.pow(Math.abs(xNorm), 0.75);
    }

    function centerKnob() {
      knob.style.transform = "translate(-50%,-50%)";
    }
  }

  function applyJoyPos() {
    screens.joyRoot.style.left = state.joyPos.x + "px";
    screens.joyRoot.style.bottom = state.joyPos.y + "px";
  }

  // ---------- Buttons ----------
  function wireButtons() {
    // Home actions / nav open modal
    document.querySelectorAll("[data-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-open");
        const titleMap = {
          dailyRewardModal: "Daily Reward",
          dailyCrateModal: "Daily Crate",
          dailyTasksModal: "Daily Tasks",
          garageModal: "Garage",
          shopModal: "Shop",
          missionsModal: "Missions",
        };
        const title = titleMap[id] || "Menu";
        openModal(title, modalBodyFor(id));
        beep(720, 0.06, "square", 0.05);
      });
    });

    screens.modalClose.addEventListener("click", () => { closeModal(); beep(520, 0.05, "sine", 0.04); });
    screens.modalOverlay.addEventListener("click", (e) => {
      if (e.target === screens.modalOverlay) closeModal();
    });

    screens.settingsBtn.addEventListener("click", () => {
      openModal("Settings", `
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="toggleAudioBtn" class="primary">${audioOn ? "Audio: ON" : "Audio: OFF"}</button>
          <button id="resetJoyBtn">Reset Joystick Position</button>
          <button id="resetBoardBtn">Reset Leaderboard</button>
        </div>
        <p style="margin-top:14px; color:rgba(255,255,255,.78); font-weight:700;">
          Tip: On mobile, drag the joystick ring to move it. Drag the knob to steer.
        </p>
      `);
      setTimeout(() => {
        const t = $("toggleAudioBtn");
        const rj = $("resetJoyBtn");
        const rb = $("resetBoardBtn");
        if (t) t.onclick = () => {
          audioOn = !audioOn;
          stopEngine();
          openModal("Settings", `
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button id="toggleAudioBtn" class="primary">${audioOn ? "Audio: ON" : "Audio: OFF"}</button>
              <button id="resetJoyBtn">Reset Joystick Position</button>
              <button id="resetBoardBtn">Reset Leaderboard</button>
            </div>
            <p style="margin-top:14px; color:rgba(255,255,255,.78); font-weight:700;">
              Tip: On mobile, drag the joystick ring to move it. Drag the knob to steer.
            </p>
          `);
          beep(760, 0.06, "square", 0.05);
        };
        if (rj) rj.onclick = () => {
          state.joyPos = { x: 22, y: 22 };
          applyJoyPos();
          LS.set(KEYS.joy, state.joyPos);
          beep(700, 0.06, "square", 0.05);
        };
        if (rb) rb.onclick = () => {
          setLeaderboard([]);
          renderLeaderboard();
          beep(640, 0.06, "square", 0.05);
        };
      }, 0);
    });

    screens.editNameBtn.addEventListener("click", () => { openNameEdit(); beep(700, 0.05, "sine", 0.04); });
    screens.saveNameBtn.addEventListener("click", () => {
      const name = (screens.nameInput.value || "").trim().slice(0, 16);
      state.playerName = name || "Player123";
      LS.set(KEYS.name, state.playerName);
      screens.playerNameText.textContent = state.playerName;
      closeNameEdit();
      beep(880, 0.06, "square", 0.05);
    });
    screens.cancelNameBtn.addEventListener("click", () => closeNameEdit());
    screens.nameOverlay.addEventListener("click", (e) => {
      if (e.target === screens.nameOverlay) closeNameEdit();
    });

    screens.playBtn.addEventListener("click", async () => {
      await startGame();
      beep(980, 0.07, "square", 0.06);
    });

    screens.pauseBtn.addEventListener("click", () => {
      if (!state.running) return;
      state.paused = !state.paused;
      screens.pauseBtn.textContent = state.paused ? "Resume" : "Pause";
      if (state.paused) stopEngine(); else startEngine();
      beep(state.paused ? 420 : 840, 0.06, "square", 0.05);
    });

    const goHome = () => {
      state.running = false;
      state.paused = false;
      stopEngine();
      showScreen("home");
      screens.pauseBtn.textContent = "Pause";
      renderLeaderboard();
      drawHomeCarPreview();
    };
    screens.homeBtn.addEventListener("click", goHome);
    screens.goHomeBtn.addEventListener("click", goHome);

    screens.restartBtn.addEventListener("click", async () => {
      screens.gameOver.classList.add("hidden");
      await startGame();
    });

    window.addEventListener("resize", () => {
      if (!screens.game.classList.contains("hidden")) resizeGameCanvas();
    });
  }

  function modalBodyFor(id) {
    switch (id) {
      case "dailyRewardModal":
        return `<p>Daily reward is ready!</p><button id="claimRewardBtn" class="primary">Claim +100 coins</button>`;
      case "dailyCrateModal":
        return `<p>Open your free crate.</p><button id="openCrateBtn" class="primary">Open</button>`;
      case "dailyTasksModal":
        return `<ul>
          <li>Play 1 run</li>
          <li>Score 500+</li>
          <li>Dodge 10 vehicles</li>
        </ul>`;
      case "garageModal":
        return `<p>Rookie Racer (Default)</p><p style="color:rgba(255,255,255,.75); font-weight:700;">More cars/skins can be added later.</p>`;
      case "shopModal":
        return `<p>Shop is coming soon.</p><p style="color:rgba(255,255,255,.75); font-weight:700;">We can add skins, crates, and upgrades here.</p>`;
      case "missionsModal":
        return `<p>Missions are coming soon.</p><p style="color:rgba(255,255,255,.75); font-weight:700;">Daily + weekly missions can be added here.</p>`;
      default:
        return `<p>Coming soon.</p>`;
    }
  }

  // After opening modal, wire any modal buttons (simple)
  const modalObserver = new MutationObserver(() => {
    const claim = $("claimRewardBtn");
    if (claim) {
      claim.onclick = () => {
        state.coins += 100;
        LS.set(KEYS.coins, state.coins);
        screens.coinText.textContent = String(state.coins);
        claim.disabled = true;
        claim.textContent = "Claimed!";
        beep(980, 0.08, "square", 0.06);
      };
    }
    const openCrate = $("openCrateBtn");
    if (openCrate) {
      openCrate.onclick = () => {
        // tiny reward for now
        const bonus = 25 + Math.floor(Math.random() * 75);
        state.coins += bonus;
        LS.set(KEYS.coins, state.coins);
        screens.coinText.textContent = String(state.coins);
        openCrate.disabled = true;
        openCrate.textContent = `Opened! +${bonus}`;
        beep(840, 0.07, "square", 0.06);
      };
    }
  });

  // ---------- Init ----------
  async function init() {
    // Restore state
    state.playerName = LS.get(KEYS.name, "Player123") || "Player123";
    state.coins = LS.get(KEYS.coins, 75) ?? 75;
    state.best = LS.get(KEYS.best, 0) ?? 0;

    screens.playerNameText.textContent = state.playerName;
    screens.coinText.textContent = String(state.coins);
    screens.bestText.textContent = String(state.best);

    wireButtons();
    modalObserver.observe(screens.modalBody, { childList: true, subtree: true });

    // Show home immediately; load assets in background
    showScreen("home");
    screens.loading.classList.remove("hidden");

    try {
      await loadAssets();
      drawHomeCarPreview();
      renderLeaderboard();
      setupJoystick();
      resizeGameCanvas();
      requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      openModal("Load Error", `<p>Failed to load assets. Make sure you are running via a local server (not file://).</p><pre style="white-space:pre-wrap; color:rgba(255,255,255,.75);">${escapeHtml(err.message || String(err))}</pre>`);
    } finally {
      screens.loading.classList.add("hidden");
      screens.home.classList.remove("hidden");
    }
  }

  init();
})();
