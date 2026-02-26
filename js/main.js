import { GameCore } from "./gameCore.js";
import { Renderer3D } from "./renderer3d.js";
import { GameAudio } from "./audio.js";
import { Leaderboard } from "./leaderboard.js";

const canvas = document.getElementById("game");

const ui = {
  home: document.getElementById("home"),
  countdown: document.getElementById("countdown"),
  countText: document.querySelector("#countdown .count"),
  gameover: document.getElementById("gameover"),

  score: document.getElementById("score"),
  coins: document.getElementById("coins"),
  combo: document.getElementById("combo"),

  finalScore: document.getElementById("finalScore"),
  finalCoins: document.getElementById("finalCoins"),

  btnPlay: document.getElementById("btn-play"),
  btnHow: document.getElementById("btn-how"),
  how: document.getElementById("how"),

  btnRestart: document.getElementById("btn-restart"),
  btnHome: document.getElementById("btn-home"),

  btnShare: document.getElementById("btn-share"),
  shareOut: document.getElementById("shareOut"),

  btnSubmit: document.getElementById("btn-submit"),
  btnSubmit2: document.getElementById("btn-submit2"),
  playerName: document.getElementById("playerName"),

  leaderboard: document.getElementById("leaderboard"),
  lbStatus: document.getElementById("lbStatus"),

  toast: document.getElementById("toast"),
  btnAudio: document.getElementById("btn-audio"),
  btnFullscreen: document.getElementById("btn-fullscreen"),
};

const game = new GameCore();
const renderer = new Renderer3D(canvas);
const audio = new GameAudio();

let last = performance.now();
let input = {
  moveX: 0,
  nitro: false,
  driftDir: 0
};

// controls
let keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

// touch / drag
let pointerDown = false;
let pointerX0 = 0;
let baseMove = 0;
canvas.addEventListener("pointerdown", async (e) => {
  pointerDown = true;
  pointerX0 = e.clientX;
  baseMove = input.moveX;
  canvas.setPointerCapture(e.pointerId);
  await ensureAudio();
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointerDown) return;
  const dx = (e.clientX - pointerX0) / Math.max(220, window.innerWidth * 0.5);
  input.moveX = clamp(baseMove + dx * 1.8, -1, 1);
});
canvas.addEventListener("pointerup", () => pointerDown = false);
canvas.addEventListener("pointercancel", () => pointerDown = false);

ui.btnHow.onclick = () => ui.how.classList.toggle("hidden");

// audio toggle
ui.btnAudio.onclick = async () => {
  await ensureAudio();
  const on = audio.toggle();
  ui.btnAudio.textContent = on ? "🔊" : "🔇";
  toast(on ? "Audio ON" : "Audio OFF");
};

// fullscreen
ui.btnFullscreen.onclick = async () => {
  const el = document.documentElement;
  if (!document.fullscreenElement) await el.requestFullscreen?.();
  else await document.exitFullscreen?.();
};

// share challenge
ui.btnShare.onclick = async () => {
  const url = new URL(location.href);
  url.searchParams.set("seed", String(game.seed));
  url.searchParams.set("challenge", "1");
  const text = `Beat my Neon Racer 3D score! Seed: ${game.seed}`;
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

ui.btnPlay.onclick = async () => {
  await ensureAudio();
  showHome(false);
  await startCountdown();
  startGame();
};

ui.btnRestart.onclick = async () => {
  await ensureAudio();
  showGameOver(false);
  await startCountdown();
  startGame();
};

ui.btnHome.onclick = () => {
  showGameOver(false);
  showHome(true);
  refreshLeaderboard();
};

ui.btnSubmit.onclick = () => submitScore();
ui.btnSubmit2.onclick = () => submitScore();

function showHome(v) { ui.home.classList.toggle("visible", !!v); }
function showCountdown(v) { ui.countdown.classList.toggle("visible", !!v); }
function showGameOver(v) { ui.gameover.classList.toggle("visible", !!v); }

function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add("show");
  setTimeout(() => ui.toast.classList.remove("show"), 1200);
}

