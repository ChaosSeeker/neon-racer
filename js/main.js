import { GameCore } from "./gameCore.js";
import { Renderer3D } from "./renderer3d.js";
import { GameAudio } from "./audio.js";
import { Leaderboard } from "./leaderboard.js";

const canvas = document.getElementById("game");

const ui = {
  // Home layout
  home: document.getElementById("home"),
  howPanel: document.getElementById("howPanel"),

  chipPlayer: document.getElementById("chipPlayer"),
  chipRank: document.getElementById("chipRank"),
  chipBank: document.getElementById("chipBank"),
  chipBest: document.getElementById("chipBest"),

  playerName: document.getElementById("playerName"),
  btnSaveName: document.getElementById("btn-save-name"),
  btnClaimReward: document.getElementById("btn-claim-reward"),
  rewardInfo: document.getElementById("rewardInfo"),

  btnCrate: document.getElementById("btn-crate"),
  crateStatus: document.getElementById("crateStatus"),
  crateInfo: document.getElementById("crateInfo"),

  missions: document.getElementById("missions"),

  shop: document.getElementById("shop"),
  shopInfo: document.getElementById("shopInfo"),
  skins: document.getElementById("skins"),

  lbStatus: document.getElementById("lbStatus"),
  leaderboard: document.getElementById("leaderboard"),
  btnSubmit: document.getElementById("btn-submit"),

  btnHow: document.getElementById("btn-how"),
  btnFeedback: document.getElementById("btn-feedback"),

  // Topbar controls
  btnAudio: document.getElementById("btn-audio"),
  btnFullscreen: document.getElementById("btn-fullscreen"),
  btnPlayTop: document.getElementById("btn-play-top"),

  // Play buttons
  btnPlay: document.getElementById("btn-play"),

  // HUD / in-game
  hud: document.getElementById("hud"),
  btnMenu: document.getElementById("btn-menu"),
  score: document.getElementById("score"),
  coins: document.getElementById("coins"),
  combo: document.getElementById("combo"),
  lives: document.getElementById("lives"),
  nitro: document.getElementById("nitro"),
  drift: document.getElementById("drift"),
  bonus: document.getElementById("bonus"),
  pillBonus: document.getElementById("pillBonus"),
  ghost: document.getElementById("ghost"),
  pillGhost: document.getElementById("pillGhost"),

  // Countdown / gameover
  countdown: document.getElementById("countdown"),
  countText: document.querySelector("#countdown .count"),

  gameover: document.getElementById("gameover"),
  finalScore: document.getElementById("finalScore"),
  finalCoins: document.getElementById("finalCoins"),
  btnRestart: document.getElementById("btn-restart"),
  btnHome: document.getElementById("btn-home"),
  btnShare: document.getElementById("btn-share"),
  shareOut: document.getElementById("shareOut"),
  btnSubmit2: document.getElementById("btn-submit2"),

  // Menu overlay
  menu: document.getElementById("menu"),
  btnResume: document.getElementById("btn-resume"),
  btnRestart2: document.getElementById("btn-restart2"),
  btnHome2: document.getElementById("btn-home2"),
  btnSubmit3: document.getElementById("btn-submit3"),

  toast: document.getElementById("toast"),
  rotateOverlay: document.getElementById("rotateOverlay"),

  // Mobile controls
  touchUi: document.getElementById("touchUi"),
  joy: document.getElementById("joystick"),
  joyBase: document.getElementById("joyBase"),
  joyKnob: document.getElementById("joyKnob"),
  btnNitro: document.getElementById("btnNitro"),
  btnDrift: document.getElementById("btnDrift"),
};

const game = new GameCore();
const renderer = new Renderer3D(canvas);
const audio = new GameAudio();

let last = performance.now();
let mode = "home"; // home | countdown | run | gameover | menu

let input = { moveX: 0, moveY: 0, nitro: false, driftDir: 0 };

