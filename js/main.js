import { GameCore } from "./gameCore.js";
import { Renderer3D } from "./renderer3d.js";
import { GameAudio } from "./audio.js";
import { Leaderboard } from "./leaderboard.js";

const canvas = document.getElementById("game");

const ui = {
  home: document.getElementById("home"),
  howPanel: document.getElementById("howPanel"),

  chipPlayer: document.getElementById("chipPlayer"),
  chipRank: document.getElementById("chipRank"),
  chipBank: document.getElementById("chipBank"),
  chipBest: document.getElementById("chipBest"),

  btnAudio: document.getElementById("btn-audio"),
  btnFullscreen: document.getElementById("btn-fullscreen"),

  btnPlay: document.getElementById("btn-play"),
  btnHow: document.getElementById("btn-how"),
  btnHowClose: document.getElementById("btn-how-close"),
  btnFeedback: document.getElementById("btn-feedback"),

  // NEW: name UI
  nameInput: document.getElementById("nameInput"),
  btnSaveName: document.getElementById("btn-save-name"),
  namePreview: document.getElementById("namePreview"),

  // HUD
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  coins: document.getElementById("coins"),
  lives: document.getElementById("lives"),
  nitro: document.getElementById("nitro"),
  drift: document.getElementById("drift"),
  bonus: document.getElementById("bonus"),
  ghost: document.getElementById("ghost"),
  pillBonus: document.getElementById("pillBonus"),
  btnMenu: document.getElementById("btn-menu"),

  countdown: document.getElementById("countdown"),
  gameover: document.getElementById("gameover"),
  menu: document.getElementById("menu"),

  finalScore: document.getElementById("finalScore"),
  finalCoins: document.getElementById("finalCoins"),
  btnRestart: document.getElementById("btn-restart"),
  btnHome: document.getElementById("btn-home"),
  btnHome2: document.getElementById("btn-home2"),
  btnResume: document.getElementById("btn-resume"),
  btnShare: document.getElementById("btn-share"),
  btnSubmit: document.getElementById("btn-submit"),
  btnSubmit2: document.getElementById("btn-submit2"),
  shareOut: document.getElementById("shareOut"),
  btnRevive: document.getElementById("btn-revive"),

  btnReward: document.getElementById("btn-reward"),
  rewardStreak: document.getElementById("rewardStreak"),
  rewardAmt: document.getElementById("rewardAmt"),

  btnCrate: document.getElementById("btn-crate"),
  crateOut: document.getElementById("crateOut"),

  missions: document.getElementById("missions"),
  missionsBonus: document.getElementById("missionsBonus"),
  btnRefreshMissions: document.getElementById("btn-refresh-missions"),

  shopQueued: document.getElementById("shopQueued"),
  btnClearQueued: document.getElementById("btn-clear-queued"),

  skins: document.getElementById("skins"),
  lb: document.getElementById("lb"),
  btnRefresh: document.getElementById("btn-refresh"),

  toast: document.getElementById("toast"),
  joy: document.getElementById("joy"),
};

const core = new GameCore();
const renderer = new Renderer3D(canvas);
const audio = new GameAudio();

let lbEnabled = false;

const LS = {
  name: "nr_name",
  bank: "nr_bank",
  best: "nr_best",
  skin: "nr_skin",
  skinOwned: "nr_skins_owned",
  shop: "nr_shop_loadout",
  rewardDay: "nr_reward_day",
  rewardStreak: "nr_reward_streak",
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
function setNum(k, v) { localStorage.setItem(k, String(Number(v) || 0)); }
function getJSON(k, def) {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return def;
    return JSON.parse(raw);
  } catch { return def; }
}
function setJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add("visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.remove("visible"), 1300);
}

