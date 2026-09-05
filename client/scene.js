import * as T from "three";
import { solids, spots, statues, props, rooms } from "../shared/world.js";
import { bodyParts } from "../shared/body.js";
import { sunAt } from "../shared/sun.js";

const ink = new T.MeshToonMaterial({ color: 0x101010 });
const white = new T.MeshToonMaterial({ color: 0xfafaf5 });
const gray = new T.MeshToonMaterial({ color: 0xcacac4 });
const lineMat = new T.LineBasicMaterial({
  color: 0x292929,
  transparent: true,
  opacity: 0.75,
});
const ghostLine = new T.LineBasicMaterial({
  color: 0x404040,
  transparent: true,
  opacity: 0.12,
});
function outline(mesh) {
  const edge = new T.EdgesGeometry(mesh.geometry, 26);
  const l = new T.LineSegments(edge, lineMat);
  mesh.add(l);
  return mesh;
}
function cube(w, h, d, mat = white, edges = true) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (edges) outline(m);
  return m;
}
function label(text, width = 4, height = 0.6, color = "#191919", bg = null) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext("2d");
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 160);
  }
  ctx.fillStyle = color;
  ctx.font = "42px Courier New";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 80);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const m = new T.Mesh(
    new T.PlaneGeometry(width, height),
    new T.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  return m;
}