// -------- persistent state (old homepage features preserved) --------
const LS = {
  name: "nr_name",
  bank: "nr_bank",
  best: "nr_best",
  skin: "nr_skin",
  skinOwned: "nr_skins_owned",
  shop: "nr_shop_loadout",
  rewardDay: "nr_reward_day",
  crateDay: "nr_crate_day",
  missionsDay: "nr_missions_day",
  missions: "nr_missions",
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getNum(k, def = 0) {
  const v = Number(localStorage.getItem(k));
  return Number.isFinite(v) ? v : def;
}
function setNum(k, v) { localStorage.setItem(k, String(Math.floor(v))); }
function getStr(k, def = "") { return localStorage.getItem(k) ?? def; }
function setStr(k, v) { localStorage.setItem(k, String(v)); }

function getJSON(k, def) {
  try {
    const s = localStorage.getItem(k);
    if (!s) return def;
    return JSON.parse(s);
  } catch { return def; }
}
function setJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// -------- Rank (simple) --------
function rankFromBest(best) {
  if (best >= 15000) return "Legend";
  if (best >= 8000) return "Elite";
  if (best >= 3000) return "Pro";
  if (best >= 1000) return "Skilled";
  return "Rookie";
}

// -------- Skins (cosmetic) --------
const SKINS = [
  { id: "cyanPink", name: "Cyan / Pink", price: 0, ownedDefault: true, body: 0x00ffff, glow: 0xff4dff },
  { id: "mintBlue", name: "Mint / Blue", price: 250, body: 0x7cffea, glow: 0x2a6cff },
  { id: "goldMagenta", name: "Gold / Magenta", price: 400, body: 0xffd24d, glow: 0xff6adf },
  { id: "redIce", name: "Red / Ice", price: 350, body: 0xff4b5c, glow: 0x7cffea },
];

function getOwnedSkins() {
  const owned = new Set(getJSON(LS.skinOwned, []));
  owned.add("cyanPink");
  return owned;
}
function setOwnedSkins(set) { setJSON(LS.skinOwned, [...set]); }

function getActiveSkinId() {
  const id = getStr(LS.skin, "cyanPink");
  return SKINS.some(s => s.id === id) ? id : "cyanPink";
}

// -------- Shop Loadout (queued buffs) --------
const SHOP = [
  { id: "nitro", name: "Nitro Boost", price: 120, desc: "Start next run with a nitro burst." },
  { id: "shield", name: "Shield", price: 160, desc: "Start next run with a short shield." },
  { id: "magnet", name: "Magnet", price: 140, desc: "Start next run with magnet active." },
  { id: "scorex2", name: "Score x2", price: 200, desc: "Start next run with x2 score for a bit." },
];

function getLoadout() {
  return getJSON(LS.shop, { nitro: 0, shield: 0, magnet: 0, scorex2: 0 });
}
function setLoadout(v) { setJSON(LS.shop, v); }

// -------- Missions --------
function genMissions() {
  // Simple missions that can be completed based on best/run stats we track locally.
  // You can expand later with real in-run hooks.
  const pool = [
    { id: "play1", text: "Play 1 run", reward: 60, type: "plays", target: 1 },
    { id: "play3", text: "Play 3 runs", reward: 120, type: "plays", target: 3 },
    { id: "score500", text: "Score 500+", reward: 80, type: "best", target: 500 },
    { id: "score1500", text: "Score 1500+", reward: 140, type: "best", target: 1500 },
    { id: "bank500", text: "Reach 500 bank coins", reward: 150, type: "bank", target: 500 },
  ];
  // pick 3 distinct
  const pick = [];
  while (pick.length < 3) {
    const m = pool[Math.floor(Math.random() * pool.length)];
    if (!pick.some(x => x.id === m.id)) pick.push({ ...m, claimed: false });
  }
  return pick;
}

function ensureDailyMissions() {
  const day = todayKey();
  const old = getStr(LS.missionsDay, "");
  if (old !== day) {
    setStr(LS.missionsDay, day);
    setJSON(LS.missions, genMissions());
  }
}

function getMissions() {
  ensureDailyMissions();
  return getJSON(LS.missions, genMissions());
}

function setMissions(m) { setJSON(LS.missions, m); }

// Track plays today (for missions)
function playsKey() { return `nr_plays_${todayKey()}`; }
function getPlaysToday() { return getNum(playsKey(), 0); }
function incPlaysToday() { setNum(playsKey(), getPlaysToday() + 1); }

// -------- UI helpers --------
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add("show");
  setTimeout(() => ui.toast.classList.remove("show"), 1200);
}

function showOverlay(el, v) { el.classList.toggle("visible", !!v); }

