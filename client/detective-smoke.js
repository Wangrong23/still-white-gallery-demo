import * as T from "three";

// A fixed pool: wisps leave the cigarette in world space, never drag with the head.
export class DetectiveSmoke {
  constructor(scene) {
    this.group = new T.Group();
    scene.add(this.group);
    const geometry = new T.IcosahedronGeometry(1, 0);
    this.puffs = Array.from({ length: 7 }, () => {
      const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({
        color: 0xaaaaaa, transparent: true, opacity: 0, depthWrite: false,
      }));
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, age: 3, seed: 0 };
    });
    this.clock = 0;
    this.lastElapsed = 0;
    this.serial = 0;
  }
  update(head, player, dt, elapsed, menu) {
    if (menu || elapsed < this.lastElapsed) {
      this.puffs.forEach(p => { p.age = 3; p.mesh.visible = false; });
      this.clock = 0;
    }
    this.lastElapsed = elapsed;
    this.group.visible = !menu;
    if (menu) return;
    this.clock += dt;
    if (!player.death && this.clock >= .46) {
      this.clock %= .46;
      const puff = this.puffs.find(p => p.age >= 2.6);
      if (puff) {
        puff.age = 0; puff.seed = this.serial++;
        head.updateWorldMatrix(true, false);
        puff.mesh.position.copy(head.localToWorld(new T.Vector3(.24, -.27, -1.07)));
      }
    }
    for (const puff of this.puffs) {
      puff.age += dt;
      puff.mesh.visible = puff.age < 2.6;
      if (!puff.mesh.visible) continue;
      const t = puff.age / 2.6;
      puff.mesh.position.y += dt * .15;
      puff.mesh.position.x += Math.sin(puff.age * 2.7 + puff.seed) * dt * .035;
      puff.mesh.position.z += dt * .025;
      const size = .012 + t * .05;
      puff.mesh.scale.set(size * .65, size * 1.5, size * .65);
      puff.mesh.rotation.y += dt * .4;
      puff.mesh.material.opacity = .12 * Math.sin(Math.PI * t);
    }
  }
}