export class Gallery {
  constructor(canvas) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.setClearColor(0xecece7);
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0xecece7);
    this.scene.fog = new T.Fog(0xecece7, 38, 85);
    this.camera = new T.PerspectiveCamera(
      72,
      innerWidth / innerHeight,
      0.07,
      110,
    );
    this.camera.rotation.order = "YXZ";
    this.sun = new T.DirectionalLight(0xffffff, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -36,
      right: 36,
      top: 32,
      bottom: -32,
      near: 0.5,
      far: 130,
    });
    this.sun.shadow.bias = -0.00055;
    this.sun.shadow.normalBias = 0.055;
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new T.AmbientLight(0xffffff, 0.48);
    this.scene.add(this.ambient);
    this.flash = new T.SpotLight(0xffffff, 65, 27, 0.34, 0.34, 1.5);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.bias = -0.0003;
    this.scene.add(this.flash, this.flash.target);
    this.world = new T.Group();
    this.scene.add(this.world);
    this.blockers = [];
    this.statueActors = [];
    this.wrecks = [];
    this.buildWorld();
    this.batchOutlines();
    this.cameraRay = new T.Raycaster();
    this.cameraDistance = 3.05;
    this.actors = {
      detective: this.makeActor(true),
      killer: this.makeActor(false),
    };
    Object.values(this.actors).forEach((a) => this.scene.add(a));
    this.spotHints = new T.Group();
    this.scene.add(this.spotHints);
    this.markerGroup = new T.Group();
    this.scene.add(this.markerGroup);
    this.buildHints();
    this.marksKey = "";
    this.menuMode = true;
    this.effects = [];
    this.gun = this.makeGun();
    this.camera.add(this.gun);
    this.scene.add(this.camera);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  buildWorld() {
    for (const b of solids) {
      const mesh = cube(
        b.w,
        b.h,
        b.d,
        b.type === "floor" ? white : b.type === "case" ? gray : white,
        b.type !== "floor",
      );
      mesh.position.set(b.x, b.y, b.z);
      mesh.userData.solid = b;
      this.world.add(mesh);
      if (b.type !== "floor") this.blockers.push(mesh);
      if (b.type === "bench") {
        for (const dx of [-1.2, 1.2]) {
          const leg = cube(0.1, 0.35, 0.7, ink);
          leg.position.set(b.x + dx, 0.15, b.z);
          this.world.add(leg);
        }
      }
    }
    // Ink joints and scattered fine hatch strokes replace glossy surface detail.
    const points = [];
    for (let x = -24; x <= 24; x += 3) {
      points.push(new T.Vector3(x, 0.008, -20), new T.Vector3(x, 0.008, 20));
    }
    for (let z = -20; z <= 20; z += 3) {
      points.push(new T.Vector3(-24, 0.008, z), new T.Vector3(24, 0.008, z));
    }
    this.world.add(
      new T.LineSegments(
        new T.BufferGeometry().setFromPoints(points),
        ghostLine,
      ),
    );
    let seed = 91;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const hatch = [];
    for (let i = 0; i < 450; i++) {
      const x = random() * 47 - 23.5,
        z = random() * 39 - 19.5,
        l = 0.05 + random() * 0.18;
      hatch.push(
        new T.Vector3(x, 0.012, z),
        new T.Vector3(x + l, 0.012, z + 0.12),
      );
    }
    this.world.add(
      new T.LineSegments(
        new T.BufferGeometry().setFromPoints(hatch),
        ghostLine,
      ),
    );
    // Roof beams and broad open skylights: sunlight genuinely crosses the actors.
    for (const x of [-22, -15, -7, 7, 15, 22]) {
      const b = cube(0.12, 0.22, 40, ink);
      b.position.set(x, 5.5, 0);
      this.world.add(b);
    }
    for (const z of [-19, -10, 0, 10, 19]) {
      const b = cube(48, 0.17, 0.12, ink);
      b.position.set(0, 5.5, z);
      this.world.add(b);
    }
    // Opaque roof strips create changing patches of shelter, with no actor-specific shadow tricks.
    for (const x of [-20, 20]) {
      const b = cube(7, 0.12, 12, white);
      b.position.set(x, 5.65, 11);
      this.world.add(b);
    }
    for (const p of statues) {
      const a = this.makeActor(false);
      this.poseActor(a, { ...p, still: true, moving: false, holding: true }, 0);
      this.world.add(a);
      this.blockers.push(a);
      this.statueActors.push(a);
      const wreck = new T.Group();
      wreck.position.set(p.x, p.y || 0, p.z);
      wreck.visible = false;
      for (let i = 0; i < 9; i++) {
        const chunk = cube(0.15 + (i % 3) * 0.07, 0.12, 0.24, i % 3 ? white : gray, false);
        const angle = i * 2.4;
        chunk.position.set(Math.sin(angle) * (0.25 + i * 0.04), 0.08, Math.cos(angle) * (0.25 + i * 0.04));
        chunk.rotation.set(i * 0.13, angle, i * 0.09);
        wreck.add(chunk);
      }
      this.world.add(wreck);
      this.wrecks.push(wreck);
    }
    for (const p of props) this.makeProp(p);
    for (const r of rooms) {
      const l = label(r.name, 5, 0.7);
      l.rotation.x = -Math.PI / 2;
      l.position.set(r.x, 0.025, r.z);
      this.world.add(l);
    }
    for (const side of [-1, 1])
      for (const z of [-13, -5, 6, 14])
        this.artFrame(side * 23.75, 2.5, z, side);
    const title = label("THE WHITE GALLERY", 6, 0.8);
    title.position.set(0, 3.1, -19.75);
    this.world.add(title);
    const entry = label("EXIT / 出口", 3, 0.65);
    entry.rotation.y = Math.PI;
    entry.position.set(0, 2.8, 23.75);
    this.world.add(entry);
    this.exitSign = entry;
    const exitFloor = label("EXIT   ↓", 3, 0.5);
    exitFloor.rotation.x = -Math.PI / 2;
    exitFloor.position.set(0, 0.02, 21);
    this.world.add(exitFloor);
    this.gate = cube(5.7, 3.7, 0.1, ink);
    this.gate.position.set(0, 1.85, 20.1);
    this.world.add(this.gate);
    const gateLabel = label("CLOSED UNTIL 17:53", 4, 0.5, "#eeeeee");
    gateLabel.position.set(0, 0.5, 0.06);
    this.gate.add(gateLabel);
    // Printed exhibit plaques make empty spots read as intentional composition.
    for (const spot of spots) {
      const l = label(
        `${String(spot.id + 1).padStart(2, "0")}   /   UNTITLED`,
        0.85,
        0.14,
      );
      l.rotation.x = -Math.PI / 2;
      l.position.set(spot.x, 0.021, spot.z + 1.12);
      this.world.add(l);
    }
  }
  batchOutlines() {
    // Static ink strokes share draw calls; keep the movable gate separate.
    this.world.updateMatrixWorld(true);
    const groups = new Map(), lines = [];
    this.world.traverse((o) => {
      if (!o.isLineSegments || o.parent === this.gate) return;
      if (!groups.has(o.material)) groups.set(o.material, []);
      const values = groups.get(o.material), pos = o.geometry.attributes.position;
      const v = new T.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        values.push(v.x, v.y, v.z);
      }
      lines.push(o);
    });
    for (const o of lines) { o.removeFromParent(); o.geometry.dispose(); }
    for (const [material, values] of groups) {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.Float32BufferAttribute(values, 3));
      this.world.add(new T.LineSegments(geometry, material));
    }
  }
  updateDestroyed(ids, dt) {
    this.statueActors.forEach((actor, id) => {
      const wreck = this.wrecks[id], destroyed = ids.includes(id);
      if (destroyed && !wreck.visible) wreck.userData.age = 0;
      actor.visible = !destroyed;
      wreck.visible = destroyed;
      if (!destroyed) return;
      wreck.userData.age = Math.min(1, (wreck.userData.age || 0) + dt * 2.5);
      const t = wreck.userData.age;
      wreck.children.forEach((chunk, i) => {
        chunk.position.y = 0.08 + (1 - t) * (0.6 + i * 0.08) + Math.sin(t * Math.PI) * 0.3;
      });
    });
  }
  resetEffects() {
    for (const e of this.effects) {
      e.mesh.removeFromParent();
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    this.effects = [];
    this.wrecks.forEach((w) => { w.visible = false; });
    this.gun.rotation.x = 0;
    this.cameraDistance = 3.05;
  }
  artFrame(x, y, z, side) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const frame = cube(2.65, 2.3, 0.075, ink);
    g.add(frame);
    const paper = cube(2.5, 2.15, 0.02, white, false);
    paper.position.z = 0.05;
    g.add(paper);
    const lines = [];
    for (let j = 0; j < 12; j++) {
      const x0 = Math.sin(j * 1.7 + z) * 0.75,
        y0 = Math.cos(j * 2.1) * 0.75;
      lines.push(
        new T.Vector3(x0, y0, 0.08),
        new T.Vector3(Math.sin(j * 2.3) * 0.8, Math.cos(j + z) * 0.8, 0.08),
      );
    }
    g.add(
      new T.LineSegments(new T.BufferGeometry().setFromPoints(lines), lineMat),
    );
    this.world.add(g);
  }
  makeProp(p) {
    const g = new T.Group();
    g.position.set(p.x, 0, p.z);
    this.world.add(g);
    if (p.type === "coat") {
      const stem = cube(0.08, 1.9, 0.08, ink);
      stem.position.y = 0.95;
      g.add(stem);
      for (const a of [0, 1, 2]) {
        const arm = cube(1.1, 0.06, 0.06, ink);
        arm.position.y = 1.4 + a * 0.17;
        arm.rotation.y = a * 1.1;
        arm.rotation.z = 0.3;
        g.add(arm);
      }
      const hat = cube(0.55, 0.18, 0.48, gray);
      hat.position.set(0.4, 1.87, 0);
      g.add(hat);
    }
    if (p.type === "plant") {
      const pot = new T.Mesh(new T.CylinderGeometry(0.36, 0.25, 0.6, 8), gray);
      pot.castShadow = true;
      pot.receiveShadow = true;
      pot.position.y = 0.3;
      outline(pot);
      g.add(pot);
      for (let i = 0; i < 9; i++) {
        const stem = cube(0.035, 1.2 + (i % 3) * 0.2, 0.035, ink);
        stem.position.set(Math.sin(i) * 0.14, 1, Math.cos(i) * 0.14);
        stem.rotation.z = Math.sin(i) * 0.3;
        g.add(stem);
        const leaf = new T.Mesh(
          new T.SphereGeometry(0.3, 5, 4),
          i % 2 ? ink : white,
        );
        leaf.scale.set(0.45, 1, 0.15);
        leaf.position.set(
          Math.sin(i) * 0.38,
          1.1 + (i % 3) * 0.28,
          Math.cos(i) * 0.38,
        );
        leaf.rotation.z = i;
        leaf.castShadow = true;
        g.add(leaf);
      }
    }
    if (p.type === "abstract") {
      const base = cube(1.4, 0.4, 1.4);
      base.position.y = 0.2;
      g.add(base);
      for (let i = 0; i < 3; i++) {
        const m = new T.Mesh(new T.TorusGeometry(0.55, 0.12, 5, 18), white);
        m.position.set(Math.sin(i) * 0.3, 0.8 + i * 0.45, 0);
        m.rotation.set(i * 0.6, i * 0.4, i * 0.7);
        m.castShadow = true;
        m.receiveShadow = true;
        outline(m);
        g.add(m);
      }
    }
  }
  makeActor(detective) {
    const a = new T.Group();
    a.userData.detective = detective;
    a.userData.parts = [];
    for (const part of bodyParts("stand", 0, 0, detective)) {
      const m = part.round
        ? new T.Mesh(
            new T.SphereGeometry(0.5, 12, 10),
            detective ? white : white,
          )
        : cube(1, 1, 1, detective ? ink : white, false);
      m.castShadow = true;
      m.receiveShadow = true;
      a.add(m);
      a.userData.parts.push(m);
    }
    const face = new T.Group();
    a.add(face);
    a.userData.face = face;
    for (const side of [-1, 1]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.018, 6, 4), ink);
      eye.position.set(side * 0.064, 0.035, -0.142);
      face.add(eye);
    }
    const mouth = cube(0.076, 0.015, 0.015, ink, false);
    mouth.position.set(0, -0.071, -0.147);
    face.add(mouth);
    a.userData.mouth = mouth;
    return a;
  }
  poseActor(a, p, time) {
    a.position.set(p.x, p.y || 0, p.z);
    a.rotation.y = p.yaw;
    const breath = p.still && !p.holding ? Math.sin(time * 2.1) * 0.009 : 0;
    const parts = bodyParts(
      p.pose,
      p.moving ? Math.sin((p.step || 0) * 8) * 0.6 : 0,
      breath,
      a.userData.detective,
    );
    parts.forEach((part, i) => {
      const m = a.userData.parts[i];
      m.position.set(part.x, part.y, part.z);
      m.scale.set(part.w, part.h, part.d);
      m.rotation.set(part.rx || 0, 0, part.rz || 0);
    });
    const head = parts.find((p) => p.name === "head");
    a.userData.face.position.y = head.y;
    a.userData.face.children[0].scale.y = p.still ? 0.12 : 1;
    a.userData.face.children[1].scale.y = p.still ? 0.12 : 1;
    a.userData.mouth.visible = !p.still;
  }
  makeGun() {
    const g = new T.Group();
    const barrel = cube(0.045, 0.06, 0.42, ink);
    barrel.position.z = -0.15;
    g.add(barrel);
    const grip = cube(0.065, 0.17, 0.08, ink);
    grip.position.set(0, -0.08, 0.025);
    grip.rotation.x = -0.2;
    g.add(grip);
    const sight = cube(0.016, 0.027, 0.025, ink);
    sight.position.set(0, 0.04, -0.31);
    g.add(sight);
    g.position.set(0.27, -0.24, -0.4);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.material = ink;
      }
    });
    return g;
  }
  buildHints() {
    for (const s of spots) {
      const mesh = new T.Mesh(
        new T.RingGeometry(0.46, 0.5, 32),
        new T.MeshBasicMaterial({
          color: 0x222222,
          side: T.DoubleSide,
          transparent: true,
          opacity: 0.32,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(s.x, s.y + 0.012, s.z);
      this.spotHints.add(mesh);
      const l = label(`${s.id + 1} / ${s.pose}`, 1.4, 0.22);
      l.position.set(s.x, s.y + 2.25, s.z);
      this.spotHints.add(l);
    }
  }
  mark(ids, data, elapsed) {
    const key = ids.map((id) => `${id}:${data[id]?.triggeredAt ?? "armed"}:${Math.ceil((data[id]?.expiresAt - elapsed) || 0)}`).join(",");
    if (this.marksKey === key) return;
    this.marksKey = key;
    while (this.markerGroup.children.length) {
      const c = this.markerGroup.children[0];
      this.markerGroup.remove(c);
      c.geometry?.dispose();
      c.material?.map?.dispose();
      c.material?.dispose();
    }
    ids.forEach((id) => {
      const s = spots[id];
      const m = data[id];
      const alert = m?.triggeredAt != null;
      const l = label(alert ? `! ${id + 1} !` : `${id + 1} / ${Math.max(0, Math.ceil(m.expiresAt - elapsed))}s`, 1.2, 0.24, alert ? "#d85417" : "#191919");
      l.position.set(s.x, s.y + 2.2, s.z);
      this.markerGroup.add(l);
    });
  }
  update(
    state,
    role,
    view,
    dt,
    { menu = false, showSpots = false, aim = false } = {},
  ) {
    this.updateDestroyed(state.destroyedStatues, dt);
    const night =
      state.phase === "NIGHT" ||
      (state.phase === "GAME_OVER" && state.dayTime >= 420);
    const sunset = state.phase === "SUNSET";
    const sun = sunAt(state.dayTime);
    this.sun.position.set(sun.x, sun.y, sun.z);
    this.sun.intensity = night || sunset ? 0 : 3.2;
    this.ambient.intensity = night ? 0.028 : sunset ? 0.006 : 0.48;
    this.scene.background.set(night || sunset ? 0x030303 : 0xecece7);
    this.scene.fog.color.copy(this.scene.background);
    this.gate.visible = state.phase === "PREPARATION";
    Object.entries(this.actors).forEach(([r, a]) => {
      this.poseActor(a, state.players[r], state.elapsed);
      a.visible = true;
    });
    const p = state.players[role];
    const cp = Math.cos(view.pitch),
      dir = new T.Vector3(
        -Math.sin(view.yaw) * cp,
        Math.sin(view.pitch),
        -Math.cos(view.yaw) * cp,
      );
    if (menu) {
      this.camera.position.set(10, 3.3, 8);
      this.camera.lookAt(-1, 1.05, -5);
      this.actors.detective.visible = false;
      this.actors.killer.visible = true;
      this.poseActor(
        this.actors.killer,
        {
          x: 0,
          y: 0.7,
          z: -5,
          yaw: 0,
          still: true,
          holding: true,
          pose: "statue",
        },
        0,
      );
      this.gun.visible = false;
    } else if (role === "detective") {
      this.camera.position.set(
        p.x,
        1.65,
        p.z,
      );
      this.camera.rotation.set(view.pitch, view.yaw, 0, "YXZ");
      this.actors.detective.visible = false;
      this.gun.visible = true;
      this.gun.position.set(aim ? 0.035 : 0.27, aim ? -0.18 : -0.24, -0.4);
    } else {
      const target = new T.Vector3(
        p.x,
        (p.y || 0) + (p.pose === "sit" ? 0.8 : 1.4),
        p.z,
      );
      let distance = 3.05;
      const back = dir.clone().negate();
      this.world.updateMatrixWorld();
      this.cameraRay.set(target, back);
      this.cameraRay.near = 0.1;
      this.cameraRay.far = 3.1;
      const hit = this.cameraRay.intersectObjects(this.blockers.filter((b) => b.visible), true)
        .find((h) => h.object.isMesh);
      if (hit) distance = Math.max(0.18, hit.distance - 0.16);
      this.cameraDistance = distance < this.cameraDistance ? distance
        : this.cameraDistance + (distance - this.cameraDistance) * (1 - Math.exp(-dt * 10));
      this.camera.position.copy(target).addScaledVector(back, this.cameraDistance);
      this.camera.lookAt(target.clone().addScaledVector(dir, 8));
      this.gun.visible = false;
    }
    const fov = aim && role === "detective" ? 49 : 72;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();
    this.flash.visible = night && state.players.detective.flashlight;
    const d = state.players.detective;
    this.flash.position.set(d.x, 1.5, d.z);
    this.flash.target.position.set(
      d.x - Math.sin(d.yaw) * Math.cos(d.pitch) * 12,
      1.5 + Math.sin(d.pitch) * 12,
      d.z - Math.cos(d.yaw) * Math.cos(d.pitch) * 12,
    );
    this.spotHints.visible =
      !menu &&
      (showSpots || (role === "killer" && !p.still && state.phase !== "NIGHT"));
    this.spotHints.children.forEach((c, i) => {
      const s = spots[Math.floor(i / 2)];
      c.visible = showSpots || Math.hypot(s.x - p.x, s.z - p.z) < 2.7;
      if (i % 2) c.lookAt(this.camera.position);
    });
    this.mark(state.marks, state.markData, state.elapsed);
    this.markerGroup.visible = !menu && role === "detective";
    this.markerGroup.children.forEach((m) => m.lookAt(this.camera.position));
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
  shot(point, surface) {
    this.gun.rotation.x = -0.14;
    setTimeout(() => (this.gun.rotation.x = 0), 120);
    const solid = solids.find((b) => b.id === surface);
    if (!point || !solid) return;
    const normal = new T.Vector3();
    const face = [["x", "w"], ["y", "h"], ["z", "d"]]
      .sort(([a, sa], [b, sb]) => Math.abs(Math.abs(point[a] - solid[a]) - solid[sa] / 2)
        - Math.abs(Math.abs(point[b] - solid[b]) - solid[sb] / 2))[0][0];
    normal[face] = Math.sign(point[face] - solid[face]) || 1;
    const m = new T.Mesh(
      new T.CircleGeometry(0.045, 8),
      new T.MeshBasicMaterial({ color: 0x111111, depthWrite: false }),
    );
    m.position.set(point.x, point.y, point.z);
    m.position.addScaledVector(normal, 0.006);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
    this.scene.add(m);
    this.effects.push({ mesh: m, life: 12 });
  }
}