function setMode(mode) {
  document.body.classList.remove("home-mode", "run-mode");
  ui.home.classList.remove("visible");

  ui.countdown.classList.remove("visible");
  ui.gameover.classList.remove("visible");
  ui.menu.classList.remove("visible");

  if (mode === "home") {
    document.body.classList.add("home-mode");
    ui.home.classList.add("visible");
    renderer.setMode("home");
  }
  if (mode === "run") {
    document.body.classList.add("run-mode");
    renderer.setMode("run");
  }
  if (mode === "countdown") {
    document.body.classList.add("run-mode");
    ui.countdown.classList.add("visible");
    renderer.setMode("run");
  }
  if (mode === "gameover") {
    document.body.classList.add("run-mode");
    ui.gameover.classList.add("visible");
    renderer.setMode("run");
  }
  if (mode === "menu") {
    document.body.classList.add("run-mode");
    ui.menu.classList.add("visible");
  }

  // Show joystick on mobile while playing
  if (mode === "run" || mode === "countdown" || mode === "menu" || mode === "gameover") {
    if (isTouchDevice()) ui.joy.classList.remove("hidden");
  } else {
    ui.joy.classList.add("hidden");
  }

  window._mode = mode;
}

function rankFromBest(best) {
  if (best >= 30000) return "Neon God";
  if (best >= 20000) return "Legend";
  if (best >= 12000) return "Epic";
  if (best >= 6500) return "Pro";
  if (best >= 2500) return "Racer";
  return "Rookie";
}

// -------- Skins --------
const SKINS = [
  { id: "cyanPink", name: "Cyan/Pink", body: 0x00ffff, glow: 0xff4dff, rarity: "common" },
  { id: "gold", name: "Gold", body: 0xffd24d, glow: 0xffd24d, rarity: "rare" },
  { id: "violet", name: "Violet", body: 0x9b5cff, glow: 0xff6adf, rarity: "rare" },
  { id: "emerald", name: "Emerald", body: 0x00ff9a, glow: 0x7cffea, rarity: "epic" },
  { id: "crimson", name: "Crimson", body: 0xff4b5c, glow: 0xff4b5c, rarity: "epic" },
  { id: "starlord", name: "Star Lord", body: 0xffffff, glow: 0x7cffea, rarity: "legend" },
];

function getOwnedSkins() {
  const arr = getJSON(LS.skinOwned, ["cyanPink"]);
  return new Set(Array.isArray(arr) ? arr : ["cyanPink"]);
}
function setOwnedSkins(set) { setJSON(LS.skinOwned, [...set]); }

function applySkin(id) {
  const skin = SKINS.find(s => s.id === id) || SKINS[0];
  localStorage.setItem(LS.skin, skin.id);
  renderer.setPlayerSkin({ body: skin.body, glow: skin.glow });
  core.setMeta({ skinId: skin.id });
  renderSkins();
}

function renderSkins() {
  const owned = getOwnedSkins();
  const current = localStorage.getItem(LS.skin) || "cyanPink";
  ui.skins.innerHTML = "";
  for (const s of SKINS) {
    const btn = document.createElement("button");
    btn.className = "skinBtn" + (s.id === current ? " active" : "");
    const locked = !owned.has(s.id);
    btn.textContent = locked ? `🔒 ${s.name}` : s.name;
    btn.disabled = locked;
    btn.onclick = () => applySkin(s.id);
    ui.skins.appendChild(btn);
  }
}

// -------- Daily Reward --------
function rewardForStreak(day) {
  const table = [60, 80, 100, 120, 150, 180, 240];
  return table[Math.max(0, Math.min(6, day - 1))];
}
function renderDailyReward() {
  const streak = getNum(LS.rewardStreak, 0);
  const day = Math.min(7, Math.max(1, streak + 1));
  ui.rewardStreak.textContent = String(streak);
  ui.rewardAmt.textContent = String(rewardForStreak(day));
}
function claimDailyReward() {
  const today = todayKey();
  const last = localStorage.getItem(LS.rewardDay);
  let streak = getNum(LS.rewardStreak, 0);

  if (last) {
    const lastDate = new Date(last + "T00:00:00");
    const nowDate = new Date(today + "T00:00:00");
    const diffDays = Math.round((nowDate - lastDate) / (1000 * 60 * 60 * 24));
    if (diffDays >= 2) streak = 0;
  }
  if (last === today) { toast("Already claimed today"); return; }

  const day = Math.min(7, streak + 1);
  const amt = rewardForStreak(day);

  setNum(LS.bank, getNum(LS.bank, 0) + amt);
  streak = (day >= 7) ? 0 : day;

  setNum(LS.rewardStreak, streak);
  localStorage.setItem(LS.rewardDay, today);

  toast(`+${amt} coins!`);
  refreshMetaUI();
  renderDailyReward();
}

