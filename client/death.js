import * as T from "three";
import { bodyParts } from "../shared/body.js";

export const DEATH_REVEAL_SECONDS = 1.9;
const up = new T.Vector3(0, 1, 0);
const smooth = (t) => { t = T.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// A short recoil becomes a fall; limbs relax from the exact struck pose.
export function fallenPose(p, age) {
  const t = smooth(age / 1.05), relax = smooth(age / .7);
  const rest = bodyParts("stand", 0, 0, p.role === "detective", { relaxedArms: true });
  const parts = p.death.parts.map((part, i) => {
    const out = { ...part };
    for (const key of ["x", "y", "z", "rx", "ry", "rz"])
      out[key] = T.MathUtils.lerp(part[key] || 0, rest[i][key] || 0, relax);
    if (part.name === "arm") out.rz += Math.sign(part.x) * .28 * relax;
    return out;
  });
  const fall = new T.Vector3(p.death.direction.x, 0, p.death.direction.z).normalize();
  if (!fall.lengthSq()) fall.set(0, 0, 1);
  const axis = new T.Vector3().crossVectors(up, fall).normalize();
  const rotation = new T.Quaternion().setFromAxisAngle(axis, t * Math.PI / 2)
    .multiply(new T.Quaternion().setFromAxisAngle(up, p.yaw));
  // Rest every body bound above the floor, including coat, hat and bent limbs.
  let lowest = Infinity;
  for (const part of parts) {
    const local = new T.Quaternion().setFromEuler(new T.Euler(part.rx, part.ry || 0, part.rz));
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new T.Vector3(x * part.w / 2, y * part.h / 2, z * part.d / 2)
        .applyQuaternion(local).add(new T.Vector3(part.x, part.y, part.z)).applyQuaternion(rotation);
      lowest = Math.min(lowest, corner.y);
    }
  }
  const position = new T.Vector3(p.x, Math.max((p.y || 0) * (1 - t), .025 - lowest), p.z)
    .addScaledVector(fall, .18 * t);
  const gun = parts.find(part => part.name === "gun");
  if (gun) {
    const center = new T.Vector3(gun.x, gun.y, gun.z).applyQuaternion(rotation).add(position);
    const gunRotation = rotation.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(gun.rx, gun.ry || 0, gun.rz)));
    const extent = [[gun.w, 1, 0, 0], [gun.h, 0, 1, 0], [gun.d, 0, 0, 1]]
      .reduce((sum, [size, x, y, z]) => sum + Math.abs(new T.Vector3(x, y, z).applyQuaternion(gunRotation).y) * size / 2, 0);
    const drop = new T.Vector3(0, (.025 + extent - center.y) * smooth((age - .35) / .7), 0)
      .applyQuaternion(rotation.clone().invert());
    gun.x += drop.x; gun.y += drop.y; gun.z += drop.z;
  }
  return { parts, rotation, position };
}

export class DeathEffects {
  constructor(scene) {
    this.scene = scene;
    this.entries = new Map();
  }
  get ready() {
    return this.entries.size > 0 && [...this.entries.values()].every(e => e.age >= DEATH_REVEAL_SECONDS);
  }
  clear(role) {
    const e = this.entries.get(role);
    if (!e) return;
    this.scene.remove(e.group);
    e.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    this.entries.delete(role);
  }
  create(p) {
    const group = new T.Group();
    const material = () => new T.MeshBasicMaterial({ color: 0xb51220, toneMapped: false });
    const pool = new T.Mesh(new T.CircleGeometry(1, 40), material());
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.x + p.death.direction.x * .8, .012, p.z + p.death.direction.z * .8);
    group.add(pool);
    const drops = [];
    for (let i = 0; i < 30; i++) {
      const angle = i * 2.39996, spread = .4 + (i % 7) * .13;
      const mesh = new T.Mesh(new T.SphereGeometry(.022 + (i % 4) * .009, 6, 4), material());
      mesh.position.copy(p.death.point);
      group.add(mesh);
      drops.push({ mesh, velocity: new T.Vector3(
        p.death.direction.x * 1.4 + Math.cos(angle) * spread,
        .7 + (i % 5) * .24,
        p.death.direction.z * 1.4 + Math.sin(angle) * spread,
      ), landed: false });
    }
    this.scene.add(group);
    const e = { group, pool, drops, age: 0, death: JSON.stringify(p.death) };
    this.entries.set(p.role, e);
    return e;
  }
  update(players, actors, dt, menu) {
    for (const [role, p] of Object.entries(players)) {
      if (menu || !p.death) { this.clear(role); continue; }
      let e = this.entries.get(role);
      if (e && e.death !== JSON.stringify(p.death)) { this.clear(role); e = null; }
      e ||= this.create(p);
      e.age += Math.min(dt, .06);
      const pose = fallenPose(p, e.age), actor = actors[role];
      actor.position.copy(pose.position);
      actor.quaternion.copy(pose.rotation);
      pose.parts.forEach((part, i) => {
        const mesh = actor.userData.parts[i];
        mesh.position.set(part.x, part.y, part.z);
        mesh.rotation.set(part.rx, part.ry || 0, part.rz);
      });
      const head = pose.parts.find(part => part.name === "head");
      actor.userData.face.position.set(head.x, head.y, head.z);
      const growth = .06 + .94 * smooth((e.age - .25) / 2.3);
      e.pool.scale.set(.72 * growth, .46 * growth, 1);
      for (const drop of e.drops) {
        if (drop.landed) continue;
        drop.velocity.y -= 6 * dt;
        drop.mesh.position.addScaledVector(drop.velocity, dt);
        if (drop.mesh.position.y <= .018) {
          drop.mesh.position.y = .018;
          drop.mesh.scale.set(1.6, .15, 1.3);
          drop.landed = true;
        }
      }
    }
  }
}