function setMode(next) {
  mode = next;

  if (mode === "home") {
    document.body.classList.add("home-mode");
    ui.home.classList.add("visible");
    showOverlay(ui.gameover, false);
    showOverlay(ui.menu, false);
    showOverlay(ui.countdown, false);
    renderer.setMode("home");
    if (ui.touchUi) ui.touchUi.classList.add("hidden");
  }

  if (mode === "run") {
    document.body.classList.remove("home-mode");
    ui.home.classList.remove("visible");
    showOverlay(ui.gameover, false);
    showOverlay(ui.menu, false);
    renderer.setMode("game");
    if (ui.touchUi) ui.touchUi.classList.toggle("hidden", !isTouch);
  }

  if (mode === "gameover") {
    showOverlay(ui.gameover, true);
    if (ui.touchUi) ui.touchUi.classList.add("hidden");
  }

  if (mode === "menu") {
    showOverlay(ui.menu, true);
    if (ui.touchUi) ui.touchUi.classList.add("hidden");
  }
}

// -------- Audio --------
async function ensureAudio() {
  await audio.start();
  if (audio.ctx?.state === "suspended") await audio.ctx.resume();
}

// -------- Home widgets (shop/skins/missions/leaderboard) --------
function refreshTopbar() {
  const nm = getStr(LS.name, "Gamer");
  const bank = getNum(LS.bank, 0);
  const best = getNum(LS.best, 0);
  ui.chipPlayer.textContent = nm || "Gamer";
  ui.chipBank.textContent = String(bank);
  ui.chipBest.textContent = String(best);
  ui.chipRank.textContent = rankFromBest(best);

  // Also keep input in sync
  ui.playerName.value = nm || "Gamer";
}

function refreshSkins() {
  const bank = getNum(LS.bank, 0);
  const owned = getOwnedSkins();
  const active = getActiveSkinId();

  ui.skins.innerHTML = "";

  SKINS.forEach(s => {
    const isOwned = owned.has(s.id);
    const isActive = active === s.id;

    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="top">
        <div class="name">${escapeHtml(s.name)}</div>
        <span class="qty">${isActive ? "ON" : isOwned ? "OWNED" : s.price + "🪙"}</span>
      </div>
      <div class="row" style="gap:8px">
        <div class="dot" style="background:#${s.body.toString(16).padStart(6,"0")}"></div>
        <div class="skinBar" style="background:linear-gradient(90deg,#${s.body.toString(16).padStart(6,"0")},#${s.glow.toString(16).padStart(6,"0")})"></div>
        <div class="dot" style="background:#${s.glow.toString(16).padStart(6,"0")}"></div>
      </div>
      <div class="muted" style="font-size:12px">Cosmetic skin</div>
      <div class="row">
        <button class="btn ${isActive ? "primary" : ""}" data-skin="${s.id}">
          ${isActive ? "Selected" : isOwned ? "Select" : "Buy"}
        </button>
      </div>
    `;

    const btn = div.querySelector("button");
    btn.onclick = () => {
      if (isActive) return;

      if (!isOwned) {
        if (bank < s.price) return toast("Not enough bank coins");
        setNum(LS.bank, bank - s.price);
        owned.add(s.id);
        setOwnedSkins(owned);
        toast(`Bought ${s.name}!`);
      }

      setStr(LS.skin, s.id);
      applySkinToRenderer();
      refreshTopbar();
      refreshSkins();
    };

    ui.skins.appendChild(div);
  });
}

function refreshShop() {
  const bank = getNum(LS.bank, 0);
  const loadout = getLoadout();

  ui.shop.innerHTML = "";
  SHOP.forEach(it => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="top">
        <div class="name">${escapeHtml(it.name)}</div>
        <span class="qty">x${loadout[it.id] || 0}</span>
      </div>
      <div class="muted" style="font-size:12px">${escapeHtml(it.desc)}</div>
      <div class="row" style="margin-top:8px">
        <button class="btn" data-buy="${it.id}">Buy • ${it.price}🪙</button>
        <button class="btn" data-clear="${it.id}">Clear</button>
      </div>
    `;

    div.querySelector(`[data-buy="${it.id}"]`).onclick = () => {
      if (bank < it.price) return toast("Not enough bank coins");
      setNum(LS.bank, bank - it.price);
      const next = { ...loadout };
      next[it.id] = (next[it.id] || 0) + 1;
      setLoadout(next);
      toast(`Queued ${it.name}`);
      refreshTopbar();
      refreshShop();
    };

    div.querySelector(`[data-clear="${it.id}"]`).onclick = () => {
      const next = { ...loadout };
      next[it.id] = 0;
      setLoadout(next);
      toast(`Cleared ${it.name}`);
      refreshShop();
    };

    ui.shop.appendChild(div);
  });

  const total = Object.values(loadout).reduce((a, b) => a + (b || 0), 0);
  ui.shopInfo.textContent = total > 0
    ? `Queued buffs for next run: ${total}`
    : `No queued buffs.`;
}