// -------- Crate --------
function openCrate() {
  const today = todayKey();
  const last = localStorage.getItem(LS.crateDay);
  if (last === today) { toast("Crate already opened today"); return; }
  localStorage.setItem(LS.crateDay, today);

  const roll = Math.random();
  let rarity = "common";
  if (roll > 0.92) rarity = "legend";
  else if (roll > 0.75) rarity = "epic";
  else if (roll > 0.45) rarity = "rare";

  const pool = SKINS.filter(s => s.rarity === rarity);
  const skin = pool[(Math.random() * pool.length) | 0];

  const owned = getOwnedSkins();
  owned.add(skin.id);
  setOwnedSkins(owned);

  ui.crateOut.textContent = `${skin.name} (${rarity})`;
  toast(`Unlocked: ${skin.name}`);
  renderSkins();
}

// -------- Missions (unchanged minimal) --------
function randomMissions() {
  const list = [
    { id: "coins50", text: "Collect 50 coins", goal: 50, reward: 120 },
    { id: "near8", text: "Do 8 near-misses", goal: 8, reward: 140 },
    { id: "score5k", text: "Score 5,000+", goal: 5000, reward: 160 },
    { id: "buff6", text: "Pick 6 buffs", goal: 6, reward: 140 },
    { id: "combo8", text: "Reach combo x8", goal: 8, reward: 160 },
  ];
  const out = [];
  const used = new Set();
  while (out.length < 3) {
    const m = list[(Math.random() * list.length) | 0];
    if (used.has(m.id)) continue;
    used.add(m.id);
    out.push({ ...m, done: false, prog: 0 });
  }
  return out;
}
function loadMissions() {
  const today = todayKey();
  const last = localStorage.getItem(LS.missionsDay);
  if (last !== today) {
    localStorage.setItem(LS.missionsDay, today);
    setJSON(LS.missions, randomMissions());
  }
  return getJSON(LS.missions, randomMissions());
}
function saveMissions(m) { setJSON(LS.missions, m); }
function renderMissions() {
  const m = loadMissions();
  ui.missions.innerHTML = "";
  let bonus = 0;

  for (const item of m) {
    const div = document.createElement("div");
    div.className = "mission" + (item.done ? " done" : "");
    const pct = Math.min(100, Math.floor((item.prog / item.goal) * 100));
    div.innerHTML = `
      <div class="row">
        <div><b>${item.text}</b><div class="small muted">${item.prog}/${item.goal} (${pct}%)</div></div>
        <div><b>${item.reward}🪙</b></div>
      </div>
    `;
    ui.missions.appendChild(div);
    if (item.done) bonus += item.reward;
  }
  ui.missionsBonus.textContent = String(bonus);
}
function refreshMissions() {
  localStorage.setItem(LS.missionsDay, todayKey());
  saveMissions(randomMissions());
  renderMissions();
  toast("New missions!");
}
function applyMissionProgress(run) {
  const m = loadMissions();
  let bankAdd = 0;
  for (const item of m) {
    if (item.done) continue;

    if (item.id === "coins50") item.prog = Math.max(item.prog, run.coinsPicked);
    if (item.id === "near8") item.prog = Math.max(item.prog, run.nearMisses);
    if (item.id === "score5k") item.prog = Math.max(item.prog, run.score);
    if (item.id === "buff6") item.prog = Math.max(item.prog, run.buffsPicked);
    if (item.id === "combo8") item.prog = Math.max(item.prog, run.maxCombo || 1);

    if (item.prog >= item.goal) {
      item.done = true;
      bankAdd += item.reward;
    }
  }

  if (bankAdd > 0) {
    setNum(LS.bank, getNum(LS.bank, 0) + bankAdd);
    toast(`Missions +${bankAdd}🪙`);
  }

  saveMissions(m);
  renderMissions();
  refreshMetaUI();
}

