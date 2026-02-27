
/*
  Neon Racer 2D — Premium Gameplay Layer
  - Home-first flow + countdown
  - 7 unique cars w/ stats
  - Smooth movement (not only lanes), obstacles can change lanes
  - Coins, combo, nitro, HP
  - Daily reward, daily crate, daily tasks
  - Local leaderboard + optional Supabase hooks
  - Small transparent movable joystick w/ deadzone + smoothing
*/

// -------------------------
// Optional Supabase config (leave blank to use Local leaderboard)
// -------------------------
const SUPABASE_URL = "";     // e.g. "https://xxxx.supabase.co"
const SUPABASE_ANON = "";    // anon public key
const SUPABASE_TABLE = "leaderboard";

// -------------------------
// Utilities
// -------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const nowMs = () => performance.now();
const isTouch = () => (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

// -------------------------
// Cars (7)
// -------------------------
const CARS = {
  street:  { id:"street",  name:"Street Starter", desc:"Balanced starter. Smooth control.", speed:6,  accel:6,  handling:6,  nitro:5,  hp:1, price:0 },
  sprint:  { id:"sprint",  name:"Neon Sprint",    desc:"High top speed. Tricky turns.",  speed:9,  accel:7,  handling:4,  nitro:6,  hp:1, price:1200 },
  drift:   { id:"drift",   name:"Drift King",     desc:"Best handling. Safe in traffic.",speed:7,  accel:6,  handling:9,  nitro:5,  hp:1, price:1400 },
  beast:   { id:"beast",   name:"Nitro Beast",    desc:"Huge nitro burst. Risky.",       speed:7,  accel:5,  handling:5,  nitro:10, hp:1, price:1600 },
  tank:    { id:"tank",    name:"Tank Runner",    desc:"2 HP. Slow but forgiving.",      speed:5,  accel:4,  handling:6,  nitro:4,  hp:2, price:1800 },
  ghost:   { id:"ghost",   name:"Ghost Rider",    desc:"Phase ability (tap Nitro when full).", speed:7, accel:7, handling:6, nitro:6, hp:1, price:2200 },
  formula: { id:"formula", name:"Hyper Formula",  desc:"Elite performance. Hard to master.", speed:10, accel:9, handling:5, nitro:7, hp:1, price:2600 },
};

const CAR_ORDER = ["street","sprint","drift","beast","tank","ghost","formula"];

function statToSpeed(stat){      // world units / sec mapping
  return 10 + stat * 3.0;        // 28..40 approx
}
function statToAccel(stat){
  return 9 + stat * 4.2;         // 26..46
}
function statToHandling(stat){
  return 10 + stat * 6.0;        // turn response
}
function statToNitro(stat){
  return 1.2 + stat * 0.22;      // nitro multiplier
}

// -------------------------
// Storage
// -------------------------
const STORAGE_KEY = "neon_racer_2d_premium_v1";
const DefaultProfile = () => ({
  name: "",
  coins: 0,
  ownedCars: { street:true },
  selectedCar: "street",
  settings: {
    sfx: true,
    music: false,
    sens: 1.0,
    reducedMotion: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    vibration: true
  },
  daily: {
    lastRewardKey: "",
    lastCrateKey: "",
    tasksKey: "",
    tasks: []
  },
  localLeaderboard: []
});

const Storage = {
  load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return DefaultProfile();
      const p = JSON.parse(raw);
      // shallow merge defaults to avoid missing fields
      const d = DefaultProfile();
      return {
        ...d,
        ...p,
        settings: { ...d.settings, ...(p.settings||{}) },
        daily: { ...d.daily, ...(p.daily||{}) },
        ownedCars: { ...d.ownedCars, ...(p.ownedCars||{}) },
        localLeaderboard: Array.isArray(p.localLeaderboard) ? p.localLeaderboard : []
      };
    }catch(e){
      return DefaultProfile();
    }
  },
  save(profile){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }
};

let Profile = Storage.load();