function refreshMissions() {
  const bank = getNum(LS.bank, 0);
  const best = getNum(LS.best, 0);
  const plays = getPlaysToday();

  const missions = getMissions();

  ui.missions.innerHTML = "";
  missions.forEach((m, idx) => {
    let progress = 0;
    if (m.type === "plays") progress = plays;
    if (m.type === "best") progress = best;
    if (m.type === "bank") progress = bank;

    const done = progress >= m.target;
    const claimed = !!m.claimed;

    const row = document.createElement("div");
    row.className = "lbRow";
    row.innerHTML = `
      <span>
        <b>${escapeHtml(m.text)}</b><br/>
        <span class="small">Progress: ${Math.min(progress, m.target)} / ${m.target}</span>
      </span>
      <span class="row" style="gap:8px">
        <span class="chip">+<b>${m.reward}</b>🪙</span>
        <button class="btn ${done && !claimed ? "primary" : ""}" ${done && !claimed ? "" : "disabled"}>
          ${claimed ? "Claimed" : done ? "Claim" : "Locked"}
        </button>
      </span>
    `;

    const btn = row.querySelector("button");
    btn.onclick = () => {
      const ms = getMissions();
      if (ms[idx].claimed) return;
      // recompute safety
      const bankNow = getNum(LS.bank, 0);
      setNum(LS.bank, bankNow + ms[idx].reward);
      ms[idx].claimed = true;
      setMissions(ms);
      toast("Mission claimed!");
      refreshTopbar();
      refreshMissions();
    };

    ui.missions.appendChild(row);
  });
}

function refreshCrateRewardUI() {
  const day = todayKey();
  const lastCrate = getStr(LS.crateDay, "");
  ui.crateStatus.textContent = (lastCrate === day) ? "Used" : "Ready";
  ui.btnCrate.disabled = (lastCrate === day);
}

function refreshRewardUI() {
  const day = todayKey();
  const last = getStr(LS.rewardDay, "");
  ui.btnClaimReward.disabled = (last === day);
  ui.rewardInfo.textContent = (last === day) ? "Claimed today. Come back tomorrow." : "Ready to claim.";
}

function applySkinToRenderer() {
  const id = getActiveSkinId();
  const s = SKINS.find(x => x.id === id) || SKINS[0];
  renderer.setPlayerSkin({ body: s.body, glow: s.glow });
}

// -------- Leaderboard --------
async function refreshLeaderboard() {
  ui.leaderboard.innerHTML = "";
  if (!Leaderboard.enabled) return;

  try {
    const rows = await Leaderboard.top(10);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const div = document.createElement("div");
      div.className = "lbRow";
      div.innerHTML = `<span>${i + 1}. <b>${escapeHtml(r.name || "Player")}</b></span>
                       <span>${Number(r.score || 0).toLocaleString()} pts</span>`;
      ui.leaderboard.appendChild(div);
    }
  } catch {
    ui.lbStatus.textContent = "Leaderboard: error";
  }
}

async function submitBest() {
  const name = (getStr(LS.name, "Gamer") || "Gamer").trim().slice(0, 18);
  const best = getNum(LS.best, 0);

  if (!Leaderboard.enabled) {
    toast("Leaderboard coming soon");
    return;
  }
  if (best <= 0) {
    toast("Play a run first!");
    return;
  }

  try {
    await Leaderboard.submit({ name, score: best, coins: getNum(LS.bank, 0) });
    toast("Best score submitted!");
    refreshLeaderboard();
  } catch {
    toast("Submit failed");
  }
}

// -------- Controls (keyboard + joystick) --------
let keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space","ShiftLeft","ShiftRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

const joy = ui.joy;
const joyKnob = ui.joyKnob;


let joyActive = false;
let joyCenter = { x: 78, y: window.innerHeight - 108 };
let joyRadius = 44;
let joyValueX = 0;
let joyValueY = 0;
let joyPointerId = null;

const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;


// -------- Landscape lock (mobile) --------
let pausedByOrientation = false;

function landscapeOK(){
  // iOS/Android sometimes report swapped values during rotate; still safe.
  return window.innerWidth >= window.innerHeight;
}


// Try to lock landscape on mobile browsers (best effort; requires user gesture + often fullscreen)
async function tryLockLandscape() {
  try {
    if (window.screen?.orientation?.lock) {
      await window.screen.orientation.lock("landscape");
      return true;
    }
  } catch {}
  return false;
}

