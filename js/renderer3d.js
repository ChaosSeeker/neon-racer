import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x05060a, 6, 90);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Cameras
    this.camHome = new THREE.PerspectiveCamera(70, 1, 0.1, 260);
    this.camGame = new THREE.PerspectiveCamera(80, 1, 0.1, 320);
    this.activeCam = this.camHome;

    // Lights
    this.scene.add(new THREE.AmbientLight(0x7aa6ff, 0.30));

    this.key = new THREE.DirectionalLight(0xffffff, 1.10);
    this.key.position.set(6, 10, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 110;
    this.key.shadow.camera.left = -18;
    this.key.shadow.camera.right = 18;
    this.key.shadow.camera.top = 18;
    this.key.shadow.camera.bottom = -18;
    this.key.shadow.bias = -0.00035;
    this.key.shadow.normalBias = 0.02;

    this.keyTarget = new THREE.Object3D();
    this.keyTarget.position.set(0, 0, -20);
    this.scene.add(this.keyTarget);
    this.key.target = this.keyTarget;
    this.scene.add(this.key);

    const rim1 = new THREE.PointLight(0xff4dff, 1.1, 80);
    rim1.position.set(-6, 3.2, -22);
    this.scene.add(rim1);

    const rim2 = new THREE.PointLight(0x7cffea, 1.0, 80);
    rim2.position.set(6, 2.8, -28);
    this.scene.add(rim2);

    // Universe / starfield background
    this.starfield = this.makeStarfield();
    this.scene.add(this.starfield);

    // City background (toggle with universe)
    this.city = this.makeCity();
    this.city.visible = false;
    this.scene.add(this.city);

    this.envMode = "space";
    this._envSeg = -1;

    // World
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.road = this.makeRoad();
    this.world.add(this.road);

    this.laneLines = this.makeLaneLines();
    this.world.add(this.laneLines);

    this.rails = this.makeRails();
    this.world.add(this.rails);

    this.posts = this.makePosts();
    this.world.add(this.posts);

    // Player mesh
    this.skin = { body: 0x00ffff, glow: 0xff4dff };
    this.playerMesh = this.makeCarMesh({ kind: "player", body: this.skin.body, glow: this.skin.glow });
    this.playerMesh.castShadow = true;
    this.playerMesh.receiveShadow = false;
    this.scene.add(this.playerMesh);

    // Ghost mesh
    this.ghostMesh = this.makeCarMesh({ kind: "ghost", body: 0xffffff, glow: 0x7cffea, ghost: true });
    this.ghostMesh.visible = false;
    this.scene.add(this.ghostMesh);

    // Preview pad (garage)
    this.previewPad = this.makePreviewPad();
    this.scene.add(this.previewPad);

    // Pools
    this.obsMeshes = [];
    this.coinMeshes = [];
    this.buffMeshes = [];

    // Effects
    this.shakeT = 0;
    this.shakeAmt = 0;
    this.homeT = 0;

    // Camera feel
    this.camRoll = 0;
    this.camFov = this.camGame.fov;

    window.addEventListener("resize", () => this.resize());
    this.resize();

    this.setMode("home");
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);

    this.camHome.aspect = w / h;
    this.camHome.updateProjectionMatrix();

    this.camGame.aspect = w / h;
    this.camGame.updateProjectionMatrix();
  }

  setMode(mode) {
    this.mode = mode;

    if (mode === "home") {
      this.activeCam = this.camHome;
      this.previewPad.visible = true;

      this.playerMesh.position.set(0, 0, -2.5);
      this.playerMesh.rotation.set(0, 0.2, 0);

      this.camHome.position.set(0, 2.2, 6.0);
      this.camHome.lookAt(0, 0.75, -2.5);

      this.scene.fog.near = 6;
      this.scene.fog.far = 95;
    } else {
      this.activeCam = this.camGame;
      this.previewPad.visible = false;

      this.camGame.position.set(0, 2.45, 6.9);
      this.camGame.lookAt(0, 0.65, -30);

      this.scene.fog.near = 5;
      this.scene.fog.far = 80;
    }
  }

  setPlayerSkin(skin) {
    this.skin = skin;

    this.playerMesh.traverse(obj => {
      if (!obj.isMesh) return;
      if (obj.userData?.matRole === "body") {
        obj.material.color.setHex(skin.body);
      }
      if (obj.userData?.matRole === "glow") {
        obj.material.emissive.setHex(skin.glow);
      }
      if (obj.userData?.matRole === "light") {
        obj.material.emissive.setHex(skin.glow);
      }
    });
  }

  setGhostVisible(on) {
    this.ghostMesh.visible = !!on;
  }

  shake(amt = 0.25, t = 0.20) {
    this.shakeAmt = Math.max(this.shakeAmt, amt);
    this.shakeT = Math.max(this.shakeT, t);
  }

  // Update from GameCore state
  sync(state) {
    if (!state) return;

    this.updateEnvironment(state);

    // Player
    this.playerMesh.position.set(state.player.x, 0, state.player.zOff || 0);
    this.playerMesh.rotation.y = 0 + (state.player.drift.amount * 0.28) * (state.player.drift.direction || 0);

    // wheel spin
    const spin = (state.player.speed || 0) * 0.12;
    this.playerMesh.traverse(o => {
      if (o.userData?.isWheel) o.rotation.x -= spin;
    });

    // Obstacles
    this.ensurePool(this.obsMeshes, state.obstacles.length, () => this.makeCarMesh({ kind: "obstacle" }));

    for (let i = 0; i < state.obstacles.length; i++) {
      const o = state.obstacles[i];
      const mesh = this.obsMeshes[i];
      mesh.visible = true;

      mesh.position.set(o.x, 0, o.z);
      mesh.rotation.y = o.yaw || 0;

      const spinO = (o.speed || 0) * 0.11;
      mesh.traverse(w => { if (w.userData?.isWheel) w.rotation.x -= spinO; });

      // vary size for trucks
      const s = (o.kind === "truck") ? 1.15 : 1.0;
      mesh.scale.set(s, s, s);
    }
    for (let i = state.obstacles.length; i < this.obsMeshes.length; i++) this.obsMeshes[i].visible = false;

    // Coins
    this.ensurePool(this.coinMeshes, state.coinPacks.length, () => this.makeCoin());
    for (let i = 0; i < state.coinPacks.length; i++) {
      const c = state.coinPacks[i];
      const mesh = this.coinMeshes[i];
      mesh.visible = !!c.alive;
      mesh.position.set(c.x, 0.6, c.z);
      mesh.rotation.y += 0.05;
    }
    for (let i = state.coinPacks.length; i < this.coinMeshes.length; i++) this.coinMeshes[i].visible = false;

    // Buffs
    this.ensurePool(this.buffMeshes, state.buffs.length, () => this.makeBuff());
    for (let i = 0; i < state.buffs.length; i++) {
      const b = state.buffs[i];
      const mesh = this.buffMeshes[i];
      mesh.visible = !!b.alive;
      mesh.position.set(b.x, 0.75, b.z);
      mesh.rotation.y += 0.035;
      mesh.userData.buffType = b.type;
    }
    for (let i = state.buffs.length; i < this.buffMeshes.length; i++) this.buffMeshes[i].visible = false;

    // Camera follow feel
    const targetX = state.player.x * 0.22;
    const targetZ = (state.player.zOff || 0) * 0.20;

    // Slight camera roll while drifting/steering
    const rollTarget = clamp(state.player.x * -0.03, -0.16, 0.16) + (state.player.drift.amount * (state.player.drift.direction || 0)) * 0.10;
    this.camRoll = lerp(this.camRoll, rollTarget, 0.08);

    // speed FOV
    const speed = state.player.speed || 0;
    const fovTarget = 78 + clamp((speed - 12) * 0.35, 0, 8);
    this.camFov = lerp(this.camFov, fovTarget, 0.06);
    this.camGame.fov = this.camFov;
    this.camGame.updateProjectionMatrix();

    // shake
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= 1/60;
      const a = this.shakeAmt * (this.shakeT / Math.max(0.0001, this.shakeT));
      sx = (Math.random() - 0.5) * a;
      sy = (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }

    // place camera
    this.camGame.position.x = lerp(this.camGame.position.x, targetX + sx, 0.08);
    this.camGame.position.y = lerp(this.camGame.position.y, 2.3 + sy, 0.06);
    this.camGame.position.z = lerp(this.camGame.position.z, 6.9 + targetZ, 0.06);

    // look ahead
    const lookX = state.player.x * 0.12;
    const lookZ = -30 + targetZ;
    this.camGame.lookAt(lookX, 0.65, lookZ);

    // apply roll
    this.camGame.rotation.z = this.camRoll;
  }

  syncGhostFrame(frame) {
    if (!frame || !this.ghostMesh.visible) return;
    this.ghostMesh.position.set(frame.x || 0, 0.02, frame.z || 0);
    this.ghostMesh.rotation.y = (frame.r || 0) * 0.25;
  }

  render(dt) {
    // home animation
    if (this.mode === "home") {
      this.homeT += dt;
      this.playerMesh.rotation.y = 0.35 + Math.sin(this.homeT * 0.55) * 0.12;
      this.playerMesh.position.y = 0.02 + Math.sin(this.homeT * 1.1) * 0.02;
    }

    // subtle starfield drift
    this.starfield.rotation.y += dt * 0.02;

    this.renderer.render(this.scene, this.activeCam);
  }

  // --------- Mesh builders (Cars look real, not blocks) ----------

  makeCarMesh({ kind = "car", body, glow, ghost = false } = {}) {
    const g = new THREE.Group();

    const bodyColor = body ?? ((Math.random() < 0.5) ? 0x7cffea : 0xff6adf);
    const glowColor = glow ?? ((Math.random() < 0.5) ? 0xff4dff : 0x00ffff);

    const matBody = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.55,
      roughness: ghost ? 0.25 : 0.35,
      transparent: ghost,
      opacity: ghost ? 0.35 : 1.0,
    });
    matBody.emissive.setHex(ghost ? glowColor : 0x000000);
    matBody.emissiveIntensity = ghost ? 0.9 : 0.15;

    const matGlow = new THREE.MeshStandardMaterial({
      color: 0x101022,
      metalness: 0.2,
      roughness: 0.2,
      emissive: new THREE.Color(glowColor),
      emissiveIntensity: ghost ? 1.4 : 1.05,
      transparent: ghost,
      opacity: ghost ? 0.35 : 1.0,
    });

    const matGlass = new THREE.MeshStandardMaterial({
      color: 0x10152a,
      metalness: 0.1,
      roughness: 0.05,
      transparent: true,
      opacity: ghost ? 0.25 : 0.55,
      emissive: new THREE.Color(glowColor),
      emissiveIntensity: ghost ? 0.45 : 0.12,
    });

    const matWheel = new THREE.MeshStandardMaterial({
      color: 0x0c0f18,
      metalness: 0.2,
      roughness: 0.8,
      transparent: ghost,
      opacity: ghost ? 0.3 : 1.0,
    });

    // Main chassis: capsule (rounded edges!)
    const chassisGeo = new THREE.CapsuleGeometry(0.50, 1.25, 8, 16);
    const chassis = new THREE.Mesh(chassisGeo, matBody);
    chassis.userData.matRole = "body";
    chassis.rotation.z = Math.PI / 2; // lay it down
    chassis.position.set(0, 0.35, 0);
    chassis.castShadow = !ghost;
    chassis.receiveShadow = true;
    g.add(chassis);

    // Cabin
    const cabinGeo = new THREE.CapsuleGeometry(0.34, 0.65, 8, 16);
    const cabin = new THREE.Mesh(cabinGeo, matGlass);
    cabin.rotation.z = Math.PI / 2;
    cabin.position.set(0, 0.65, -0.15);
    cabin.castShadow = !ghost;
    g.add(cabin);

    // Hood stripe glow
    const stripeGeo = new THREE.BoxGeometry(0.18, 0.06, 1.20);
    const stripe = new THREE.Mesh(stripeGeo, matGlow);
    stripe.userData.matRole = "glow";
    stripe.position.set(0, 0.56, 0.15);
    g.add(stripe);

    // Lights (emissive)
    const lightGeo = new THREE.BoxGeometry(0.55, 0.08, 0.10);
    const front = new THREE.Mesh(lightGeo, matGlow);
    front.userData.matRole = "light";
    front.position.set(0, 0.40, -0.70);
    g.add(front);

    const rear = new THREE.Mesh(lightGeo, matGlow);
    rear.userData.matRole = "light";
    rear.position.set(0, 0.38, 0.72);
    rear.scale.set(0.9, 1, 1);
    rear.position.z = 0.72;
    g.add(rear);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.10, 14);
    const wheelPositions = [
      [-0.42, 0.22, -0.48],
      [ 0.42, 0.22, -0.48],
      [-0.42, 0.22,  0.48],
      [ 0.42, 0.22,  0.48],
    ];
    for (const [x, y, z] of wheelPositions) {
      const w = new THREE.Mesh(wheelGeo, matWheel);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      w.userData.isWheel = true;
      w.castShadow = !ghost;
      g.add(w);
    }

    // Under glow disc
    const glowGeo = new THREE.CircleGeometry(0.75, 18);
    const under = new THREE.Mesh(glowGeo, new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: new THREE.Color(glowColor),
      emissiveIntensity: ghost ? 1.0 : 0.65,
      transparent: true,
      opacity: ghost ? 0.22 : 0.22,
      side: THREE.DoubleSide
    }));
    under.userData.matRole = "glow";
    under.rotation.x = -Math.PI / 2;
    under.position.y = 0.02;
    g.add(under);

    g.name = `car_${kind}`;
    return g;
  }

  makeCoin() {
    const geo = new THREE.TorusGeometry(0.18, 0.06, 12, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd24d,
      metalness: 0.35,
      roughness: 0.25,
      emissive: new THREE.Color(0xffd24d),
      emissiveIntensity: 0.6,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  makeBuff() {
    const geo = new THREE.IcosahedronGeometry(0.26, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7cffea,
      metalness: 0.25,
      roughness: 0.2,
      emissive: new THREE.Color(0x7cffea),
      emissiveIntensity: 0.85,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }

  makePreviewPad() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.08, 10, 48),
      new THREE.MeshStandardMaterial({
        color: 0x121538,
        emissive: new THREE.Color(0xff4dff),
        emissiveIntensity: 0.5,
        metalness: 0.2,
        roughness: 0.3
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);

    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(2.0, 48),
      new THREE.MeshStandardMaterial({
        color: 0x0b1026,
        metalness: 0.2,
        roughness: 0.7,
        transparent: true,
        opacity: 0.6
      })
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = 0.01;
    disk.receiveShadow = true;
    g.add(disk);

    g.position.set(0, 0, -2.5);
    return g;
  }

  makeStarfield() {
    const count = 2200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // sphere-ish distribution
      const r = 130 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi) * 0.65; // flatter
      const z = r * Math.sin(phi) * Math.sin(theta) - 40;

      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const c = 0.75 + Math.random() * 0.25;
      col[i * 3 + 0] = c;
      col[i * 3 + 1] = c;
      col[i * 3 + 2] = 1.0;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });

    const pts = new THREE.Points(geo, mat);
    pts.position.set(0, 20, -40);
    return pts;
  }

  makeRoad() {
    const g = new THREE.Group();

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f22,
      metalness: 0.1,
      roughness: 0.85,
    });

    const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 180), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -78;
    road.receiveShadow = true;
    g.add(road);

    // neon edge strips
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x080a12,
      emissive: new THREE.Color(0x7cffea),
      emissiveIntensity: 0.65,
      metalness: 0.2,
      roughness: 0.25
    });
    const stripGeo = new THREE.BoxGeometry(0.12, 0.02, 180);
    const left = new THREE.Mesh(stripGeo, edgeMat);
    left.position.set(-6.5, 0.02, -78);
    g.add(left);

    const right = new THREE.Mesh(stripGeo, edgeMat);
    right.position.set(6.5, 0.02, -78);
    g.add(right);

    return g;
  }

  makeLaneLines() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0f22,
      emissive: new THREE.Color(0xff4dff),
      emissiveIntensity: 0.65,
      metalness: 0.15,
      roughness: 0.3,
      transparent: true,
      opacity: 0.85
    });

    const segGeo = new THREE.BoxGeometry(0.08, 0.01, 2.2);
    for (const x of [-2.6, 0, 2.6]) {
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(segGeo, mat);
        m.position.set(x, 0.021, -6 - i * 4.1);
        g.add(m);
      }
    }
    return g;
  }

  makeRails() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b1026,
      emissive: new THREE.Color(0x4b6bff),
      emissiveIntensity: 0.25,
      metalness: 0.3,
      roughness: 0.5
    });
    const railGeo = new THREE.BoxGeometry(0.18, 0.22, 180);
    const l = new THREE.Mesh(railGeo, mat);
    l.position.set(-7.2, 0.11, -78);
    l.castShadow = true;
    g.add(l);

    const r = new THREE.Mesh(railGeo, mat);
    r.position.set(7.2, 0.11, -78);
    r.castShadow = true;
    g.add(r);

    return g;
  }

  makePosts() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x11143a,
      emissive: new THREE.Color(0x7cffea),
      emissiveIntensity: 0.30,
      metalness: 0.2,
      roughness: 0.6
    });

    const geo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 12);
    for (let i = 0; i < 26; i++) {
      const z = -10 - i * 7;
      for (const x of [-7.6, 7.6]) {
        const p = new THREE.Mesh(geo, mat);
        p.position.set(x, 1.2, z);
        p.castShadow = true;
        g.add(p);
      }
    }
    return g;
  }

  ensurePool(arr, needed, makeFn) {
    while (arr.length < needed) {
      const m = makeFn();
      this.scene.add(m);
      arr.push(m);
    }
  }
}

function lerp(a, b, t){ return a + (b - a) * t; }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