// -------------------------
// Audio (lightweight WebAudio beeps)
// -------------------------
const AudioSys = (() => {
  let ctx = null;
  let musicOsc = null;
  let musicGain = null;

  function ensure(){
    if(ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function beep(freq=440, dur=0.07, type="sine", gain=0.08){
    if(!Profile.settings.sfx) return;
    try{
      ensure();
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur);
    }catch(_){}
  }

  function startMusic(){
    if(!Profile.settings.music) return;
    try{
      ensure();
      if(musicOsc) return;
      musicOsc = ctx.createOscillator();
      musicGain = ctx.createGain();
      musicOsc.type = "sawtooth";
      musicOsc.frequency.value = 72;
      musicGain.gain.value = 0.018;
      musicOsc.connect(musicGain);
      musicGain.connect(ctx.destination);
      musicOsc.start();
    }catch(_){}
  }

  function stopMusic(){
    try{
      if(musicOsc){
        musicOsc.stop();
        musicOsc.disconnect();
        musicOsc = null;
      }
      if(musicGain){
        musicGain.disconnect();
        musicGain = null;
      }
    }catch(_){}
  }

  function onUserGesture(){
    // helps iOS/Android unlock audio
    try{
      ensure();
      if(ctx.state === "suspended") ctx.resume();
    }catch(_){}
    if(Profile.settings.music) startMusic();
  }

  return { beep, startMusic, stopMusic, onUserGesture };
})();

// -------------------------
// Toast queue
// -------------------------
const Toast = (() => {
  const host = () => document.getElementById("toastHost");
  const q = [];
  let showing = false;

  function show(msg, ms=1900){
    q.push({msg, ms});
    pump();
  }

  function pump(){
    if(showing) return;
    if(q.length === 0) return;
    showing = true;
    const {msg, ms} = q.shift();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    host().appendChild(el);
    setTimeout(() => {
      el.remove();
      showing = false;
      pump();
    }, ms);
  }

  return { show };
})();

// -------------------------
// UI wiring
// -------------------------
const UI = (() => {
  const el = (id) => document.getElementById(id);

  function showOverlay(id){
    el(id).classList.remove("hidden");
  }
  function hideOverlay(id){
    el(id).classList.add("hidden");
  }
  function showHome(){
    hideGameUI();
    el("home").classList.remove("hidden");
  }
  function showGameUI(){
    el("home").classList.add("hidden");
    el("gameCanvas").classList.remove("hidden");
    el("hud").classList.remove("hidden");
    el("joystick").classList.toggle("hidden", !isTouch());
    el("mobileControls").classList.toggle("hidden", !isTouch());
  }
  function hideGameUI(){
    el("gameCanvas").classList.add("hidden");
    el("hud").classList.add("hidden");
    el("joystick").classList.add("hidden");
    el("mobileControls").classList.add("hidden");
    hideOverlay("pauseOverlay");
    hideOverlay("gameOverOverlay");
    hideOverlay("carsOverlay");
    hideOverlay("dailyOverlay");
    hideOverlay("tasksOverlay");
    hideOverlay("leaderboardOverlay");
    hideOverlay("settingsOverlay");
  }

  function setBootProgress(p01){
    const fill = el("bootBarFill");
    fill.style.width = `${Math.round(clamp(p01,0,1)*100)}%`;
  }
  function hideBoot(){
    el("boot").style.display = "none";
  }

  function refreshHome(){
    const car = CARS[Profile.selectedCar] || CARS.street;
    el("selectedCarName").textContent = car.name;
    el("homeCoins").textContent = String(Profile.coins|0);
    el("resumeBtn").disabled = !Game.hasPausedRun();
    refreshDailyBadges();
    refreshTasksBadge();
  }

  function refreshHUD(){
    el("hudScore").textContent = String(Game.state.score|0);
    el("hudCoins").textContent = String(Game.state.runCoins|0);
    el("hudCombo").textContent = `x${Game.state.combo|0}`;
    el("hudNitro").textContent = String(Game.state.nitroCharges|0);
    el("hudHp").textContent = "♥".repeat(Game.state.hp) || "—";
  }

  function refreshDailyBadges(){
    const key = todayKey();
    const rewardReady = Profile.daily.lastRewardKey !== key;
    el("dailyStatus").textContent = rewardReady ? "Reward ready" : "Claimed today";
    el("dailyRewardStatus").textContent = rewardReady ? "Ready to claim." : "Already claimed today.";
    const crateReady = Profile.daily.lastCrateKey !== key;
    el("crateStatus").textContent = crateReady ? "Crate ready." : "Already opened today.";
  }

  function refreshTasksBadge(){
    const tasks = Daily.ensureTasks();
    const remaining = tasks.filter(t => !t.claimed).length;
    el("tasksStatus").textContent = remaining > 0 ? `${remaining} to claim` : "All claimed";
  }

  function renderCars(){
    const wrap = el("carsList");
    wrap.innerHTML = "";
    for(const id of CAR_ORDER){
      const c = CARS[id];
      const owned = !!Profile.ownedCars[id];
      const selected = Profile.selectedCar === id;
      const row = document.createElement("div");
      row.className = "carRow";

      const thumb = document.createElement("div");
      thumb.className = "carThumb";
      thumb.textContent = c.name.split(" ").map(s=>s[0]).slice(0,2).join("").toUpperCase();
      row.appendChild(thumb);

      const info = document.createElement("div");
      info.className = "carInfo";
      info.innerHTML = `
        <div class="carName">${c.name} ${selected ? "• <span style='color:var(--good)'>Selected</span>" : ""}</div>
        <div class="carDesc">${c.desc}</div>
      `;

      const bars = document.createElement("div");
      bars.className = "bars";
      const mk = (label, v10) => {
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.innerHTML = `
          <label>${label}</label>
          <div class="track"><div class="fill" style="width:${clamp(v10,0,10)*10}%"></div></div>
        `;
        return bar;
      };
      bars.appendChild(mk("SPEED", c.speed));
      bars.appendChild(mk("ACCEL", c.accel));
      bars.appendChild(mk("HANDLE", c.handling));
      bars.appendChild(mk("NITRO", c.nitro));
      if(c.hp === 2) bars.appendChild(mk("ARMOR", 8.5));
      info.appendChild(bars);
      row.appendChild(info);

      const actions = document.createElement("div");
      actions.className = "carActions";

      if(owned){
        const selBtn = document.createElement("button");
        selBtn.className = selected ? "smallBtn primary" : "smallBtn";
        selBtn.textContent = selected ? "Selected" : "Select";
        selBtn.disabled = selected;
        selBtn.onclick = () => {
          Profile.selectedCar = id;
          Storage.save(Profile);
          renderCars();
          refreshHome();
          Toast.show(`${c.name} selected`);
        };
        actions.appendChild(selBtn);
      }else{
        const buyBtn = document.createElement("button");
        buyBtn.className = "smallBtn primary";
        buyBtn.textContent = `Buy (${c.price} coins)`;
        buyBtn.disabled = Profile.coins < c.price;
        buyBtn.onclick = () => {
          if(Profile.coins < c.price){
            Toast.show("Not enough coins");
            return;
          }
          Profile.coins -= c.price;
          Profile.ownedCars[id] = true;
          Profile.selectedCar = id;
          Storage.save(Profile);
          renderCars();
          refreshHome();
          Toast.show(`Unlocked ${c.name}!`);
          AudioSys.beep(740, 0.10, "square", 0.06);
        };
        actions.appendChild(buyBtn);
        const hint = document.createElement("div");
        hint.className = "modalSmall";
        hint.textContent = "Earn coins by playing + daily tasks.";
        actions.appendChild(hint);
      }

      row.appendChild(actions);
      wrap.appendChild(row);
    }
  }

  function renderTasks(){
    const list = el("tasksList");
    const tasks = Daily.ensureTasks();
    list.innerHTML = "";
    for(const t of tasks){
      const row = document.createElement("div");
      row.className = "taskRow";
      const left = document.createElement("div");
      left.className = "taskLeft";
      left.innerHTML = `
        <div class="taskTitle">${t.title}</div>
        <div class="taskSub">Reward: ${t.reward} coins</div>
      `;
      const prog = document.createElement("div");
      prog.className = "taskProg";
      prog.textContent = `${Math.min(t.progress, t.goal)}/${t.goal}`;

      const btn = document.createElement("button");
      btn.className = "smallBtn primary";
      btn.textContent = t.claimed ? "Claimed" : (t.progress >= t.goal ? "Claim" : "In progress");
      btn.disabled = t.claimed || t.progress < t.goal;
      btn.onclick = () => {
        t.claimed = true;
        Profile.coins += t.reward;
        Storage.save(Profile);
        Toast.show(`+${t.reward} coins`);
        AudioSys.beep(820, 0.09, "square", 0.05);
        renderTasks();
        refreshHome();
      };

      row.appendChild(left);
      row.appendChild(prog);
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  function renderLeaderboard(rows){
    const host = el("leaderboardTable");
    host.innerHTML = "";
    const top = rows.slice(0, 20);
    if(top.length === 0){
      host.innerHTML = `<div style="padding:14px;color:rgba(255,255,255,0.65)">No scores yet. Play a run!</div>`;
      return;
    }
    top.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "lbRow";
      row.innerHTML = `
        <div class="lbRank">#${i+1}</div>
        <div class="lbName">${escapeHtml(r.name || "Player")}</div>
        <div class="lbScore">${r.score|0}</div>
      `;
      host.appendChild(row);
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function bind(){
    // General close buttons
    document.body.addEventListener("click", (e) => {
      const t = e.target;
      if(t && t.dataset && t.dataset.close){
        hideOverlay(t.dataset.close);
      }
      if(t && t.classList && t.classList.contains("overlay")){
        // click backdrop to close
        t.classList.add("hidden");
      }
    });

    // Home buttons
    el("playBtn").addEventListener("click", async () => {
      AudioSys.onUserGesture();
      await Game.startNewRun();
    });
    el("resumeBtn").addEventListener("click", () => {
      AudioSys.onUserGesture();
      Game.resumeFromPause();
    });

    el("carsBtn").addEventListener("click", () => {
      renderCars();
      showOverlay("carsOverlay");
    });
    el("dailyBtn").addEventListener("click", () => {
      refreshDailyBadges();
      showOverlay("dailyOverlay");
    });
    el("tasksBtn").addEventListener("click", () => {
      renderTasks();
      showOverlay("tasksOverlay");
    });
    el("leaderboardBtn").addEventListener("click", async () => {
      showOverlay("leaderboardOverlay");
      await Leaderboard.refresh();
    });
    el("settingsBtn").addEventListener("click", () => {
      Settings.render();
      showOverlay("settingsOverlay");
    });

    // Daily actions
    el("claimDailyBtn").addEventListener("click", () => {
      Daily.claimReward();
      refreshHome();
      refreshDailyBadges();
    });
    el("openCrateBtn").addEventListener("click", () => {
      Daily.openCrate();
      refreshHome();
      refreshDailyBadges();
    });

    // Pause
    el("pauseBtn").addEventListener("click", () => Game.pause());
    el("resumePauseBtn").addEventListener("click", () => Game.resumeFromPause());
    el("restartBtn").addEventListener("click", () => Game.restart());
    el("homeBtn").addEventListener("click", () => { Game.stopToHome(); });
    el("goHomeBtn").addEventListener("click", () => { Game.stopToHome(); });

    // Game over
    el("playAgainBtn").addEventListener("click", async () => { await Game.startNewRun(); });
    el("submitScoreBtn").addEventListener("click", async () => {
      const name = el("playerName").value.trim().slice(0,16);
      await Leaderboard.submit(name, Game.state.score|0);
    });

    // Mobile nitro
    el("nitroBtn").addEventListener("click", () => {
      AudioSys.onUserGesture();
      Game.useNitroOrAbility();
    });

    // Keyboard
    window.addEventListener("keydown", (e) => {
      if(e.key === "Escape"){
        if(!Game.state.running) return;
        Game.pause();
      }
      if(!Game.state.running) return;
      if(e.key === "ArrowLeft" || e.key === "a" || e.key === "A") Input.keyLeft = true;
      if(e.key === "ArrowRight" || e.key === "d" || e.key === "D") Input.keyRight = true;
      if(e.key === " " || e.key === "Shift") Game.useNitroOrAbility();
    });
    window.addEventListener("keyup", (e) => {
      if(e.key === "ArrowLeft" || e.key === "a" || e.key === "A") Input.keyLeft = false;
      if(e.key === "ArrowRight" || e.key === "d" || e.key === "D") Input.keyRight = false;
    });

    // Pause when tab hidden
    document.addEventListener("visibilitychange", () => {
      if(document.hidden && Game.state.running){
        Game.pause(true);
      }
    });
  }

  return {
    bind,
    showOverlay, hideOverlay,
    showHome, showGameUI,
    setBootProgress, hideBoot,
    refreshHome, refreshHUD,
    renderCars, renderTasks, renderLeaderboard
  };
})();

// -------------------------
// Settings
// -------------------------
const Settings = (() => {
  const el = (id)=>document.getElementById(id);

  function render(){
    el("sfxToggle").checked = !!Profile.settings.sfx;
    el("musicToggle").checked = !!Profile.settings.music;
    el("sensRange").value = String(Profile.settings.sens ?? 1.0);
    el("rmToggle").checked = !!Profile.settings.reducedMotion;
    el("vibeToggle").checked = !!Profile.settings.vibration;

    el("sfxToggle").onchange = () => {
      Profile.settings.sfx = el("sfxToggle").checked;
      Storage.save(Profile);
      Toast.show(Profile.settings.sfx ? "SFX on" : "SFX off");
    };
    el("musicToggle").onchange = () => {
      Profile.settings.music = el("musicToggle").checked;
      Storage.save(Profile);
      if(Profile.settings.music) AudioSys.startMusic(); else AudioSys.stopMusic();
      Toast.show(Profile.settings.music ? "Music on" : "Music off");
    };
    el("sensRange").oninput = () => {
      Profile.settings.sens = parseFloat(el("sensRange").value);
      Storage.save(Profile);
    };
    el("rmToggle").onchange = () => {
      Profile.settings.reducedMotion = el("rmToggle").checked;
      Storage.save(Profile);
      Toast.show(Profile.settings.reducedMotion ? "Reduced motion" : "Motion on");
    };
    el("vibeToggle").onchange = () => {
      Profile.settings.vibration = el("vibeToggle").checked;
      Storage.save(Profile);
      Toast.show(Profile.settings.vibration ? "Vibration on" : "Vibration off");
    };
  }

  return { render };
})();

// -------------------------
// Daily systems (reward, crate, tasks)
// -------------------------
const Daily = (() => {
  function ensureTasks(){
    const key = todayKey();
    if(Profile.daily.tasksKey !== key || !Array.isArray(Profile.daily.tasks) || Profile.daily.tasks.length === 0){
      Profile.daily.tasksKey = key;
      Profile.daily.tasks = generateTasks();
      Storage.save(Profile);
    }
    return Profile.daily.tasks;
  }

  function generateTasks(){
    // simple deterministic shuffle based on day
    const seedStr = todayKey().replace(/-/g,'');
    let seed = parseInt(seedStr,10) || 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

    const pool = [
      { id:"coins", title:"Collect coins", goal: 50, reward: 120, metric:"coins" },
      { id:"score", title:"Reach score", goal: 2500, reward: 180, metric:"score" },
      { id:"nitro", title:"Use nitro", goal: 4, reward: 120, metric:"nitro" },
      { id:"combo", title:"Hit combo", goal: 8, reward: 150, metric:"combo" },
      { id:"near", title:"Near-miss count", goal: 5, reward: 160, metric:"near" },
    ];

    // pick 3
    const chosen = [];
    while(chosen.length < 3){
      const idx = Math.floor(rand() * pool.length);
      const t = pool[idx];
      if(!chosen.find(x=>x.id===t.id)) chosen.push(t);
    }
    return chosen.map(t => ({...t, progress:0, claimed:false}));
  }

  function claimReward(){
    const key = todayKey();
    if(Profile.daily.lastRewardKey === key){
      Toast.show("Daily reward already claimed");
      return;
    }
    const reward = 200;
    Profile.daily.lastRewardKey = key;
    Profile.coins += reward;
    Storage.save(Profile);
    Toast.show(`Daily reward: +${reward} coins`);
    if(Profile.settings.vibration && navigator.vibrate) navigator.vibrate(18);
    AudioSys.beep(720, 0.10, "square", 0.06);
  }

  function openCrate(){
    const key = todayKey();
    if(Profile.daily.lastCrateKey === key){
      Toast.show("Crate already opened today");
      return;
    }
    Profile.daily.lastCrateKey = key;

    // Reward logic: mostly coins, sometimes car unlock if any locked remain
    const locked = CAR_ORDER.filter(id => !Profile.ownedCars[id]);
    let msg = "";
    if(locked.length > 0 && Math.random() < 0.22){
      const pick = locked[Math.floor(Math.random() * locked.length)];
      Profile.ownedCars[pick] = true;
      Profile.selectedCar = pick;
      msg = `Crate unlocked ${CARS[pick].name}!`;
    }else{
      const coins = 150 + Math.floor(Math.random()*200);
      Profile.coins += coins;
      msg = `Crate reward: +${coins} coins`;
    }
    Storage.save(Profile);
    Toast.show(msg);
    if(Profile.settings.vibration && navigator.vibrate) navigator.vibrate([15,25,15]);
    AudioSys.beep(880, 0.12, "square", 0.06);
  }

  function onRunStats(stats){
    // Update tasks progress
    const tasks = ensureTasks();

    for(const t of tasks){
      if(t.claimed) continue;
      if(t.metric === "coins") t.progress += stats.coins;
      if(t.metric === "score") t.progress = Math.max(t.progress, stats.score);
      if(t.metric === "nitro") t.progress += stats.nitroUses;
      if(t.metric === "combo") t.progress = Math.max(t.progress, stats.maxCombo);
      if(t.metric === "near") t.progress += stats.nearMiss;
      t.progress = Math.min(t.progress, t.goal);
    }

    Profile.daily.tasks = tasks;
    Storage.save(Profile);
  }

  return { ensureTasks, claimReward, openCrate, onRunStats };
})();

// -------------------------
// Leaderboard (Local + optional Supabase)
// -------------------------
const Leaderboard = (() => {
  let mode = "local"; // "local" | "global"
  let sb = null;

  function canGlobal(){
    return typeof window !== "undefined" && SUPABASE_URL && SUPABASE_ANON && window.supabase;
  }

  async function initSupabase(){
    if(!canGlobal()) return;
    try{
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }catch(_){
      sb = null;
    }
  }

  function setMode(newMode){
    mode = newMode;
    const btn = document.getElementById("lbModeBtn");
    btn.textContent = `Mode: ${mode === "global" ? "Global" : "Local"}`;
  }

  async function refresh(){
    // If global isn't available, force local
    if(mode === "global" && !canGlobal()){
      setMode("local");
      Toast.show("Global leaderboard not configured");
    }

    if(mode === "local"){
      const rows = (Profile.localLeaderboard || []).slice().sort((a,b)=>b.score-a.score);
      UI.renderLeaderboard(rows);
      return;
    }

    // global
    if(!sb) await initSupabase();
    if(!sb){
      setMode("local");
      const rows = (Profile.localLeaderboard || []).slice().sort((a,b)=>b.score-a.score);
      UI.renderLeaderboard(rows);
      return;
    }

    try{
      const { data, error } = await sb.from(SUPABASE_TABLE).select("name,score").order("score", {ascending:false}).limit(20);
      if(error) throw error;
      UI.renderLeaderboard(data || []);
    }catch(e){
      Toast.show("Leaderboard offline — using local");
      setMode("local");
      const rows = (Profile.localLeaderboard || []).slice().sort((a,b)=>b.score-a.score);
      UI.renderLeaderboard(rows);
    }
  }

  function addLocal(name, score){
    const clean = (name || "Player").trim().slice(0,16) || "Player";
    Profile.localLeaderboard = Profile.localLeaderboard || [];
    Profile.localLeaderboard.push({ name: clean, score: score|0, ts: Date.now() });
    // Keep top 50
    Profile.localLeaderboard.sort((a,b)=>b.score-a.score);
    Profile.localLeaderboard = Profile.localLeaderboard.slice(0, 50);
    Storage.save(Profile);
  }

  async function submit(name, score){
    const status = document.getElementById("submitStatus");
    status.textContent = "";

    const clean = (name || "Player").trim().slice(0,16) || "Player";
    addLocal(clean, score);
    await refresh();

    if(!clean){
      Toast.show("Enter a name");
      return;
    }

    if(mode !== "global"){
      status.textContent = "Saved locally.";
      Toast.show("Score saved (local)");
      return;
    }

    if(!sb) await initSupabase();
    if(!sb){
      status.textContent = "Global unavailable. Saved locally.";
      return;
    }

    try{
      // Lightweight anti-cheat: cap score
      const capped = Math.min(score|0, 9999999);
      const { error } = await sb.from(SUPABASE_TABLE).insert({ name: clean, score: capped });
      if(error) throw error;
      status.textContent = "Submitted globally!";
      Toast.show("Score submitted");
      await refresh();
    }catch(e){
      status.textContent = "Submit failed. Saved locally.";
      Toast.show("Submit failed (offline)");
    }
  }

  function bind(){
    document.getElementById("lbRefreshBtn").addEventListener("click", refresh);
    document.getElementById("lbModeBtn").addEventListener("click", async () => {
      setMode(mode === "local" ? "global" : "local");
      await refresh();
    });
    // default local
    setMode("local");
  }

  return { bind, refresh, submit };
})();

// -------------------------
// Input (keyboard + joystick)
// -------------------------
const Input = {
  keyLeft:false,
  keyRight:false,
  joyX:0, // -1..1 smoothed
  joyActive:false
};

const Joystick = (() => {
  let base, stick, mover, root;
  let draggingMove = false;
  let draggingStick = false;
  let startX=0, startY=0;
  let baseRect = null;
  let stickCenter = {x:0,y:0};
  let outX=0;
  let smoothX=0;

  function applyDeadzone(v, dz=0.14){
    if(Math.abs(v) < dz) return 0;
    return (v - Math.sign(v)*dz) / (1 - dz);
  }

  function pointerPos(e){
    if(e.touches && e.touches[0]) return {x:e.touches[0].clientX, y:e.touches[0].clientY};
    return {x:e.clientX, y:e.clientY};
  }

  function setStickVisual(nx){
    const max = 18; // px
    stick.style.transform = `translate(calc(-50% + ${nx*max}px), -50%)`;
  }

  function updateOutputFromPointer(px){
    baseRect = base.getBoundingClientRect();
    const cx = baseRect.left + baseRect.width/2;
    const dx = (px - cx) / (baseRect.width/2);
    let nx = clamp(dx, -1, 1);
    nx = applyDeadzone(nx);
    outX = nx;
  }

  function onDown(e){
    const t = e.target;
    if(t === mover){
      draggingMove = true;
      const p = pointerPos(e);
      startX = p.x;
      startY = p.y;
      e.preventDefault();
      return;
    }
    // stick drag anywhere inside base
    if(root.contains(t)){
      draggingStick = true;
      const p = pointerPos(e);
      updateOutputFromPointer(p.x);
      Input.joyActive = true;
      e.preventDefault();
    }
  }

  function onMove(e){
    const p = pointerPos(e);

    if(draggingMove){
      const dx = p.x - startX;
      const dy = p.y - startY;
      startX = p.x;
      startY = p.y;
      const r = root.getBoundingClientRect();
      const left = clamp(r.left + dx, 6, window.innerWidth - r.width - 6);
      const top = clamp(r.top + dy, 6, window.innerHeight - r.height - 6);
      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      root.style.bottom = "auto";
      root.style.right = "auto";
      e.preventDefault();
      return;
    }

    if(draggingStick){
      updateOutputFromPointer(p.x);
      e.preventDefault();
    }
  }

  function onUp(){
    draggingMove = false;
    draggingStick = false;
    outX = 0;
    Input.joyActive = false;
  }

  function tick(dt){
    // smoothing
    const sens = Profile.settings.sens ?? 1.0;
    const target = clamp(outX * sens, -1, 1);
    const k = 1 - Math.pow(0.001, dt); // exponential smoothing
    smoothX = lerp(smoothX, target, k);
    Input.joyX = smoothX;
    setStickVisual(smoothX);
  }

  function bind(){
    root = document.getElementById("joystick");
    base = document.getElementById("joyBase");
    stick = document.getElementById("joyStick");
    mover = document.getElementById("joyMove");

    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, {passive:false});
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    // Prevent page scroll on touch while using joystick
    root.addEventListener("touchstart", (e)=>e.preventDefault(), {passive:false});
    root.addEventListener("touchmove", (e)=>e.preventDefault(), {passive:false});
  }

  return { bind, tick };
})();

// -------------------------
// Game (canvas gameplay)
// -------------------------
const Game = (() => {
  const canvas = () => document.getElementById("gameCanvas");
  let ctx = null;

  const state = {
    running:false,
    paused:false,
    score:0,
    runCoins:0,
    combo:1,
    comboT:0,
    maxCombo:1,
    nitroCharges:1,
    nitroT:0,
    nitroUses:0,
    hp:1,
    invulnT:0,
    phaseT:0, // for ghost
    nearMiss:0,

    speed:0,
    targetSpeed:0,

    player:{
      x:0,
      vx:0,
      y:0,
      w:42,
      h:80
    },

    road:{
      w: 420, // computed
      laneXs: [],
      scroll:0
    },

    obstacles:[],
    coins:[],
    effects:[],
    spawn:{
      t:0,
      coinT:0,
      laneChangeT:0
    },

    lastMs:0,
    pausedSnapshot:null
  };

  function hasPausedRun(){
    return !!state.pausedSnapshot;
  }

  function resize(){
    const c = canvas();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    c.width = Math.floor(window.innerWidth * dpr);
    c.height = Math.floor(window.innerHeight * dpr);
    c.style.width = "100vw";
    c.style.height = "100vh";
    ctx = c.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
    // road width based on screen
    state.road.w = Math.min(520, Math.max(340, window.innerWidth * 0.70));
    computeLanes();
  }

  function computeLanes(){
    const cx = window.innerWidth / 2;
    const laneCount = 3;
    const spacing = state.road.w / (laneCount);
    const start = cx - state.road.w/2 + spacing/2;
    state.road.laneXs = [start, start + spacing, start + 2*spacing];
  }

  function resetRun(){
    const car = CARS[Profile.selectedCar] || CARS.street;
    state.running = false;
    state.paused = false;
    state.score = 0;
    state.runCoins = 0;
    state.combo = 1;
    state.comboT = 0;
    state.maxCombo = 1;
    state.nitroCharges = 1;
    state.nitroT = 0;
    state.nitroUses = 0;
    state.hp = car.hp;
    state.invulnT = 0;
    state.phaseT = 0;
    state.nearMiss = 0;

    state.speed = 0;
    state.targetSpeed = statToSpeed(car.speed);

    state.player.x = 0;
    state.player.vx = 0;
    state.player.y = window.innerHeight * 0.78;
    state.player.w = 42;
    state.player.h = 82;

    state.road.scroll = 0;
    state.obstacles = [];
    state.coins = [];
    state.effects = [];
    state.spawn = { t:0, coinT:0, laneChangeT:0 };
  }

  async function startNewRun(){
    UI.showGameUI();
    resetRun();
    Input.keyLeft = Input.keyRight = false;
    AudioSys.onUserGesture();

    // Countdown
    await countdown();
    state.running = true;
    state.paused = false;
    state.lastMs = nowMs();
    loop();
    Toast.show("Go!");
  }

  function restart(){
    if(!state.running && !state.paused) return;
    startNewRun();
  }

  function stopToHome(){
    state.running = false;
    state.paused = false;
    state.pausedSnapshot = null;
    UI.showHome();
    UI.refreshHome();
  }

  function pause(fromVisibility=false){
    if(!state.running) return;
    state.running = false;
    state.paused = true;
    state.pausedSnapshot = snapshot();
    document.getElementById("pauseOverlay").classList.remove("hidden");
    if(!fromVisibility) Toast.show("Paused");
  }

  function resumeFromPause(){
    if(!state.pausedSnapshot) return;
    restore(state.pausedSnapshot);
    state.paused = false;
    document.getElementById("pauseOverlay").classList.add("hidden");
    // tiny countdown 2..1
    countdown(2).then(() => {
      state.running = true;
      state.lastMs = nowMs();
      loop();
    });
  }

  async function countdown(n=3){
    const el = document.getElementById("countdown");
    el.classList.remove("hidden");
    for(let i=n; i>=1; i--){
      el.textContent = String(i);
      AudioSys.beep(440 + i*80, 0.05, "sine", 0.05);
      await wait(650);
    }
    el.textContent = "GO";
    AudioSys.beep(920, 0.08, "square", 0.06);
    await wait(280);
    el.classList.add("hidden");
  }

  function wait(ms){ return new Promise(res => setTimeout(res, ms)); }

  function snapshot(){
    return JSON.parse(JSON.stringify(state));
  }

  function restore(s){
    Object.assign(state, s);
    // restore functions / ctx
    resize();
  }

  function useNitroOrAbility(){
    if(!state.running) return;
    const car = CARS[Profile.selectedCar] || CARS.street;
    if(car.id === "ghost"){
      // If phase not active and nitro charge available -> activate phase (invuln) for 1.1s
      if(state.nitroCharges > 0 && state.phaseT <= 0){
        state.nitroCharges--;
        state.phaseT = 1.1;
        state.invulnT = Math.max(state.invulnT, 1.1);
        state.nitroUses++;
        Toast.show("PHASE!");
        if(Profile.settings.vibration && navigator.vibrate) navigator.vibrate(20);
        AudioSys.beep(980, 0.08, "square", 0.06);
        return;
      }
    }

    if(state.nitroCharges <= 0) return;
    state.nitroCharges--;
    state.nitroT = 1.15; // duration
    state.nitroUses++;
    if(Profile.settings.vibration && navigator.vibrate) navigator.vibrate(12);
    AudioSys.beep(760, 0.06, "square", 0.06);
  }

  // Collision helpers
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function playerRect(){
    const px = window.innerWidth/2 + state.player.x - state.player.w/2;
    const py = state.player.y - state.player.h/2;
    return {x:px, y:py, w:state.player.w, h:state.player.h};
  }

  function obstacleRect(o){
    return {x:o.x - o.w/2, y:o.y - o.h/2, w:o.w, h:o.h};
  }

  function spawnObstacle(){
    // Spawn at top, choose lane, random type car
    const lane = Math.floor(Math.random()*3);
    const laneX = state.road.laneXs[lane] - window.innerWidth/2;
    const o = {
      x: laneX,
      y: -120,
      w: 46,
      h: 86,
      lane,
      targetLane: lane,
      vx: 0,
      speed: 0.7 + Math.random()*0.45, // relative to player speed (downwards)
      laneChangeCD: 0.6 + Math.random()*0.8,
      alive:true
    };
    state.obstacles.push(o);
  }

  function spawnCoins(){
    const lane = Math.floor(Math.random()*3);
    const laneX = state.road.laneXs[lane] - window.innerWidth/2;
    // coin pack of 3-5
    const count = 3 + Math.floor(Math.random()*3);
    for(let i=0;i<count;i++){
      state.coins.push({
        x: laneX + (Math.random()*18-9),
        y: -80 - i*44,
        r: 10,
        alive:true
      });
    }
  }

  function update(dt){
    const car = CARS[Profile.selectedCar] || CARS.street;

    // charging nitro slowly
    if(state.nitroCharges < 1){
      // one charge returns after time based on handling
      state.nitroT = Math.max(0, state.nitroT - dt);
      // recharge timer hidden via nitroT < 0? We'll use comboT spare:
    }

    // speed approach
    const baseMax = statToSpeed(car.speed);
    const accel = statToAccel(car.accel);
    const nitroMul = (state.nitroT > 0) ? statToNitro(car.nitro) : 1.0;
    const maxSpeed = baseMax * nitroMul;
    state.targetSpeed = maxSpeed;
    state.speed = lerp(state.speed, state.targetSpeed, clamp(dt*1.6,0,1));

    // timers
    state.invulnT = Math.max(0, state.invulnT - dt);
    state.phaseT = Math.max(0, state.phaseT - dt);
    if(state.nitroT > 0) state.nitroT = Math.max(0, state.nitroT - dt);

    // recharge nitro charges when empty: every ~3.0s base, faster with nitro stat
    state._nitroRecharge = state._nitroRecharge ?? 0;
    if(state.nitroCharges < 1){
      state._nitroRecharge += dt * (0.95 + car.nitro*0.06);
      if(state._nitroRecharge >= 3.0){
        state._nitroRecharge = 0;
        state.nitroCharges = 1;
        Toast.show("Nitro ready");
        AudioSys.beep(640, 0.05, "sine", 0.04);
      }
    }else{
      state._nitroRecharge = 0;
    }

    // combo decay
    state.comboT = Math.max(0, state.comboT - dt);
    if(state.comboT <= 0){
      state.combo = 1;
    }

    // input steering
    let steer = 0;
    if(Input.keyLeft) steer -= 1;
    if(Input.keyRight) steer += 1;

    // joystick adds steering
    if(isTouch()){
      steer += Input.joyX;
    }

    steer = clamp(steer, -1, 1);

    const handle = statToHandling(car.handling);
    // velocity integrate
    state.player.vx = lerp(state.player.vx, steer * handle, clamp(dt*4.8,0,1));
    state.player.x += state.player.vx * dt;

    // clamp within road bounds
    const roadHalf = state.road.w/2 - 18;
    state.player.x = clamp(state.player.x, -roadHalf, roadHalf);

    // spawns
    state.spawn.t += dt;
    state.spawn.coinT += dt;

    // spawn rate increases with score
    const difficulty = 1 + (state.score / 5000);
    const obstacleInterval = clamp(0.85 / difficulty, 0.38, 0.85);
    if(state.spawn.t >= obstacleInterval){
      state.spawn.t = 0;
      spawnObstacle();
    }
    if(state.spawn.coinT >= 1.15){
      state.spawn.coinT = 0;
      if(Math.random() < 0.80) spawnCoins();
    }

    // move road scroll
    state.road.scroll += dt * state.speed * 0.85;

    // move obstacles and do lane changes
    for(const o of state.obstacles){
      if(!o.alive) continue;
      o.y += dt * state.speed * (1.2 + o.speed);
      o.laneChangeCD -= dt;

      // Allow lane changes sometimes (like old 2D)
      if(o.laneChangeCD <= 0 && Math.random() < 0.65){
        o.laneChangeCD = 0.7 + Math.random()*1.2;
        const dir = Math.random() < 0.5 ? -1 : 1;
        const nl = clamp(o.lane + dir, 0, 2);
        o.targetLane = nl;
      }

      // smoothly move to target lane
      const targetX = (state.road.laneXs[o.targetLane] - window.innerWidth/2);
      o.x = lerp(o.x, targetX, clamp(dt*2.6,0,1));
      // update lane when close
      if(Math.abs(o.x - targetX) < 4) o.lane = o.targetLane;

      // offscreen
      if(o.y > window.innerHeight + 160) o.alive = false;

      // near-miss: close pass without collision
      const pr = playerRect();
      const or = obstacleRect({x: window.innerWidth/2 + o.x, y:o.y, w:o.w, h:o.h});
      const closeX = Math.abs((pr.x+pr.w/2) - (or.x+or.w/2)) < 56;
      const closeY = Math.abs((pr.y+pr.h/2) - (or.y+or.h/2)) < 66;
      if(closeX && closeY && !o._near && !rectsOverlap(pr.x,pr.y,pr.w,pr.h,or.x,or.y,or.w,or.h)){
        o._near = true;
        state.nearMiss++;
        state.combo = clamp(state.combo + 1, 1, 12);
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        state.comboT = 2.6;
        if(!Profile.settings.reducedMotion) state.effects.push({type:"pulse", t:0.18});
      }
    }

    // coins
    for(const c of state.coins){
      if(!c.alive) continue;
      c.y += dt * state.speed * 1.65;
      if(c.y > window.innerHeight + 120) c.alive = false;
      // collision (circle-ish)
      const pr = playerRect();
      const cx = window.innerWidth/2 + c.x;
      const cy = c.y;
      const px = pr.x + pr.w/2;
      const py = pr.y + pr.h/2;
      const dist = Math.hypot(cx - px, cy - py);
      if(dist < 46){
        c.alive = false;
        state.runCoins += 1;
        state.score += 12 * state.combo;
        state.comboT = 2.6;
        AudioSys.beep(760, 0.03, "sine", 0.035);
        if(Profile.settings.vibration && navigator.vibrate) navigator.vibrate(8);
      }
    }

    // collision with obstacles
    if(state.invulnT <= 0){
      const pr = playerRect();
      for(const o of state.obstacles){
        if(!o.alive) continue;
        const or = obstacleRect({x: window.innerWidth/2 + o.x, y:o.y, w:o.w, h:o.h});
        if(rectsOverlap(pr.x,pr.y,pr.w,pr.h,or.x,or.y,or.w,or.h)){
          crash();
          break;
        }
      }
    }

    // score tick
    state.score += dt * (18 + state.speed*0.55) * state.combo;

    // cleanup arrays
    state.obstacles = state.obstacles.filter(o=>o.alive);
    state.coins = state.coins.filter(c=>c.alive);

    // effects decay
    for(const fx of state.effects){
      fx.t -= dt;
    }
    state.effects = state.effects.filter(fx => fx.t > 0);

    UI.refreshHUD();
  }

  function crash(){
    state.hp -= 1;
    state.invulnT = 1.2;
    state.combo = 1;
    state.comboT = 0;

    if(Profile.settings.vibration && navigator.vibrate) navigator.vibrate(60);
    AudioSys.beep(170, 0.12, "sawtooth", 0.08);

    if(!Profile.settings.reducedMotion){
      state.effects.push({type:"shake", t:0.22});
      state.effects.push({type:"flash", t:0.12});
    }

    if(state.hp <= 0){
      endRun();
    }else{
      Toast.show("Hit! Invulnerable…");
    }
  }

  function endRun(){
    state.running = false;

    // award coins into profile
    Profile.coins += state.runCoins;
    Storage.save(Profile);

    // update tasks with run stats
    Daily.onRunStats({
      coins: state.runCoins,
      score: Math.floor(state.score),
      nitroUses: state.nitroUses,
      maxCombo: state.maxCombo,
      nearMiss: state.nearMiss
    });

    // show overlay
    document.getElementById("finalScore").textContent = String(Math.floor(state.score));
    document.getElementById("finalCoins").textContent = String(state.runCoins|0);
    const nameBox = document.getElementById("playerName");
    nameBox.value = Profile.name || "";
    document.getElementById("submitStatus").textContent = "";
    document.getElementById("gameOverOverlay").classList.remove("hidden");

    // refresh home values so coins show after returning
    UI.refreshHome();
  }

  function render(){
    if(!ctx) return;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // clear
    ctx.clearRect(0,0,w,h);

    // background
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0,0,w,h);

    // road
    const roadW = state.road.w;
    const cx = w/2;
    const left = cx - roadW/2;
    const right = cx + roadW/2;

    // road glow
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(0,247,255,0.06)";
    ctx.fillRect(left-12, 0, roadW+24, h);
    ctx.restore();

    // road asphalt
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(left, 0, roadW, h);

    // lane lines (dashed)
    const dashH = 30;
    const gap = 28;
    const scroll = state.road.scroll % (dashH+gap);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 3;
    for(let i=1;i<3;i++){
      const x = state.road.laneXs[i] - roadW/3/2; // approx? keep simple
    }
    const laneX1 = (left + roadW/3);
    const laneX2 = (left + 2*roadW/3);
    for(const lx of [laneX1, laneX2]){
      for(let y=-scroll; y<h+dashH; y += dashH+gap){
        ctx.beginPath();
        ctx.moveTo(lx, y);
        ctx.lineTo(lx, y+dashH);
        ctx.stroke();
      }
    }

    // edges
    ctx.strokeStyle = "rgba(0,247,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(left,0); ctx.lineTo(left,h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(right,0); ctx.lineTo(right,h); ctx.stroke();

    // coins
    for(const c of state.coins){
      const x = cx + c.x;
      const y = c.y;
      // glow coin
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI*2);
      ctx.fillStyle = "rgba(0,247,255,0.75)";
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI*2);
      ctx.fillStyle = "rgba(0,247,255,0.25)";
      ctx.fill();
      ctx.restore();
    }

    // obstacles cars
    for(const o of state.obstacles){
      const x = cx + o.x;
      const y = o.y;
      drawCar(x, y, o.w, o.h, "obstacle");
    }

    // player
    const pr = playerRect();
    const px = pr.x + pr.w/2;
    const py = pr.y + pr.h/2;
    drawCar(px, py, pr.w, pr.h, "player");

    // effects
    if(!Profile.settings.reducedMotion){
      for(const fx of state.effects){
        if(fx.type === "flash"){
          ctx.save();
          ctx.globalAlpha = clamp(fx.t/0.12,0,1) * 0.25;
          ctx.fillStyle = "rgba(255,75,75,1)";
          ctx.fillRect(0,0,w,h);
          ctx.restore();
        }
        if(fx.type === "pulse"){
          ctx.save();
          ctx.globalAlpha = clamp(fx.t/0.18,0,1) * 0.15;
          ctx.fillStyle = "rgba(0,247,255,1)";
          ctx.fillRect(0,0,w,h);
          ctx.restore();
        }
      }
    }

    // phase overlay
    if(state.phaseT > 0){
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    }
  }

  function drawCar(cx, cy, w, h, kind){
    // simple but premium-looking procedural car (rounded body + neon)
    const inv = state.invulnT > 0;
    const isPlayer = kind === "player";

    const car = CARS[Profile.selectedCar] || CARS.street;

    // choose accent
    let a1 = "rgba(0,247,255,0.9)";
    let a2 = "rgba(255,75,216,0.85)";
    if(isPlayer){
      // tint based on selected car id
      const id = car.id;
      if(id === "street"){ a1="rgba(0,247,255,0.85)"; a2="rgba(255,255,255,0.55)"; }
      if(id === "sprint"){ a1="rgba(255,75,216,0.85)"; a2="rgba(0,247,255,0.65)"; }
      if(id === "drift"){ a1="rgba(255,220,80,0.9)"; a2="rgba(0,247,255,0.55)"; }
      if(id === "beast"){ a1="rgba(255,75,75,0.9)"; a2="rgba(255,75,216,0.55)"; }
      if(id === "tank"){ a1="rgba(140,255,170,0.85)"; a2="rgba(255,255,255,0.40)"; }
      if(id === "ghost"){ a1="rgba(255,255,255,0.75)"; a2="rgba(0,247,255,0.55)"; }
      if(id === "formula"){ a1="rgba(0,247,255,0.90)"; a2="rgba(255,75,216,0.70)"; }
    }else{
      a1="rgba(255,255,255,0.50)";
      a2="rgba(255,75,216,0.35)";
    }

    // invuln blink
    let alpha = 1.0;
    if(inv && isPlayer){
      alpha = 0.55 + 0.45 * Math.sin(nowMs()*0.03);
    }
    if(state.phaseT > 0 && isPlayer) alpha = 0.55;

    const x = cx - w/2;
    const y = cy - h/2;
    const r = 14;

    ctx.save();
    ctx.globalAlpha = alpha;

    // glow under
    ctx.save();
    ctx.globalAlpha *= 0.35;
    ctx.fillStyle = a1;
    roundRect(ctx, x-6, y-8, w+12, h+16, r+8);
    ctx.fill();
    ctx.restore();

    // body
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // neon stripe
    ctx.fillStyle = a1;
    roundRect(ctx, x + w*0.18, y + h*0.10, w*0.64, h*0.16, 10);
    ctx.fill();

    // windshield
    ctx.fillStyle = "rgba(255,255,255,0.20)";
    roundRect(ctx, x + w*0.18, y + h*0.30, w*0.64, h*0.26, 12);
    ctx.fill();

    // rear stripe
    ctx.fillStyle = a2;
    roundRect(ctx, x + w*0.22, y + h*0.76, w*0.56, h*0.10, 10);
    ctx.fill();

    // wheels
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(x - 4, y + h*0.18, 6, h*0.18);
    ctx.fillRect(x - 4, y + h*0.62, 6, h*0.18);
    ctx.fillRect(x + w - 2, y + h*0.18, 6, h*0.18);
    ctx.fillRect(x + w - 2, y + h*0.62, 6, h*0.18);

    // nitro trail
    if(isPlayer && state.nitroT > 0){
      ctx.save();
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = "rgba(0,247,255,0.35)";
      roundRect(ctx, x + w*0.30, y + h + 6, w*0.40, 22, 12);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function loop(){
    if(!state.running) return;
    const t = nowMs();
    let dt = (t - state.lastMs) / 1000;
    state.lastMs = t;
    dt = clamp(dt, 0.0, 0.040); // stable physics
    Joystick.tick(dt);
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  return {
    state,
    startNewRun,
    restart,
    pause,
    resumeFromPause,
    stopToHome,
    hasPausedRun,
    useNitroOrAbility,
    resize
  };
})();

// -------------------------
// Boot sequence
// -------------------------
async function boot(){
  UI.setBootProgress(0.10);
  await sleep(180);
  UI.setBootProgress(0.28);

  // Ensure tasks for today
  Daily.ensureTasks();
  UI.setBootProgress(0.50);
  await sleep(130);

  // Optional Supabase script load if configured
  if(SUPABASE_URL && SUPABASE_ANON){
    await loadSupabase();
  }
  UI.setBootProgress(0.72);
  await sleep(120);

  // Init LB wiring
  Leaderboard.bind();
  UI.setBootProgress(0.86);
  await sleep(120);

  UI.setBootProgress(1.0);
  await sleep(160);
  UI.hideBoot();
  UI.showHome();
  UI.refreshHome();
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function loadSupabase(){
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

// -------------------------
// App init
// -------------------------
window.addEventListener("load", () => {
  UI.bind();
  Joystick.bind();

  // apply saved name into profile, if any
  const nameBox = document.getElementById("playerName");
  nameBox.addEventListener("input", () => {
    Profile.name = nameBox.value.trim().slice(0,16);
    Storage.save(Profile);
  });

  // resize
  Game.resize();
  window.addEventListener("resize", () => Game.resize());

  // allow audio unlock on first touch/click anywhere
  window.addEventListener("pointerdown", () => AudioSys.onUserGesture(), {once:true});

  // initial settings for music
  if(Profile.settings.music) AudioSys.startMusic();

  boot();
});