// -------- Shop --------
const PRICES = { magnet: 120, shield: 140, scorex2: 160, nitro: 180, slowmo: 160, invis: 180 };
function getShopQueued() { return getJSON(LS.shop, { magnet: 0, shield: 0, scorex2: 0, nitro: 0, slowmo: 0, invis: 0 }); }
function setShopQueued(q) { setJSON(LS.shop, q); }
function renderQueued() {
  const q = getShopQueued();
  const parts = [];
  for (const k of Object.keys(q)) if (q[k] > 0) parts.push(`${k}:${q[k]}`);
  ui.shopQueued.textContent = parts.length ? parts.join(", ") : "—";
}
function buy(type) {
  const price = PRICES[type];
  const bank = getNum(LS.bank, 0);
  if (bank < price) { toast("Not enough bank coins"); return; }
  setNum(LS.bank, bank - price);

  const q = getShopQueued();
  q[type] = (q[type] || 0) + 1;
  setShopQueued(q);

  toast(`Queued ${type}`);
  refreshMetaUI();
  renderQueued();
}
function clearQueued() {
  setShopQueued({ magnet: 0, shield: 0, scorex2: 0, nitro: 0, slowmo: 0, invis: 0 });
  renderQueued();
  toast("Queued cleared");
}

// -------- Leaderboard --------
async function refreshLeaderboard() {
  if (!lbEnabled) {
    ui.lb.innerHTML = `<div class="lbRow"><b>Leaderboard</b><span class="muted">Not enabled</span></div>`;
    return;
  }
  const rows = await Leaderboard.top(10);
  ui.lb.innerHTML = "";
  if (!rows.length) {
    ui.lb.innerHTML = `<div class="lbRow"><b>No scores yet</b><span class="muted">Be first</span></div>`;
    return;
  }
  rows.forEach((r, idx) => {
    const div = document.createElement("div");
    div.className = "lbRow";
    div.innerHTML = `<span><b>#${idx + 1}</b> ${escapeHtml(r.name || "Gamer")}</span><span><b>${r.score}</b> • 🪙 ${r.coins}</span>`;
    ui.lb.appendChild(div);
  });
}
async function submitBest() {
  if (!lbEnabled) { toast("Leaderboard disabled"); return; }
  const name = localStorage.getItem(LS.name) || "Gamer";
  const best = getNum(LS.best, 0);
  const bank = getNum(LS.bank, 0);
  try {
    await Leaderboard.submit({ name, score: best, coins: bank });
    toast("Best submitted!");
    refreshLeaderboard();
  } catch {
    toast("Submit failed");
  }
}

// -------- Controls --------
let keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","KeyW","KeyA","KeyS","KeyD","Space","ShiftLeft","ShiftRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

// Joystick
const joy = ui.joy;
const joyKnob = joy.querySelector(".joy-knob");

let joyActive = false;
let joyCenter = { x: 90, y: window.innerHeight - 90 };
let joyRadius = 46;
let joyValueX = 0;
let joyValueY = 0;
let joyPointerId = null;

function setJoyKnob(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len > joyRadius) {
    dx = dx / len * joyRadius;
    dy = dy / len * joyRadius;
  }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyValueX = dx / joyRadius;
  joyValueY = -dy / joyRadius; // up=forward
}

