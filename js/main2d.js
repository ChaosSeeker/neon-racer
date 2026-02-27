
const CARS = {
  street: { name:"Street Starter", speed:6, accel:6, handling:6, nitro:5, hp:1 },
  sprint: { name:"Neon Sprint", speed:9, accel:7, handling:4, nitro:6, hp:1 },
  drift: { name:"Drift King", speed:7, accel:6, handling:9, nitro:5, hp:1 },
  beast: { name:"Nitro Beast", speed:7, accel:5, handling:5, nitro:10, hp:1 },
  tank: { name:"Tank Runner", speed:5, accel:4, handling:6, nitro:4, hp:2 },
  ghost: { name:"Ghost Rider", speed:7, accel:7, handling:6, nitro:6, hp:1 },
  formula: { name:"Hyper Formula", speed:10, accel:9, handling:5, nitro:7, hp:1 }
};

let selectedCar = "street";
let canvas, ctx;

const UI = {
  show(screen){
    document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
    document.getElementById(screen).classList.remove("hidden");
  },
  init(){
    document.getElementById("playBtn").onclick = Game.start;
    document.getElementById("shopBtn").onclick = ()=>UI.show("shop");
    UI.populateCars();
  },
  populateCars(){
    const container = document.getElementById("carList");
    container.innerHTML = "";
    Object.keys(CARS).forEach(key=>{
      const car = CARS[key];
      const btn = document.createElement("button");
      btn.innerText = car.name + 
        " | SPD:"+car.speed+
        " ACC:"+car.accel+
        " HND:"+car.handling+
        " NIT:"+car.nitro;
      btn.onclick = ()=>{
        selectedCar = key;
        alert(car.name + " Selected!");
      };
      container.appendChild(btn);
    });
  }
};

const Game = {
  start(){
    document.getElementById("home").classList.add("hidden");
    canvas.style.display = "block";
    document.getElementById("joystick").style.display = "block";
    Game.loop();
  },
  loop(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#0ff";
    ctx.fillRect(canvas.width/2 - 20, canvas.height - 100, 40, 80);
    requestAnimationFrame(Game.loop);
  }
};

window.onload = ()=>{
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.getElementById("loading").style.display = "none";
  UI.init();
  UI.show("home");
};
