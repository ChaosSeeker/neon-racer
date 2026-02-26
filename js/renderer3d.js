import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x05060a, 12, 110);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Enable shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 260);
    this.camera.position.set(0, 2.6, 6.6);
    this.camera.lookAt(0, 0.6, -22);

    // lights
    const amb = new THREE.AmbientLight(0x7aa6ff, 0.35);
    this.scene.add(amb);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(6, 10, 6);
    key.castShadow = true;
    
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    
    this.scene.add(key);

    const mag = new THREE.PointLight(0xff4dff, 1.2, 40);
    mag.position.set(-4, 3, -12);
    this.scene.add(mag);

    // neon road
    this.road = this.makeRoad();
    this.scene.add(this.road);

    // lane markers
    this.laneLines = this.makeLaneLines();
    this.scene.add(this.laneLines);

    // player car
    this.playerMesh = this.makePlayerCar();
    this.scene.add(this.playerMesh);

    // pools
    this.obsMeshes = [];
    this.coinMeshes = [];
    this.buffMeshes = [];

    // background deco
    this.deco = this.makeDeco();
    this.scene.add(this.deco);

    // resize
    window.addEventListener("resize", () => this.resize());

    // small camera shake
    this.shakeT = 0;
    this.shakeAmt = 0;
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  makeRoad() {
    const group = new THREE.Group();

    const roadGeo = new THREE.PlaneGeometry(10, 220, 1, 80);
    const pos = roadGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i); // PlaneGeometry uses Y as length before rotation
      const curve = Math.pow(x / 5, 2) * 0.25; // subtle "bowl"
      pos.setZ(i, curve);
    }
pos.needsUpdate = true;
roadGeo.computeVertexNormals();
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      roughness: 0.45,
      metalness: 0.2,
      emissive: 0x020717,
      emissiveIntensity: 0.5
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true;
    road.rotation.x = -Math.PI / 2;
    road.position.z = -90;
    group.add(road);

    // neon edge strips
    const edgeGeo = new THREE.BoxGeometry(0.12, 0.06, 220);
    const edgeMatL = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0x7cf7ff, emissiveIntensity: 2.2 });
    const edgeMatR = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0xff4dff, emissiveIntensity: 2.2 });

    const left = new THREE.Mesh(edgeGeo, edgeMatL);
    left.position.set(-5.0, 0.03, -90);
    group.add(left);

    const right = new THREE.Mesh(edgeGeo, edgeMatR);
    right.position.set(5.0, 0.03, -90);
    group.add(right);

    return group;
  }

  makeLaneLines() {
    const group = new THREE.Group();
    const lineGeo = new THREE.BoxGeometry(0.06, 0.02, 220);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0x2a6cff, emissiveIntensity: 1.5 });

    const x1 = -2.2/2;
    const x2 =  2.2/2;

    const l1 = new THREE.Mesh(lineGeo, lineMat);
    l1.position.set(x1, 0.02, -90);
    group.add(l1);

    const l2 = new THREE.Mesh(lineGeo, lineMat);
    l2.position.set(x2, 0.02, -90);
    group.add(l2);

    return group;
  }

  makePlayerCar() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.9, 0.38, 1.45);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0b1020,
      metalness: 0.55,
      roughness: 0.22,
      emissive: 0x00ffff,
      emissiveIntensity: 0.9
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.35;
    group.add(body);

    const canopyGeo = new THREE.BoxGeometry(0.55, 0.22, 0.65);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x081025,
      metalness: 0.2,
      roughness: 0.1,
      emissive: 0x2a6cff,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.9
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.55, 0.05);
    group.add(canopy);

    // tail glow
    const glowGeo = new THREE.BoxGeometry(0.95, 0.12, 0.22);
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0xff4dff, emissiveIntensity: 3.0 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0.25, 0.72);
    group.add(glow);

    group.position.set(0, 0, 0);

// Make car cast shadows
group.traverse(obj => {
  if (obj.isMesh) obj.castShadow = true;
});