joy.addEventListener("pointerdown", (e) => {
  joyActive = true;
  joyPointerId = e.pointerId;
  joy.setPointerCapture(joyPointerId);

  const rect = joy.getBoundingClientRect();
  joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  setJoyKnob(0, 0);
});

joy.addEventListener("pointermove", (e) => {
  if (!joyActive || e.pointerId !== joyPointerId) return;
  const dx = e.clientX - joyCenter.x;
  const dy = e.clientY - joyCenter.y;
  setJoyKnob(dx, dy);
});

function joyEnd(e) {
  if (!joyActive || e.pointerId !== joyPointerId) return;
  joyActive = false;
  joyPointerId = null;
  joyKnob.style.transform = `translate(0px, 0px)`;
  joyValueX = 0;
  joyValueY = 0;
}
joy.addEventListener("pointerup", joyEnd);
joy.addEventListener("pointercancel", joyEnd);

// NEW: Swipe-drag steering anywhere on right side of screen
let swipeActive = false;
let swipeId = null;
let swipeStart = { x: 0, y: 0 };
let swipeAxes = { x: 0, y: 0 };

canvas.addEventListener("pointerdown", (e) => {
  const mode = window._mode || "home";
  if (mode !== "run") return;

  // right half = steering
  if (e.clientX < window.innerWidth * 0.45) return;

  swipeActive = true;
  swipeId = e.pointerId;
  swipeStart = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(swipeId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!swipeActive || e.pointerId !== swipeId) return;
  const dx = (e.clientX - swipeStart.x);
  const dy = (e.clientY - swipeStart.y);

  // normalize to axes
  swipeAxes.x = clamp(dx / 160, -1, 1);
  swipeAxes.y = clamp(-dy / 160, -1, 1); // up=forward
});

function swipeEnd(e) {
  if (!swipeActive || e.pointerId !== swipeId) return;
  swipeActive = false;
  swipeId = null;
  swipeAxes.x = 0;
  swipeAxes.y = 0;
}
canvas.addEventListener("pointerup", swipeEnd);
canvas.addEventListener("pointercancel", swipeEnd);

// -------- Game loop glue --------
let last = performance.now();
let maxComboThisRun = 1;

core.onEvent = (type, payload) => {
  if (type === "coin") audio.sfx("coin");
  if (type === "buff") audio.sfx("buff");
  if (type === "near_miss") { audio.sfx("near"); renderer.shake(0.10, 0.10); }
  if (type === "nitro") audio.sfx("nitro");
  if (type === "shield_break") { audio.sfx("hit"); renderer.shake(0.25, 0.18); }
  if (type === "life_lost") { audio.sfx("life"); renderer.shake(0.35, 0.22); }
  if (type === "bonus_start") { audio.sfx("bonus"); }
  if (type === "revive") { audio.sfx("revive"); }
  if (type === "ghost_mode") {
    renderer.setGhostVisible(payload?.on);
    ui.ghost.textContent = payload?.on ? "ON" : "OFF";
  }
  if (type === "ghost_frame") {
    renderer.syncGhostFrame(payload);
  }
  if (type === "end") onGameOver(payload);
};

function refreshMetaUI() {
  const name = localStorage.getItem(LS.name) || "Gamer";
  const bank = getNum(LS.bank, 0);
  const best = getNum(LS.best, 0);

  ui.chipPlayer.textContent = name;
  ui.chipBank.textContent = String(bank);
  ui.chipBest.textContent = String(best);
  ui.chipRank.textContent = rankFromBest(best);

  if (ui.namePreview) ui.namePreview.textContent = name;

  core.setMeta({
    bank,
    best,
    skinId: localStorage.getItem(LS.skin) || "cyanPink",
    queued: getShopQueued(),
    ghostEnabled: true,
  });
}

