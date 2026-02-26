import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x05060a, 6, 85);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Cameras
    this.camHome = new THREE.PerspectiveCamera(70, 1, 0.1, 260);
    this.camGame = new THREE.PerspectiveCamera(80, 1, 0.1, 320);
    this.activeCam = this.camHome;

    // Lights
    this.scene.add(new THREE.AmbientLight(0x7aa6ff, 0.36));

    this.key = new THREE.DirectionalLight(0xffffff, 1.15);
    this.key.position.set(6, 10, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 90;
    this.key.shadow.camera.left = -16;
    this.key.shadow.camera.right = 16;
    this.key.shadow.camera.top = 16;
    this.key.shadow.camera.bottom = -16;
    this.key.shadow.bias = -0.00035;
    this.key.shadow.normalBias = 0.02;

    this.keyTarget = new THREE.Object3D();
    this.keyTarget.position.set(0, 0, -20);
    this.scene.add(this.keyTarget);
    this.key.target = this.keyTarget;
    this.scene.add(this.key);

    const neon1 = new THREE.PointLight(0xff4dff, 1.2, 60);
    neon1.position.set(-5, 3.2, -18);
    this.scene.add(neon1);

    const neon2 = new THREE.PointLight(0x7cffea, 1.0, 55);
    neon2.position.set(5, 2.8, -26);
    this.scene.add(neon2);

    // World (STATIC road pieces — avoids shadow drift)
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

    // Player + preview stand
    this.playerMesh = this.makePlayerCar();
    this.scene.add(this.playerMesh);

    this.previewPad = this.makePreviewPad();
    this.scene.add(this.previewPad);

    // Pools for gameplay objects
    this.obsMeshes = [];
    this.coinMeshes = [];
    this.buffMeshes = [];

    // Effects
    this.shakeT = 0;
    this.shakeAmt = 0;

    // Skin
    this.skin = { body: 0x00ffff, glow: 0xff4dff };

    // Home animation
    this.homeT = 0;

    window.addEventListener("resize", () => this.resize());
    this.resize();

    // Default mode
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

      this.camHome.position.set(0, 2.1, 5.8);
      this.camHome.lookAt(0, 0.7, -2.5);

      // Softer fog for garage
      this.scene.fog.near = 6;
      this.scene.fog.far = 90;
    } else {
      this.activeCam = this.camGame;
      this.previewPad.visible = false;

      this.camGame.position.set(0, 2.2, 5.8);
      this.camGame.lookAt(0, 0.6, -30);

      // Stronger depth in run
      this.scene.fog.near = 5;
      this.scene.fog.far = 70;
    }
  }

  setPlayerSkin(skin) {
    // skin: { body: hex, glow: hex }
    this.skin = skin;

    this.playerMesh.traverse(obj => {
      if (!obj.isMesh) return;
      const tag = obj.userData?.tag;
      if (!tag) return;

      if (tag === "body" && obj.material?.emissive) {
        obj.material.emissive.setHex(skin.body);
        obj.material.emissiveIntensity = 1.05;
      }
      if (tag === "glow" && obj.material?.emissive) {
        obj.material.emissive.setHex(skin.glow);
        obj.material.emissiveIntensity = 3.2;
      }
      if (tag === "head" && obj.material?.emissive) {
        obj.material.emissive.setHex(0x7cffea);
        obj.material.emissiveIntensity = 3.1;
      }
      if (tag === "underglow" && obj.material?.emissive) {
        obj.material.emissive.setHex(skin.glow);
        obj.material.emissiveIntensity = 2.2;
      }
    });
  }

  // ---------- WORLD ----------

  makeRoad() {
    const group = new THREE.Group();

    const roadGeo = new THREE.PlaneGeometry(8.6, 260, 18, 140);
    const pos = roadGeo.attributes.position;

    // Camber + gentle hills (depth cue)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const camber = (x * x) * 0.03;
      const hills = Math.sin((y + 120) * 0.07) * 0.12;
      pos.setZ(i, camber + hills);
    }
    pos.needsUpdate = true;
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      roughness: 0.55,
      metalness: 0.12,
      emissive: 0x020717,
      emissiveIntensity: 0.6
    });

    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -120;
    road.receiveShadow = true;
    group.add(road);

    // Neon edges
    const edgeGeo = new THREE.BoxGeometry(0.16, 0.12, 260);
    const edgeMatL = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0x7cffea, emissiveIntensity: 2.2 });
    const edgeMatR = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0xff4dff, emissiveIntensity: 2.2 });

    const left = new THREE.Mesh(edgeGeo, edgeMatL);
    left.position.set(-4.3, 0.06, -120);
    left.receiveShadow = true;
    group.add(left);

    const right = new THREE.Mesh(edgeGeo, edgeMatR);
    right.position.set(4.3, 0.06, -120);
    right.receiveShadow = true;
    group.add(right);

    return group;
  }

  makeLaneLines() {
    const group = new THREE.Group();
    const lineGeo = new THREE.BoxGeometry(0.05, 0.02, 260);
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      emissive: 0x2a6cff,
      emissiveIntensity: 2.0,
      roughness: 0.45,
      metalness: 0.1
    });

    const l1 = new THREE.Mesh(lineGeo, lineMat);
    l1.position.set(-1.1, 0.03, -120);
    l1.receiveShadow = true;
    group.add(l1);

    const l2 = new THREE.Mesh(lineGeo, lineMat);
    l2.position.set(1.1, 0.03, -120);
    l2.receiveShadow = true;
    group.add(l2);

    return group;
  }

  makeRails() {
    const group = new THREE.Group();
    const railGeo = new THREE.BoxGeometry(0.25, 0.25, 260);
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      emissive: 0x2a6cff,
      emissiveIntensity: 1.2,
      roughness: 0.35,
      metalness: 0.2
    });

    const left = new THREE.Mesh(railGeo, railMat);
    left.position.set(-4.9, 0.35, -120);
    left.castShadow = true;
    left.receiveShadow = true;

    const right = new THREE.Mesh(railGeo, railMat);
    right.position.set(4.9, 0.35, -120);
    right.castShadow = true;
    right.receiveShadow = true;

    group.add(left, right);
    return group;
  }

  makePosts() {
    const group = new THREE.Group();

    const geo = new THREE.BoxGeometry(0.25, 2.5, 0.25);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      emissive: 0x7cffea,
      emissiveIntensity: 0.22,
      roughness: 0.6,
      metalness: 0.05
    });

    for (let i = 0; i < 80; i++) {
      const z = -10 - i * 3.2;

      const left = new THREE.Mesh(geo, mat);
      left.position.set(-5.4, 1.25, z);
      left.castShadow = true;
      group.add(left);

      const right = new THREE.Mesh(geo, mat);
      right.position.set(5.4, 1.25, z);
      right.castShadow = true;
      group.add(right);
    }

    return group;
  }

  makePreviewPad() {
    const group = new THREE.Group();

    const padGeo = new THREE.CylinderGeometry(2.0, 2.2, 0.15, 48);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      roughness: 0.45,
      metalness: 0.12,
      emissive: 0x2a6cff,
      emissiveIntensity: 0.3
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0, 0.02, -2.5);
    pad.receiveShadow = true;
    group.add(pad);

    const ringGeo = new THREE.TorusGeometry(1.65, 0.06, 14, 70);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      emissive: 0xff4dff,
      emissiveIntensity: 1.4,
      roughness: 0.25,
      metalness: 0.1
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0.12, -2.5);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    return group;
  }

  // ---------- CAR (improved: wheels + fenders + headlights + spoiler) ----------

  makePlayerCar() {
    const group = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0b1020,
      metalness: 0.55,
      roughness: 0.18,
      emissive: 0x00ffff,
      emissiveIntensity: 1.05
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x070a14,
      metalness: 0.35,
      roughness: 0.35
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x081025,
      metalness: 0.3,
      roughness: 0.06,
      emissive: 0x2a6cff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.92
    });

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      emissive: 0xff4dff,
      emissiveIntensity: 3.2
    });

    const headMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      emissive: 0x7cffea,
      emissiveIntensity: 3.1
    });

    const underMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      emissive: 0xff4dff,
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.9
    });

    // Main chassis (lower + longer)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.26, 1.85), bodyMat);
    chassis.position.set(0, 0.32, 0);
    chassis.userData.tag = "body";
    group.add(chassis);

    // Upper body / cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.24, 0.78), bodyMat);
    cabin.position.set(0, 0.54, -0.08);
    cabin.userData.tag = "body";
    group.add(cabin);

    // Canopy glass
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.20, 0.62), glassMat);
    canopy.position.set(0, 0.62, -0.08);
    group.add(canopy);

    // Front wedge (gives non-block silhouette)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.18, 0.62), bodyMat);
    nose.position.set(0, 0.33, -0.88);
    nose.scale.y = 0.85;
    nose.userData.tag = "body";
    group.add(nose);

    // Spoiler
    const spoilerBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.25), trimMat);
    spoilerBase.position.set(0, 0.54, 0.78);
    group.add(spoilerBase);

    const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.18), trimMat);
    spoilerWing.position.set(0, 0.62, 0.88);
    group.add(spoilerWing);

    // Fenders (left/right)
    const fenderGeo = new THREE.BoxGeometry(0.22, 0.16, 0.72);
    const fL = new THREE.Mesh(fenderGeo, trimMat);
    fL.position.set(-0.55, 0.30, 0.05);
    group.add(fL);

    const fR = new THREE.Mesh(fenderGeo, trimMat);
    fR.position.set(0.55, 0.30, 0.05);
    group.add(fR);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.14, 18);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x0a0d16,
      roughness: 0.85,
      metalness: 0.05
    });

    const wheelZ = [-0.62, 0.56];
    const wheelX = [-0.55, 0.55];

    for (const z of wheelZ) {
      for (const x of wheelX) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.20, z);
        w.castShadow = true;
        group.add(w);
      }
    }

    // Headlights
    const headGeo = new THREE.BoxGeometry(0.22, 0.08, 0.08);
    const h1 = new THREE.Mesh(headGeo, headMat);
    h1.position.set(-0.30, 0.36, -1.15);
    h1.userData.tag = "head";
    group.add(h1);

    const h2 = new THREE.Mesh(headGeo, headMat);
    h2.position.set(0.30, 0.36, -1.15);
    h2.userData.tag = "head";
    group.add(h2);

    // Tail glow bar
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.10, 0.14), glowMat);
    tail.position.set(0, 0.30, 0.98);
    tail.userData.tag = "glow";
    group.add(tail);

    // Underglow (plane)
    const under = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.1), underMat);
    under.rotation.x = -Math.PI / 2;
    under.position.set(0, 0.06, 0.02);
    under.userData.tag = "underglow";
    group.add(under);

    // Shadows
    group.traverse(obj => {
      if (obj.isMesh) obj.castShadow = true;
    });

    return group;
  }

  makeObstacle(kind = "car") {
    // Slightly simpler but still “car-like”
    const group = new THREE.Group();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x13061f,
      metalness: 0.35,
      roughness: 0.35,
      emissive: 0xff4060,
      emissiveIntensity: 0.75
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.26, 1.9), mat);
    body.position.set(0, 0.32, 0);
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.78), mat);
    cabin.position.set(0, 0.54, -0.06);
    group.add(cabin);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.10, 0.14), new THREE.MeshStandardMaterial({
      color: 0x071025, emissive: 0xff4060, emissiveIntensity: 2.4
    }));
    tail.position.set(0, 0.30, 0.98);
    group.add(tail);

    group.traverse(obj => { if (obj.isMesh) obj.castShadow = true; });
    return group;
  }

  makeCoin() {
    const geo = new THREE.TorusGeometry(0.34, 0.11, 12, 22);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x081025,
      metalness: 0.1,
      roughness: 0.2,
      emissive: 0x57ff9a,
      emissiveIntensity: 3.0
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.62;
    return mesh;
  }

  makeBuff(type) {
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const emissiveMap = { magnet: 0x7cffea, shield: 0x2a6cff, scorex2: 0xff4dff, nitro: 0xffc14d };
    const mat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      metalness: 0.2,
      roughness: 0.25,
      emissive: emissiveMap[type] ?? 0xffffff,
      emissiveIntensity: 2.8
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.95;
    return mesh;
  }

  onNearMiss() {
    this.shakeT = 0.18;
    this.shakeAmt = 0.10;
  }

  // ---------- RENDER: HOME (garage) ----------

  renderHome(dt) {
    this.homeT += dt;

    // gentle orbit + bob
    const t = this.homeT;
    const orbit = 0.45;
    const camX = Math.sin(t * 0.35) * orbit;
    const camZ = 5.8 + Math.cos(t * 0.35) * 0.15;

    this.camHome.position.set(camX, 2.1, camZ);
    this.camHome.lookAt(0, 0.7, -2.5);

    // rotate car slowly
    this.playerMesh.position.set(0, 0.06 + Math.sin(t * 1.2) * 0.02, -2.5);
    this.playerMesh.rotation.y = 0.25 + t * 0.35;

    // subtle pad ring rotation
    this.previewPad.rotation.y = t * 0.2;

    this.renderer.render(this.scene, this.activeCam);
  }

  // ---------- RENDER: GAME ----------

  renderGame(state, dt) {
    // speed-based FOV
    const speedFeel = clamp01((state.player.speed - 12) / 24);
    const targetFov = 80 + speedFeel * 8 + (state.player.nitro?.t > 0 ? 10 : 0);
    this.camGame.fov = this.camGame.fov + (targetFov - this.camGame.fov) * 0.08;
    this.camGame.updateProjectionMatrix();

    // player lean during drift
    const lean = state.player.drift?.amount * state.player.drift?.direction * 0.22 || 0;
    this.playerMesh.rotation.z = this.playerMesh.rotation.z + (lean - this.playerMesh.rotation.z) * 0.2;

    // invuln flicker
    const inv = state.player.invulnT > 0;
    this.playerMesh.visible = inv ? (Math.floor(state.t * 18) % 2 === 0) : true;

    // player position (game core controls x)
    this.playerMesh.position.set(state.player.x, 0, 0);

    // camera follow + roll
    const targetCamX = state.player.x * 0.35;
    this.camGame.position.x += (targetCamX - this.camGame.position.x) * 0.08;

    const roll = (state.player.drift?.amount || 0) * (state.player.drift?.direction || 0) * 0.12;
    this.camGame.rotation.z += (roll - this.camGame.rotation.z) * 0.06;

    // camera shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeAmt * (this.shakeT / 0.18);
      this.camGame.position.x += (Math.random() - 0.5) * s;
      this.camGame.position.y = 2.2 + (Math.random() - 0.5) * s;
    } else {
      this.camGame.position.y += (2.2 - this.camGame.position.y) * 0.12;
    }

    this.camGame.lookAt(0, 0.6, -30);

    // Obstacles
    while (this.obsMeshes.length < state.obstacles.length) {
      const o = state.obstacles[this.obsMeshes.length];
      const mesh = this.makeObstacle(o.kind);
      this.scene.add(mesh);
      this.obsMeshes.push(mesh);
    }
    while (this.obsMeshes.length > state.obstacles.length) {
      const m = this.obsMeshes.pop();
      this.scene.remove(m);
      disposeGroup(m);
    }
    for (let i = 0; i < state.obstacles.length; i++) {
      const o = state.obstacles[i];
      const m = this.obsMeshes[i];
      m.visible = !!o.alive;
      m.position.set(o.x, 0, o.z);
      m.rotation.y += dt * 0.45;
    }

    // Coins
    while (this.coinMeshes.length < state.coinPacks.length) {
      const m = this.makeCoin();
      this.scene.add(m);
      this.coinMeshes.push(m);
    }
    while (this.coinMeshes.length > state.coinPacks.length) {
      const m = this.coinMeshes.pop();
      this.scene.remove(m);
      disposeMesh(m);
    }
    for (let i = 0; i < state.coinPacks.length; i++) {
      const c = state.coinPacks[i];
      const m = this.coinMeshes[i];
      m.visible = !!c.alive;
      m.position.set(c.x, 0, c.z);
      m.rotation.z += dt * 2.2;
    }

    // Buffs
    while (this.buffMeshes.length < state.buffs.length) {
      const b = state.buffs[this.buffMeshes.length];
      const m = this.makeBuff(b.type);
      this.scene.add(m);
      this.buffMeshes.push(m);
    }
    while (this.buffMeshes.length > state.buffs.length) {
      const m = this.buffMeshes.pop();
      this.scene.remove(m);
      disposeMesh(m);
    }
    for (let i = 0; i < state.buffs.length; i++) {
      const b = state.buffs[i];
      const m = this.buffMeshes[i];
      m.visible = !!b.alive;
      m.position.set(b.x, 0, b.z);
      m.rotation.x += dt * 1.0;
      m.rotation.y += dt * 1.2;
    }

    this.renderer.render(this.scene, this.activeCam);
  }
}

// ---------- helpers ----------
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function disposeMesh(m) {
  if (!m) return;
  if (m.geometry) m.geometry.dispose?.();
  if (m.material) m.material.dispose?.();
}

function disposeGroup(g) {
  if (!g) return;
  g.traverse(obj => {
    if (obj.isMesh) disposeMesh(obj);
  });
}