async function requestFullscreen(el) {
  try {
    if (!document.fullscreenElement && el?.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch {}
}

function isPortrait() {
  if (window.screen?.orientation?.type) return window.screen.orientation.type.startsWith("portrait");
  return window.innerHeight > window.innerWidth;
}

function showRotatePrompt(show) {
  if (!ui.rotateOverlay) return;
  ui.rotateOverlay.classList.toggle("hidden", !show);
  ui.rotateOverlay.setAttribute("aria-hidden", show ? "false" : "true");
}

async function ensureLandscapeOrPrompt() {
  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (!isTouch) return true;

  // Already landscape
  if (!isPortrait()) { showRotatePrompt(false); return true; }

  // Best effort: fullscreen + lock
  await requestFullscreen(document.documentElement);
  const locked = await tryLockLandscape();

  // If still portrait, show prompt and block starting the run
  if (isPortrait()) {
    showRotatePrompt(true);
    return false;
  }
  showRotatePrompt(false);
  return true;
}

document.getElementById("rotateOk")?.addEventListener("click", () => showRotatePrompt(false));
function updateLandscapeLock(){
  if (!isTouch) {
    document.body.classList.remove("landscape-lock");
    showRotatePrompt(false);
pausedByOrientation = false;
    return true;
  }

  const ok = landscapeOK();
  if (!ok) {
    document.body.classList.add("landscape-lock");
    showRotatePrompt(true);
pausedByOrientation = true;
  } else {
    document.body.classList.remove("landscape-lock");
    showRotatePrompt(false);
pausedByOrientation = false;
  }
  return ok;
}

window.addEventListener("resize", () => {
  updateLandscapeLock();
});
window.addEventListener("orientationchange", () => {
  setTimeout(updateLandscapeLock, 150);
});


function setJoyPos(x, y) {
  const pad = 86;
  x = Math.max(pad, Math.min(window.innerWidth - pad, x));
  y = Math.max(pad, Math.min(window.innerHeight - pad, y));
  joyCenter = { x, y };

  // Position within touchUi
  if (ui.touchUi) {
    const rect = ui.touchUi.getBoundingClientRect();
    const lx = x - rect.left;
    const ly = y - rect.top;
    joy.style.left = (lx - 60) + "px";
    joy.style.top  = (ly - 60) + "px";
  } else {
    joy.style.left = (x - 60) + "px";
    joy.style.top  = (y - 60) + "px";
  }
}

function setKnob(dx, dy) {
    if (!joyKnob) return;
const len = Math.hypot(dx, dy) || 1;
  const cl = Math.min(joyRadius, len);
  const nx = (dx / len) * cl;
  const ny = (dy / len) * cl;

  joyKnob.style.transform = `translate(-50%, -50%) translate(${nx}px, ${ny}px)`;

  joyValueX = clamp(nx / joyRadius, -1, 1);
  // Invert Y: up should be +1 (forward), down should be -1 (back)
  joyValueY = clamp(-ny / joyRadius, -1, 1);
}

function resetKnob() {
  joyKnob.style.transform = `translate(-50%, -50%)`;
  joyValueX = 0;
  joyValueY = 0;
}

function setTouchVisible(on) {
  if (!ui.touchUi) return;
  ui.touchUi.classList.toggle("hidden", !on);
}

if (isTouch) {
  // Start with a comfortable default spot
  setTouchVisible(false);

  // Allow the player to "drop" joystick position with first touch on left half
  window.addEventListener("pointerdown", async (e) => {
    if (mode !== "run") return;
    // ignore touches on UI buttons/right side
    if (e.clientX > window.innerWidth * 0.60) return;
    if (e.target && (ui.btnNitro?.contains(e.target) || ui.btnDrift?.contains(e.target))) return;

    await ensureAudio();
    setTouchVisible(true);
    setJoyPos(e.clientX, e.clientY);
  }, { passive: true });
}

joy?.addEventListener("pointerdown", async (e) => {
  if (mode !== "run") return;
  await ensureAudio();
  joyActive = true;
  joyPointerId = e.pointerId;
  joy.setPointerCapture(joyPointerId);
  setJoyPos(e.clientX, e.clientY);
  setKnob(0, 0);
});

joy?.addEventListener("pointermove", (e) => {
  if (!joyActive || e.pointerId !== joyPointerId) return;
  setKnob(e.clientX - joyCenter.x, e.clientY - joyCenter.y);
});

joy?.addEventListener("pointerup", (e) => {
  if (e.pointerId !== joyPointerId) return;
  joyActive = false;
  joyPointerId = null;
  resetKnob();
});

joy?.addEventListener("pointercancel", () => {
  joyActive = false;
  joyPointerId = null;
  resetKnob();
});

window.addEventListener("resize", () => setJoyPos(joyCenter.x, joyCenter.y));

// Touch buttons
let nitroHold = false;
let driftHold = false;
let nitroPulseT = 0;

function bindTouchBtn(btn, onDown, onUp) {
  if (!btn) return;
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); }, { passive: false });
  btn.addEventListener("pointerup", (e) => { e.preventDefault(); onUp(); }, { passive: false });
  btn.addEventListener("pointercancel", (e) => { e.preventDefault(); onUp(); }, { passive: false });
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