function buildInput() {
  // Keyboard
  const left = keys.has("ArrowLeft") || keys.has("KeyA");
  const right = keys.has("ArrowRight") || keys.has("KeyD");
  const up = keys.has("ArrowUp") || keys.has("KeyW");
  const down = keys.has("ArrowDown") || keys.has("KeyS");

  let moveX = 0;
  if (left) moveX -= 1;
  if (right) moveX += 1;

  let moveY = 0;
  if (up) moveY += 1;
  if (down) moveY -= 1;

  // Mobile: prefer swipe (right side), else joystick
  const sw = Math.max(Math.abs(swipeAxes.x), Math.abs(swipeAxes.y));
  const jv = Math.max(Math.abs(joyValueX), Math.abs(joyValueY));

  if (sw > 0.02) {
    moveX = swipeAxes.x;
    moveY = swipeAxes.y;
  } else if (jv > 0.02) {
    moveX = joyValueX;
    moveY = joyValueY;
  }

  const driftHeld = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const driftDir = driftHeld ? (moveX < -0.15 ? -1 : moveX > 0.15 ? 1 : 0) : 0;

  return {
    moveX: clamp(moveX, -1, 1),
    moveY: clamp(moveY, -1, 1),
    nitro: keys.has("Space"),
    driftDir
  };
}

function updateHUD() {
  ui.score.textContent = String(core.score | 0);
  ui.combo.textContent = `x${core.combo | 0}`;
  ui.coins.textContent = String(core.coins | 0);

  ui.lives.textContent = String(core.player.lives | 0);
  ui.nitro.textContent = String(core.player.nitro.charges | 0);

  const d = Math.round((core.player.drift.amount || 0) * 100);
  ui.drift.textContent = `${d}%`;

  if (core.inBonus) {
    ui.pillBonus.style.display = "";
    ui.bonus.textContent = `${core.bonusT.toFixed(1)}s`;
  } else {
    ui.pillBonus.style.display = "none";
    ui.bonus.textContent = "—";
  }

  ui.btnRevive.disabled = core.player.reviveUsed || core.coins < 100;
  ui.btnRevive.textContent = core.player.reviveUsed ? "Revive used" : (core.coins < 100 ? "Need 100🪙" : "Revive (100🪙)");
}

function onGameOver(payload) {
  setNum(LS.bank, getNum(LS.bank, 0) + (payload.coins || 0));
  setNum(LS.best, Math.max(getNum(LS.best, 0), payload.score || 0));

  refreshMetaUI();

  applyMissionProgress({
    score: payload.score || 0,
    coinsPicked: core.stats.coinsPicked || 0,
    nearMisses: core.stats.nearMisses || 0,
    buffsPicked: core.stats.buffsPicked || 0,
    maxCombo: maxComboThisRun
  });

  ui.finalScore.textContent = String(payload.score || 0);
  ui.finalCoins.textContent = String(payload.coins || 0);
  ui.shareOut.textContent = "";

  setMode("gameover");
}

function makeChallengeLink(seed, ghostRec) {
  const base = location.origin + location.pathname;
  const ghostStr = encodeURIComponent(JSON.stringify(ghostRec || []));
  return `${base}?seed=${encodeURIComponent(seed)}&ghost=${ghostStr}&challenge=1`;
}

function parseChallenge() {
  const u = new URL(location.href);
  const seed = u.searchParams.get("seed");
  const ghost = u.searchParams.get("ghost");
  const challenge = u.searchParams.get("challenge") === "1";

  let ghostArr = null;
  if (ghost) {
    try { ghostArr = JSON.parse(decodeURIComponent(ghost)); } catch {}
  }
  return {
    challenge,
    seed: seed != null ? Number(seed) : null,
    ghost: Array.isArray(ghostArr) ? ghostArr : null
  };
}

async function startRun() {
  await audio.start();

  core.setMeta({ queued: getShopQueued() });
  const ch = parseChallenge();

  maxComboThisRun = 1;

  setMode("countdown");
  const countEl = ui.countdown.querySelector(".count");
  let t = 3;
  countEl.textContent = String(t);
  await wait(420); t--; countEl.textContent = String(t);
  await wait(420); t--; countEl.textContent = String(t);
  await wait(420); countEl.textContent = "GO";
  await wait(250);

  core.start({
    seed: ch.seed != null ? ch.seed : undefined,
    ghostPlay: ch.challenge ? ch.ghost : null
  });

  setShopQueued({ magnet: 0, shield: 0, scorex2: 0, nitro: 0, slowmo: 0, invis: 0 });
  renderQueued();

  setMode("run");
}

