import { SculptureSurface } from './sculpture-surface.js';
import * as T from "three";
import { CONFIG as C } from "../shared/config.js";
import { sculptureGeometry, detectiveGeometry, detectivePalette, decorateGallery, posterTexture } from "./noir.js";
import { solids, spots, statues, props, rooms } from "../shared/world.js";
import { bodyParts, playerBodyParts } from "../shared/body.js";
import { sunAt, lateDayAt } from "../shared/sun.js";
import { t } from "./i18n.js";
import { DeathEffects } from "./death.js";
import { DetectiveSmoke } from "./detective-smoke.js";

// Three's default Toon ramp illuminates even negative N·L at 70% strength.
// An unlit wall and an occluded figure must instead share a black endpoint.
const shadowRamp = new T.DataTexture(new Uint8Array([0, 0, 180, 255]), 4, 1, T.RedFormat);
shadowRamp.minFilter = shadowRamp.magFilter = T.NearestFilter;
shadowRamp.needsUpdate = true;
const ink = new T.MeshToonMaterial({ color: 0x101010, gradientMap: shadowRamp, shadowSide: T.BackSide });
const white = new T.MeshToonMaterial({ color: 0xf2f2f2, gradientMap: shadowRamp, shadowSide: T.BackSide });
const gray = new T.MeshToonMaterial({ color: 0xbcbcbc, gradientMap: shadowRamp, shadowSide: T.BackSide });
// A common linear-light floor lifts only dark surfaces. Unlike ambient light,
// it does not multiply each object's albedo and reveal the figure in shelter.
const shadowFloor = { value: 0.045 };
function softenShadows(material, floor = shadowFloor) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.shadowFloor = floor;
    shader.fragmentShader = "uniform float shadowFloor;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "outgoingLight = max(outgoingLight, vec3(shadowFloor));\n#include <opaque_fragment>",
    );
  };
  material.customProgramCacheKey = () => "shared-shadow-floor-v1";
  return material;
}
[ink, white, gray].forEach(material => softenShadows(material));
const detectiveMaterials = detectivePalette.map(color => softenShadows(
  new T.MeshToonMaterial({ color, gradientMap: shadowRamp, shadowSide: T.BackSide }),
));
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
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.setClearColor(0xe6e6e6);
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0xe6e6e6);
    this.scene.fog = new T.Fog(0xe6e6e6, 38, 85);
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
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0;
    this.scene.add(this.sun, this.sun.target);
    // Daytime occlusion must extinguish the figure along with its background.
    // Ambient fill bypasses shadows and made the white body glow in shelter.
    this.ambient = new T.AmbientLight(0xffffff, 0);
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
    this.deaths = new DeathEffects(this.scene);
    this.detectiveSmoke = new DetectiveSmoke(this.scene);
    this.posePreview = this.makeActor(false);
    const previewMaterial = new T.MeshBasicMaterial({ color: 0x555555,
      transparent: true, opacity: .24, depthWrite: false });
    this.posePreview.traverse((o) => {
      if (o.isMesh) { o.material = previewMaterial; o.castShadow = false; o.receiveShadow = false; }
    });
    this.posePreview.visible = false;
    this.scene.add(this.posePreview);
    this.spotHints = new T.Group();
    this.scene.add(this.spotHints);
    this.buildHints();
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
  configure(settings) {
    const scale = settings.quality === "performance" ? Math.min(devicePixelRatio * .75, 1)
      : Math.min(devicePixelRatio, 1.6);
    if (scale !== this.renderer.getPixelRatio()) {
      this.renderer.setPixelRatio(scale);
      this.resize();
    }
  }
  buildWorld() {
    for (const b of solids) {
      const mesh = cube(
        b.w,
        b.h,
        b.d,
        b.type === "frame" ? ink : ["case", "crate"].includes(b.type) ? gray : white,
        b.type !== "floor",
      );
      mesh.position.set(b.x, b.y, b.z);
      mesh.userData.solid = b;
      this.world.add(mesh);
      if (b.type !== "floor") this.blockers.push(mesh);
      if (b.type === "crate") {
        // Inset bands stay inside the solid box: no decorative ghost collisions.
        for (const dx of [-b.w * .32, b.w * .32]) {
          const band = cube(.07, b.h - .04, .008, ink, false);
          band.position.set(b.x + dx, b.y, b.z - b.d / 2 - .002);
          this.world.add(band);
        }
        const shipping = label("WHITE GALLERY / HOLD", Math.min(1.3, b.w-.1), .16);
        shipping.rotation.y = -Math.PI / 2;
        shipping.position.set(b.x-b.w/2-.006, b.y, b.z);
        this.world.add(shipping);
      }
      if (b.type === "bench") {
        for (const dx of [-1.2, 1.2]) {
          const leg = cube(0.1, 0.35, 0.7, ink);
          leg.position.set(b.x + dx, 0.15, b.z);
          this.world.add(leg);
        }
      }
    }
    decorateGallery(this.world, ink);
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
        if (!(side < 0 && z > 0)) this.artFrame(side * 23.75, 2.5, z, side);
    const title = label("THE WHITE GALLERY", 6, 0.8);
    title.position.set(0, 3.1, -19.75);
    this.world.add(title);
    const entry = label("EXIT / 出口", 3, 0.65);
    entry.rotation.y = Math.PI;
    entry.position.set(0, 2.8, 23.75);
    this.world.add(entry);
    this.exitSign = entry;
    this.exitLamp = new T.SpotLight(0xffffff, 0, 13, .65, .7, 1.5);
    this.exitLamp.position.set(0, 3, 24.4);
    this.exitLamp.target.position.set(0, 0, 18);
    this.exitLamp.castShadow = true;
    this.exitLamp.shadow.mapSize.set(512,512);
    this.scene.add(this.exitLamp, this.exitLamp.target);
    const threshold = cube(4.5, .10, .12, new T.MeshBasicMaterial({color:0xbcbcbc}), false);
    threshold.position.set(0,2.9,23.7);this.world.add(threshold);
    this.exitGlow = threshold;
    const exitFloor = label("EXIT   ↓", 3, 0.5);
    exitFloor.rotation.x = -Math.PI / 2;
    exitFloor.position.set(0, 0.02, 21);
    this.world.add(exitFloor);
    this.gate = cube(5.7, 3.7, 0.1, ink);
    this.gate.position.set(0, 1.85, 20.1);
    this.world.add(this.gate);
    const gateLabel = label("CLOSED UNTIL 17:55", 4, 0.5, "#eeeeee");
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
    const print = new T.Mesh(new T.PlaneGeometry(2.36, 2.02),
      softenShadows(new T.MeshToonMaterial({ map: posterTexture(Math.abs(z)), gradientMap: shadowRamp, shadowSide: T.BackSide })));
    print.position.z = .065;
    print.receiveShadow = true;
    g.add(print);
    this.world.add(g);
  }
  makeProp(p) {
    const g = new T.Group();
    g.position.set(p.x, 0, p.z);
    this.world.add(g);
    this.blockers.push(g);
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
      const key = part.name === "hat" && part.h > .1 ? "crown" : part.name;
      const m = new T.Mesh(detective ? detectiveGeometry[key] : sculptureGeometry[key],
        detective ? detectiveMaterials : white);
      m.castShadow = true;
      m.receiveShadow = true;
      a.add(m);
      a.userData.parts.push(m);
      if (detective && part.name === "head") {
        a.userData.head = m;
        const cigarette = new T.Mesh(detectiveGeometry.cigarette, detectiveMaterials);
        cigarette.castShadow = true;
        cigarette.receiveShadow = true;
        m.add(cigarette);
      }
    }
    const face = new T.Group();
    a.add(face);
    a.userData.face = face;
    for (const side of [-1, 1]) {
      const eye = new T.Mesh(new T.BoxGeometry(0.035, 0.006, 0.008), ink);
      eye.position.set(side * 0.064, 0.035, -0.138);
      face.add(eye);
    }
    const mouth = cube(0.076, 0.015, 0.015, ink, false);
    mouth.position.set(0, -0.071, -0.147);
    face.add(mouth);
    a.userData.mouth = mouth;
    face.visible = false;
    if (!detective) {
      for (const part of a.userData.parts) part.visible = false;
      const material = softenShadows(white.clone());
      material.flatShading = true;
      a.userData.surface = new SculptureSurface(a, material);
    }
    return a;
  }
  poseActor(a, p, time) {
    a.position.set(p.x, p.y || 0, p.z);
    a.rotation.set(0, p.yaw, 0);
    const parts = playerBodyParts({ ...p, role: a.userData.detective ? "detective" : "killer" });
    parts.forEach((part, i) => {
      const m = a.userData.parts[i];
      m.position.set(part.x, part.y, part.z);
      m.scale.set(part.w, part.h, part.d);
      m.rotation.set(part.rx || 0, part.ry || 0, part.rz || 0);
    });
    a.userData.surface?.update();
    const head = parts.find((p) => p.name === "head");
    a.userData.face.position.set(head.x, head.y, head.z);
    a.userData.face.children[0].scale.y = 1;
    a.userData.face.children[1].scale.y = 1;
    a.userData.mouth.visible = false;
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
    const cylinder = new T.Mesh(new T.CylinderGeometry(.047,.047,.095,12), gray);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(0, -.012, -.025);
    g.add(cylinder);
    const hammer = cube(.018,.045,.025,gray,false);
    hammer.position.set(0,.035,.035); g.add(hammer);
    g.position.set(0.27, -0.24, -0.4);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;

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
      const l = label(`${s.id + 1} / ${t(`pose_${s.pose}`)}`, 1.4, 0.22);
      l.position.set(s.x, s.y + 2.25, s.z);
      this.spotHints.add(l);
    }
  }
  update(
    state,
    role,
    view,
    dt,
    { menu = false, showSpots = false, aim = false, posePreview = null } = {},
  ) {
    this.updateDestroyed(state.destroyedStatues, dt);
    const night =
      state.phase === "NIGHT" ||
      (state.phase === "GAME_OVER" && state.dayTime >= C.dayDuration);
    const sunset = state.phase === "SUNSET";
    const sun = sunAt(state.dayTime);
    this.sun.position.set(sun.x, sun.y, sun.z);
    const late = lateDayAt(state.dayTime);
    const closing = night ? 1 : sunset ? T.MathUtils.smoothstep(state.phaseTime,0,C.sunsetDuration) : 0;
    this.sun.intensity = (3.2 - 2.95*late) * (1-closing);
    this.ambient.intensity = .028*closing;
    shadowFloor.value = (.045-.037*late)*(1-closing);
    this.scene.background.set(0xe6e6e6).lerp(new T.Color(0x303030),late).lerp(new T.Color(0x030303),closing);
    this.exitLamp.intensity = 12*(late*.25+closing*.75);
    this.exitGlow.visible = late > .05 || night;
    this.actors.killer.traverse(o => {
      if (!o.isMesh || !o.material.emissive) return;
      if (!o.userData.baseMaterial) {
        o.userData.baseMaterial=o.material;
        o.userData.selfMaterial=softenShadows(o.material.clone(), { value: .085 });
        o.userData.selfMaterial.emissive.set(0x000000);
      }
      o.material = role === "killer" && !menu ? o.userData.selfMaterial : o.userData.baseMaterial;
    });
    this.scene.fog.color.copy(this.scene.background);
    this.gate.visible = state.phase === "PREPARATION";
    Object.entries(this.actors).forEach(([r, a]) => {
      this.poseActor(a, state.players[r], state.elapsed);
      a.visible = true;
    });
    this.deaths.update(state.players, this.actors, dt, menu);
    if (state.players.killer.death) this.actors.killer.userData.surface.update();
    const p = state.players[role];
    const fallen = Object.values(state.players).find(player => player.death);
    this.posePreview.visible = !menu && role === "killer" && ["PREPARATION", "DAY"].includes(state.phase)
      && !!posePreview && (!p.still || p.spotId === null);
    if (this.posePreview.visible) this.poseActor(this.posePreview,
      { ...posePreview, still: true, holding: true }, 0);
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
    } else if (role === "detective" && !fallen) {
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
      const followed = fallen || p;
      const target = new T.Vector3(
        followed.x + (fallen ? fallen.death.direction.x * .7 : 0),
        fallen ? .65 : (p.y || 0) + (p.pose === "sit" ? .65 : 1.4),
        followed.z + (fallen ? fallen.death.direction.z * .7 : 0),
      );
      let distance = 3.05;
      const back = dir.clone().negate();
      if (fallen) {
        // A side view keeps the attacker from obscuring the falling victim.
        const fall = fallen.death.direction;
        back.set(-fall.z * .85 - fall.x * .4, .75,
          fall.x * .85 - fall.z * .4).normalize();
      }
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
      this.camera.lookAt(fallen ? target : target.clone().addScaledVector(dir, 8));
      this.gun.visible = false;
    }
    const fov = aim && role === "detective" && !fallen ? 49 : 72;
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
      (showSpots || (role === "killer" && (!p.still || p.spotId === null)
        && ["PREPARATION", "DAY"].includes(state.phase)));
    this.spotHints.children.forEach((c, i) => {
      const s = spots[Math.floor(i / 2)];
      c.visible = showSpots || s.id === posePreview?.id;
      if (i % 2) c.lookAt(this.camera.position);
    });
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
    this.detectiveSmoke.update(this.actors.detective.userData.head, state.players.detective,
      dt, state.elapsed, menu);
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