bindTouchBtn(ui.btnNitro, () => {
  nitroHold = true;
  nitroPulseT = 0.12; // quick pulse so it triggers even if tap
  ui.btnNitro.classList.add("on");
}, () => {
  nitroHold = false;
  ui.btnNitro.classList.remove("on");
});

bindTouchBtn(ui.btnDrift, () => {
  driftHold = true;
  ui.btnDrift.classList.add("on");
}, () => {
  driftHold = false;
  ui.btnDrift.classList.remove("on");
});

function updateInput(dt) {
  // Desktop: WASD / arrows. Space = nitro. Shift = drift.
  if (!isTouch) {
    let mx = input.moveX;
    let my = input.moveY;

    const stepX = 0.10;
    const stepY = 0.10;

    if (keys.has("ArrowLeft") || keys.has("KeyA")) mx -= stepX;
    if (keys.has("ArrowRight") || keys.has("KeyD")) mx += stepX;
    if (keys.has("ArrowUp") || keys.has("KeyW")) my += stepY;
    if (keys.has("ArrowDown") || keys.has("KeyS")) my -= stepY;

    input.moveX = clamp(mx, -1, 1);
    input.moveY = clamp(my, -1, 1);

    input.nitro = keys.has("Space");
    const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
    input.driftDir = shift ? (input.moveX < -0.12 ? -1 : input.moveX > 0.12 ? 1 : 0) : 0;
    return;
  }

  // Touch: 4-way joystick + buttons.
  // Smooth input so the car doesn't snap.
  const follow = 1 - Math.exp(-22 * dt);
  const targetX = joyActive ? joyValueX : 0;
  const targetY = joyActive ? joyValueY : 0;
  input.moveX = input.moveX + (targetX - input.moveX) * follow;
  input.moveY = input.moveY + (targetY - input.moveY) * follow;

  // Nitro: tap/hold
  nitroPulseT = Math.max(0, nitroPulseT - dt);
  input.nitro = nitroHold || nitroPulseT > 0;

  // Drift: hold; direction depends on current steering sign
  input.driftDir = driftHold ? (input.moveX < -0.10 ? -1 : input.moveX > 0.10 ? 1 : 0) : 0;
}

// -------- Gameplay flow --------
async function startCountdown() {
  showOverlay(ui.countdown, true);
  let n = 3;
  ui.countText.textContent = n;
  await sleep(450);
  while (n > 1) {
    n--;
    ui.countText.textContent = n;
    await sleep(520);
  }
  ui.countText.textContent = "GO!";
  audio.sfx("nitro");
  await sleep(480);
  showOverlay(ui.countdown, false);
}

function applyQueuedBuffsToRun() {
  const loadout = getLoadout();
  const total = Object.values(loadout).reduce((a, b) => a + (b || 0), 0);
  if (total <= 0) return;

  // We only apply if GameCore exposes compatible timers. If not, it safely does nothing.
  // (This keeps code robust with your current GameCore.)
  try {
    if (game.player) {
      if (loadout.magnet) game.player.magnetT = Math.max(game.player.magnetT || 0, 6 * loadout.magnet);
      if (loadout.shield) game.player.shieldT = Math.max(game.player.shieldT || 0, 6 * loadout.shield);
      if (loadout.scorex2) game.player.scorex2T = Math.max(game.player.scorex2T || 0, 8 * loadout.scorex2);
      if (loadout.nitro) game.player.nitroT = Math.max(game.player.nitroT || 0, 2.5 * loadout.nitro);
    }
  } catch {}

  setLoadout({ nitro: 0, shield: 0, magnet: 0, scorex2: 0 });
  toast("Shop buffs activated!");
  refreshShop();
}