function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  const mode = window._mode || "home";

  if (mode === "run") {
    const input = buildInput();
    core.update(dt, input);

    if (core.combo > maxComboThisRun) maxComboThisRun = core.combo;

    renderer.sync(core);
    audio.update(dt, core);
    updateHUD();
  }

  renderer.render(dt);
  requestAnimationFrame(tick);
}

// -------- UI wiring --------
ui.btnPlay.onclick = () => startRun();
ui.btnHow.onclick = () => ui.howPanel.classList.add("visible");
ui.btnHowClose.onclick = () => ui.howPanel.classList.remove("visible");
ui.btnFeedback.onclick = () => toast("DM on Instagram / GitHub Issues");

ui.btnAudio.onclick = async () => { await audio.start(); audio.setEnabled(!audio.enabled); ui.btnAudio.textContent = audio.enabled ? "🔊" : "🔇"; };
ui.btnFullscreen.onclick = async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch { toast("Fullscreen not supported"); }
};

ui.btnMenu.onclick = () => { if ((window._mode || "home") === "run") setMode("menu"); };
ui.btnResume.onclick = () => setMode("run");
ui.btnHome2.onclick = () => setMode("home");

ui.btnRestart.onclick = () => startRun();
ui.btnHome.onclick = () => setMode("home");

ui.btnRevive.onclick = () => {
  const ok = core.revive();
  if (!ok) { toast("Can't revive"); return; }
  toast("Revived!");
  setMode("run");
};

ui.btnShare.onclick = () => {
  const link = makeChallengeLink(core.seed, core.ghost.rec);
  ui.shareOut.textContent = link;
  try { navigator.clipboard.writeText(link); toast("Challenge link copied!"); } catch { toast("Copy failed"); }
};

ui.btnSubmit.onclick = () => submitBest();
ui.btnSubmit2.onclick = () => submitBest();
ui.btnRefresh.onclick = () => refreshLeaderboard();

ui.btnReward.onclick = () => claimDailyReward();
ui.btnCrate.onclick = () => openCrate();
ui.btnRefreshMissions.onclick = () => refreshMissions();

ui.btnClearQueued.onclick = () => clearQueued();

document.querySelectorAll("[data-buy]").forEach(btn => {
  btn.addEventListener("click", () => buy(btn.getAttribute("data-buy")));
});

// NEW: Save name
ui.btnSaveName.onclick = () => {
  const raw = (ui.nameInput.value || "").trim();
  const name = raw ? raw.slice(0, 18) : "Gamer";
  localStorage.setItem(LS.name, name);
  ui.nameInput.value = name;
  toast("Name saved!");
  refreshMetaUI();
};

// init
(async function init() {
  setMode("home");

  if (!localStorage.getItem(LS.name)) localStorage.setItem(LS.name, "Gamer");
  if (!localStorage.getItem(LS.skin)) localStorage.setItem(LS.skin, "cyanPink");

  // init name UI
  const nm = localStorage.getItem(LS.name) || "Gamer";
  ui.nameInput.value = nm;
  ui.namePreview.textContent = nm;

  renderSkins();
  applySkin(localStorage.getItem(LS.skin) || "cyanPink");

  refreshMetaUI();
  renderQueued();
  renderDailyReward();
  renderMissions();

  lbEnabled = await Leaderboard.init();
  await refreshLeaderboard();

  const ch = parseChallenge();
  ui.ghost.textContent = ch.challenge ? "ON" : "OFF";
  renderer.setGhostVisible(!!ch.challenge);

  requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
})();

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function isTouchDevice() {
  return matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
}
