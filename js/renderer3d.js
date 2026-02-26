import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;

    // Scene + fog (depth cue)
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x05060a, 5, 70);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Camera: obvious 3D
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.1, 320);
    this.camera.position.set(0, 2.2, 5.8);
    this.camera.lookAt(0, 0.6, -30);

    // Lights
    this.scene.add(new THREE.AmbientLight(0x7aa6ff, 0.35));

    this.key = new THREE.DirectionalLight(0xffffff, 1.2);
    this.key.position.set(6, 10, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 90;
    this.key.shadow.camera.left = -16;
    this.key.shadow.camera.right = 16;
    this.key.shadow.camera.top = 16;
    this.key.shadow.camera.bottom = -16;

    // Shadow stability (reduces shimmer)
    this.key.shadow.bias = -0.00035;
    this.key.shadow.normalBias = 0.02;

    // Lock light direction to a fixed target (stability)
    this.keyTarget = new THREE.Object3D();
    this.keyTarget.position.set(0, 0, -30);
    this.scene.add(this.keyTarget);
    this.key.target = this.keyTarget;

    this.scene.add(this.key);

    const mag = new THREE.PointLight(0xff4dff, 1.2, 55);
    mag.position.set(-4, 3.2, -18);
    this.scene.add(mag);

    // World (STATIC). We do NOT move the road anymore -> fixes drifting shadow.
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

    // Player
    this.playerMesh = this.makePlayerCar();
    this.scene.add(this.playerMesh);

    // Pools
    this.obsMeshes = [];
    this.coinMeshes = [];
    this.buffMeshes = [];

    // Camera effects
    this.shakeT = 0;
    this.shakeAmt = 0;

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- WORLD ----------

  makeRoad() {
    const group = new THREE.Group();

    const roadGeo = new THREE.PlaneGeometry(8.6, 260, 18, 140);

    // Curve (camber + hills) => real 3D depth
    const pos = roadGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i); // length axis before rotation
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
    const edgeMatL = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0x7cf7ff, emissiveIntensity: 2.4 });
    const edgeMatR = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0xff4dff, emissiveIntensity: 2.4 });

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

    const x1 = -1.1;
    const x2 = 1.1;

    const l1 = new THREE.Mesh(lineGeo, lineMat);
    l1.position.set(x1, 0.03, -120);
    l1.receiveShadow = true;
    group.add(l1);

    const l2 = new THREE.Mesh(lineGeo, lineMat);
    l2.position.set(x2, 0.03, -120);
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
      emissiveIntensity: 1.3,
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
      emissive: 0x7cf7ff,
      emissiveIntensity: 0.25,
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

  // ---------- OBJECTS ----------

  makePlayerCar() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.95, 0.42, 1.6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0b1020,
      metalness: 0.6,
      roughness: 0.2,
      emissive: 0x00ffff,
      emissiveIntensity: 1.0
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.38;
    group.add(body);

    const canopyGeo = new THREE.BoxGeometry(0.58, 0.24, 0.72);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x081025,
      metalness: 0.25,
      roughness: 0.1,
      emissive: 0x2a6cff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.62, 0.06);
    group.add(canopy);

    const glowGeo = new THREE.BoxGeometry(1.05, 0.12, 0.25);
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0xff4dff, emissiveIntensity: 3.2 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0.25, 0.78);
    group.add(glow);

    group.position.set(0, 0, 0);

    group.traverse(obj => {
      if (obj.isMesh) obj.castShadow = true;
    });

    return group;
  }

  makeObstacle(kind = "car") {
    const group = new THREE.Group();

    if (kind === "car") {
      const bodyGeo = new THREE.BoxGeometry(1.0, 0.42, 1.7);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x14051f,
        metalness: 0.35,
        roughness: 0.35,
        emissive: 0xff4060,
        emissiveIntensity: 0.7
      });
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 0.38;
      group.add(body);

      const stripeGeo = new THREE.BoxGeometry(0.95, 0.09, 0.22);
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0xff4060, emissiveIntensity: 2.6 });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, 0.25, -0.55);
      group.add(stripe);
    } else {
      const geo = new THREE.BoxGeometry(1.1, 1.0, 1.1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x09102a,
        metalness: 0.1,
        roughness: 0.55,
        emissive: 0xff4060,
        emissiveIntensity: 1.0
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = 0.62;
      group.add(m);
    }

    group.traverse(obj => {
      if (obj.isMesh) obj.castShadow = true;
    });

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
    const emissiveMap = { magnet: 0x7cf7ff, shield: 0x2a6cff, scorex2: 0xff4dff, nitro: 0xffc14d };
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

  // FX
  onNearMiss() {
    this.shakeT = 0.18;
    this.shakeAmt = 0.10;
  }

  render(state, dt) {
    const speedFeel = clamp01((state.player.speed - 12) / 24);
    const targetFov = 80 + speedFeel * 8 + (state.player.nitro.t > 0 ? 10 : 0);
    this.camera.fov = this.camera.fov + (targetFov - this.camera.fov) * 0.08;
    this.camera.updateProjectionMatrix();

    // Player
    const lean = state.player.drift.amount * state.player.drift.direction * 0.22;
    this.playerMesh.rotation.z = this.playerMesh.rotation.z + (lean - this.playerMesh.rotation.z) * 0.2;

    const inv = state.player.invulnT > 0;
    this.playerMesh.visible = inv ? (Math.floor(state.t * 18) % 2 === 0) : true;

    this.playerMesh.position.set(state.player.x, 0, 0);

    // Camera follow (parallax)
    const targetCamX = state.player.x * 0.35;
    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.08;

    // Roll
    const roll = state.player.drift.amount * state.player.drift.direction * 0.12;
    this.camera.rotation.z += (roll - this.camera.rotation.z) * 0.06;

    // Shake (camera only; road is static so shadow won't drift)
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeAmt * (this.shakeT / 0.18);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y = 2.2 + (Math.random() - 0.5) * s;
    } else {
      this.camera.position.y += (2.2 - this.camera.position.y) * 0.12;
    }

    this.camera.lookAt(0, 0.6, -30);

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
      m.rotation.y += dt * 0.5;
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
      m.rotation.z += dt * 2.4;
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
      m.rotation.y += dt * 1.15;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

// helpers
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function disposeMesh(m) {
  if (!m) return;
  if (m.geometry) m.geometry.dispose?.();
  if (m.material) m.material.dispose?.();
}
function disposeGroup(g) {
  if (!g) return;
  g.traverse(obj => { if (obj.isMesh) disposeMesh(obj); });
}