async function play() {
  await ensureAudio();

  // Do NOT start game update until countdown done
  setMode("countdown");
  ui.home.classList.remove("visible");
  document.body.classList.remove("home-mode");
  renderer.setMode("home"); // keep garage view during countdown briefly if needed

  await startCountdown();

  // Now start gameplay
  game.start();
  applyQueuedBuffsToRun();
  incPlaysToday();

  setMode("run");
  if (ui.touchUi) ui.touchUi.classList.toggle("hidden", !isTouch);
}

function endGame() {
  // Update best + bank
  const runScore = Math.floor(game.score);
  const runCoins = Math.floor(game.coins);

  const best = getNum(LS.best, 0);
  if (runScore > best) {
    setNum(LS.best, runScore);
    toast("New Best!");
  }

  const bank = getNum(LS.bank, 0);
  setNum(LS.bank, bank + runCoins);

  ui.finalScore.textContent = String(runScore);
  ui.finalCoins.textContent = String(runCoins);

  refreshTopbar();
  refreshRewardUI();
  refreshCrateRewardUI();
  refreshShop();
  refreshSkins();
  refreshMissions();

  setMode("gameover");
}

function backHome() {
  showOverlay(ui.gameover, false);
  showOverlay(ui.menu, false);
  ui.home.classList.add("visible");
  setMode("home");
  refreshLeaderboard();
}

// -------- Wiring (buttons) --------
ui.btnHow.onclick = () => {
  const showing = ui.howPanel.style.display !== "none";
  ui.howPanel.style.display = showing ? "none" : "block";
};

ui.btnFeedback.onclick = () => {
  window.open("https://www.instagram.com/daily__discipline.01/", "_blank");
};

ui.btnAudio.onclick = async () => {
  await ensureAudio();
  const on = audio.toggle();
  ui.btnAudio.textContent = on ? "🔊" : "🔇";
  toast(on ? "Audio ON" : "Audio OFF");
};

ui.btnFullscreen.onclick = async () => {
  const el = document.documentElement;
  if (!document.fullscreenElement) await el.requestFullscreen?.();
  else await document.exitFullscreen?.();
};

ui.btnPlay.onclick = async () => { const ok = await ensureLandscapeOrPrompt(); if (!ok) return; await play(); };
ui.btnPlayTop.onclick = async () => { const ok = await ensureLandscapeOrPrompt(); if (!ok) return; await play(); };

ui.btnSaveName.onclick = () => {
  const nm = (ui.playerName.value || "Gamer").trim().slice(0, 18) || "Gamer";
  setStr(LS.name, nm);
  toast("Saved name");
  refreshTopbar();
};

ui.btnClaimReward.onclick = () => {
  const day = todayKey();
  const last = getStr(LS.rewardDay, "");
  if (last === day) return toast("Already claimed today");

  const reward = 60 + Math.floor(Math.random() * 91); // 60..150
  setStr(LS.rewardDay, day);
  setNum(LS.bank, getNum(LS.bank, 0) + reward);
  ui.rewardInfo.textContent = `Claimed +${reward}🪙 today!`;
  toast(`Daily reward +${reward}🪙`);
  refreshTopbar();
  refreshRewardUI();
  refreshMissions();
};

ui.btnCrate.onclick = () => {
  const day = todayKey();
  const last = getStr(LS.crateDay, "");
  if (last === day) return toast("Crate already opened today");

  // Drop table (no legendary)
  const roll = Math.random();
  let msg = "";
  let bank = getNum(LS.bank, 0);

  if (roll < 0.55) {
    const coins = 80 + Math.floor(Math.random() * 141); // 80..220
    bank += coins;
    msg = `Crate: +${coins}🪙 coins (Common)`;
  } else if (roll < 0.88) {
    // Buff
    const b = SHOP[Math.floor(Math.random() * SHOP.length)];
    const loadout = getLoadout();
    loadout[b.id] = (loadout[b.id] || 0) + 1;
    setLoadout(loadout);
    msg = `Crate: ${b.name} x1 (Rare)`;
  } else {
    // Skin (Epic)
    const owned = getOwnedSkins();
    const candidates = SKINS.filter(s => !owned.has(s.id) && s.id !== "cyanPink");
    if (candidates.length) {
      const s = candidates[Math.floor(Math.random() * candidates.length)];
      owned.add(s.id);
      setOwnedSkins(owned);
      msg = `Crate: Skin unlocked — ${s.name} (Epic)`;
    } else {
      const coins = 160 + Math.floor(Math.random() * 221); // fallback
      bank += coins;
      msg = `Crate: +${coins}🪙 coins (Epic duplicate → coins)`;
    }
  }

  setStr(LS.crateDay, day);
  setNum(LS.bank, bank);

  ui.crateInfo.textContent = msg;
  toast(msg);

  refreshTopbar();
  refreshCrateRewardUI();
  refreshShop();
  refreshSkins();
  refreshMissions();
};