async function ensureAudio() {
  await audio.start();
  if (audio.ctx?.state === "suspended") await audio.ctx.resume();
}

async function startCountdown() {
  showCountdown(true);
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
  showCountdown(false);
}

function startGame() {
  // seed support
  const url = new URL(location.href);
  const seedParam = url.searchParams.get("seed");
  if (seedParam) game.setSeed(Number(seedParam) || game.seed);

  game.start();
  showGameOver(false);

  // subtle “challenge mode” toast
  if (url.searchParams.get("challenge") === "1") toast(`Challenge seed: ${game.seed}`);
}

function endGame() {
  ui.finalScore.textContent = String(Math.floor(game.score));
  ui.finalCoins.textContent = String(Math.floor(game.coins));
  showGameOver(true);
  audio.sfx("hit");
}

function updateInput() {
  // keyboard move
  let mx = input.moveX;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) mx -= 0.08;
  if (keys.has("ArrowRight") || keys.has("KeyD")) mx += 0.08;
  input.moveX = clamp(mx, -1, 1);

  input.nitro = keys.has("Space");

  // drift direction (optional visual)
  input.driftDir = 0;
  if (keys.has("ShiftLeft") || keys.has("ShiftRight")) {
    input.driftDir = (input.moveX < -0.1) ? -1 : (input.moveX > 0.1 ? 1 : 0);
  }
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  updateInput();

  // update game
  game.update(dt, input);

  // UI
  ui.score.textContent = String(Math.floor(game.score));
  ui.coins.textContent = String(Math.floor(game.coins));
  ui.combo.textContent = "x" + String(Math.floor(game.combo * 10) / 10);

  // near miss feedback (shake + sfx)
  if (game.lastNearMiss && (game.t - game.lastNearMiss) < 0.05) {
    renderer.onNearMiss();
    audio.sfx("near");
  }

  // coin/buff sfx (cheap detection: if coins changed)
  // (kept simple; you can add event callbacks if you want)
  audio.update(dt, game);

  // render
  renderer.render(game, dt);

  if (game.gameOver && !ui.gameover.classList.contains("visible")) {
    endGame();
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// Leaderboard init + home load
(async () => {
  showHome(true);

  // Try enabling Supabase leaderboard if keys exist
  const ok = await Leaderboard.init();
  ui.lbStatus.textContent = ok ? "Leaderboard: live" : "Leaderboard: coming soon";
  refreshLeaderboard();

  // auto-fill name
  const saved = localStorage.getItem("nr_name");
  if (saved) ui.playerName.value = saved;

  // if user opened challenge link, keep home visible but highlight play
  const url = new URL(location.href);
  if (url.searchParams.get("challenge") === "1") {
    toast("Challenge link loaded. Hit Play!");
  }
})();

async function refreshLeaderboard() {
  ui.leaderboard.innerHTML = "";
  if (!Leaderboard.enabled) return;

  try {
    const rows = await Leaderboard.top(10);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const div = document.createElement("div");
      div.className = "lbRow";
      div.innerHTML = `<span>${i+1}. <b>${escapeHtml(r.name || "Player")}</b></span>
                       <span>${Number(r.score||0).toLocaleString()} pts</span>`;
      ui.leaderboard.appendChild(div);
    }
  } catch (e) {
    ui.lbStatus.textContent = "Leaderboard: error";
  }
}

async function submitScore() {
  const name = (ui.playerName.value || "Player").trim().slice(0, 16);
  localStorage.setItem("nr_name", name);

  if (!Leaderboard.enabled) {
    toast("Leaderboard coming soon");
    return;
  }

  try {
    await Leaderboard.submit({ name, score: game.score, coins: game.coins });
    toast("Score submitted!");
    refreshLeaderboard();
  } catch {
    toast("Submit failed");
  }
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}