return group;
  }

  makeObstacle(kind="car") {
    const group = new THREE.Group();

    if (kind === "car") {
      const bodyGeo = new THREE.BoxGeometry(0.95, 0.36, 1.55);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x14051f,
        metalness: 0.35,
        roughness: 0.35,
        emissive: 0xff4060,
        emissiveIntensity: 0.6
      });
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 0.32;
      group.add(body);

      const stripeGeo = new THREE.BoxGeometry(0.9, 0.08, 0.2);
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0xff4060, emissiveIntensity: 2.4 });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, 0.25, -0.5);
      group.add(stripe);
    } else {
      const geo = new THREE.BoxGeometry(1.05, 0.9, 1.05);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x09102a,
        metalness: 0.1,
        roughness: 0.55,
        emissive: 0xff4060,
        emissiveIntensity: 0.9
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = 0.55;
      group.add(m);
    }
    group.traverse(obj => {
  if (obj.isMesh) obj.castShadow = true;
});
    return group;
  }

  makeCoin() {
    const geo = new THREE.TorusGeometry(0.32, 0.11, 12, 22);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x081025,
      metalness: 0.1,
      roughness: 0.2,
      emissive: 0x57ff9a,
      emissiveIntensity: 2.8
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI/2;
    mesh.position.y = 0.55;
    return mesh;
  }

  makeBuff(type) {
    const geo = new THREE.IcosahedronGeometry(0.45, 0);
    const emissiveMap = {
      magnet: 0x7cf7ff,
      shield: 0x2a6cff,
      scorex2: 0xff4dff,
      nitro: 0xffc14d,
    };
    const mat = new THREE.MeshStandardMaterial({
      color: 0x071025,
      metalness: 0.2,
      roughness: 0.25,
      emissive: emissiveMap[type] ?? 0xffffff,
      emissiveIntensity: 2.6
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.8;
    return mesh;
  }

  makeDeco() {
    const group = new THREE.Group();

    // side pillars
    const geo = new THREE.BoxGeometry(0.35, 6, 0.35);
    const mat = new THREE.MeshStandardMaterial({ color: 0x071025, emissive: 0x2a6cff, emissiveIntensity: 0.35 });

    for (let i = 0; i < 70; i++) {
      const z = -10 - i * 3.5;
      const left = new THREE.Mesh(geo, mat);
      left.position.set(-6.2, 3, z);
      group.add(left);

      const right = new THREE.Mesh(geo, mat);
      right.position.set(6.2, 3, z);
      group.add(right);
    }
    return group;
  }

  onNearMiss() {
    this.shakeT = 0.18;
    this.shakeAmt = 0.08;
  }

  render(state, dt) {
    // camera feel
    const speedFeel = clamp01((state.player.speed - 12) / 24);
    const targetFov = 65 + speedFeel * 10 + (state.player.nitro.t > 0 ? 8 : 0);
    this.camera.fov = this.camera.fov + (targetFov - this.camera.fov) * 0.08;
    this.camera.updateProjectionMatrix();

    // drift lean
    const lean = state.player.drift.amount * state.player.drift.direction * 0.18;
    this.playerMesh.rotation.z = this.playerMesh.rotation.z + (lean - this.playerMesh.rotation.z) * 0.2;

    // invuln flicker
    const inv = state.player.invulnT > 0;
    this.playerMesh.visible = inv ? (Math.floor(state.t * 18) % 2 === 0) : true;

    // player position
    this.playerMesh.position.set(state.player.x, 0, 0);

    // road scroll illusion (move deco/road backwards slightly)
    this.road.position.z = -90 - (state.distance % 6);
    this.laneLines.position.z = -90 - (state.distance % 6);
    this.deco.position.z = - (state.distance % 3.5);

    // obstacles meshes sync
    while (this.obsMeshes.length < state.obstacles.length) {
      const o = state.obstacles[this.obsMeshes.length];
      const mesh = this.makeObstacle(o.kind);
      this.scene.add(mesh);
      this.obsMeshes.push(mesh);
    }
    while (this.obsMeshes.length > state.obstacles.length) {
      const m = this.obsMeshes.pop();
      this.scene.remove(m);
      m.traverse(n => { if (n.geometry) n.geometry.dispose?.(); if (n.material) n.material.dispose?.(); });
    }
    for (let i = 0; i < state.obstacles.length; i++) {
      const o = state.obstacles[i];
      const m = this.obsMeshes[i];
      m.visible = !!o.alive;
      m.position.set(o.x, 0, o.z);
      m.rotation.y += dt * 0.6;
    }

    // coins
    while (this.coinMeshes.length < state.coinPacks.length) {
      const m = this.makeCoin();
      this.scene.add(m);
      this.coinMeshes.push(m);
    }
    while (this.coinMeshes.length > state.coinPacks.length) {
      const m = this.coinMeshes.pop();
      this.scene.remove(m);
      m.geometry.dispose?.();
      m.material.dispose?.();
    }
    for (let i = 0; i < state.coinPacks.length; i++) {
      const c = state.coinPacks[i];
      const m = this.coinMeshes[i];
      m.visible = !!c.alive;
      m.position.set(c.x, 0, c.z);
      m.rotation.z += dt * 2.2;
    }

    // buffs
    while (this.buffMeshes.length < state.buffs.length) {
      const b = state.buffs[this.buffMeshes.length];
      const m = this.makeBuff(b.type);
      this.scene.add(m);
      this.buffMeshes.push(m);
    }
    while (this.buffMeshes.length > state.buffs.length) {
      const m = this.buffMeshes.pop();
      this.scene.remove(m);
      m.geometry.dispose?.();
      m.material.dispose?.();
    }
    for (let i = 0; i < state.buffs.length; i++) {
      const b = state.buffs[i];
      const m = this.buffMeshes[i];
      m.visible = !!b.alive;
      m.position.set(b.x, 0, b.z);
      m.rotation.x += dt * 0.9;
      m.rotation.y += dt * 1.1;
    }

    // camera shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeAmt * (this.shakeT / 0.18);
      this.camera.position.x = (Math.random() - 0.5) * s;
      this.camera.position.y = 4.2 + (Math.random() - 0.5) * s;
    } else {
      this.camera.position.x *= 0.8;
      this.camera.position.y = 4.2 + (this.camera.position.y - 4.2) * 0.8;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

function clamp01(v){ return Math.max(0, Math.min(1, v)); }