ui.btnSubmit.onclick = submitBest;
ui.btnSubmit2.onclick = submitBest;
ui.btnSubmit3.onclick = submitBest;

ui.btnRestart.onclick = async () => {
  showOverlay(ui.gameover, false);
  await play();
};
ui.btnHome.onclick = backHome;

ui.btnShare.onclick = async () => {
  const url = new URL(location.href);
  url.searchParams.set("seed", String(game.seed));
  url.searchParams.set("challenge", "1");
  const text = `Beat my Neon Racer 3D best score! Seed: ${game.seed}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Neon Racer 3D Challenge", text, url: url.toString() });
      ui.shareOut.textContent = "Shared!";
    } else {
      await navigator.clipboard.writeText(url.toString());
      ui.shareOut.textContent = "Challenge link copied!";
    }
  } catch {
    ui.shareOut.textContent = "Share canceled.";
  }
};

ui.btnMenu.onclick = () => {
  if (mode !== "run") return;
  setMode("menu");
};

ui.btnResume.onclick = () => {
  showOverlay(ui.menu, false);
  setMode("run");
};

ui.btnRestart2.onclick = async () => {
  showOverlay(ui.menu, false);
  await play();
};

ui.btnHome2.onclick = backHome;

// -------- Main loop: always renders (home = 3D garage; run = gameplay) --------
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  // show rotate prompt on touch devices if in portrait (no gameplay freeze)
  updateLandscapeLock();

  if (mode === "run") {
    updateInput(dt);
    game.update(dt, input);

    ui.score.textContent = String(Math.floor(game.score));
    ui.coins.textContent = String(Math.floor(game.coins));
    ui.combo.textContent = "x" + String(Math.floor(game.combo * 10) / 10);

    if (ui.lives) ui.lives.textContent = String(game.player?.lives ?? 0);
    if (ui.nitro) ui.nitro.textContent = String(game.player?.nitro?.charges ?? 0);
    if (ui.drift) ui.drift.textContent = String(Math.round((game.player?.drift?.amount ?? 0) * 100)) + "%";

    if (ui.bonus && ui.pillBonus) {
      const on = !!game.inBonus;
      ui.pillBonus.style.display = on ? "" : "none";
      ui.bonus.textContent = on ? (game.bonusT?.toFixed(1) + "s") : "—";
    }

    if (ui.ghost && ui.pillGhost) {
      const on = !!game.ghost?.playing;
      ui.pillGhost.style.display = (game.ghost?.enabled) ? "" : "none";
      ui.ghost.textContent = on ? "ON" : "OFF";
    }

    if (game.lastNearMiss && (game.t - game.lastNearMiss) < 0.05) {
      renderer.shake(0.22, 0.16);
      audio.sfx("near");
    }

    audio.update(dt, game);
    renderer.sync(game);
    renderer.render(dt);

    if (game.gameOver && !ui.gameover.classList.contains("visible")) {
      audio.sfx("hit");
      endGame();
    }
  } else {
    // 3D homepage garage preview
    renderer.render(dt);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// -------- Init --------
(async () => {
  // Load saved data
  const savedName = getStr(LS.name, "Gamer");
  if (!savedName) setStr(LS.name, "Gamer");

  if (!localStorage.getItem(LS.bank)) setNum(LS.bank, 0);
  if (!localStorage.getItem(LS.best)) setNum(LS.best, 0);

  ensureDailyMissions();

  // Apply skin to 3D garage
  applySkinToRenderer();

  // Leaderboard init
  const ok = await Leaderboard.init();
  ui.lbStatus.textContent = ok ? "Leaderboard: live" : "Leaderboard: coming soon";
  refreshLeaderboard();

  // Refresh UI
  refreshTopbar();
  refreshRewardUI();
  refreshCrateRewardUI();
  refreshShop();
  refreshSkins();
  refreshMissions();

  // Challenge link toast
  const url = new URL(location.href);
  if (url.searchParams.get("challenge") === "1") {
    toast("Challenge link loaded. Hit Play!");
  }

  updateLandscapeLock();
  setMode("home");
})();

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}