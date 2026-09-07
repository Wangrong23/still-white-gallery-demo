import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Game } from "../shared/game.js";
import { bodyParts } from "../shared/body.js";
import { DeathEffects, fallenPose } from "../client/death.js";

function fatal(cause) {
  const g = new Game();
  g.phase(cause === "shot" ? "DAY" : "NIGHT");
  Object.assign(g.state.players.detective, { x: 0, z: 0 });
  Object.assign(g.state.players.killer, { x: 0, z: -1, yaw: Math.PI });
  g.action(cause === "shot" ? "detective" : "killer", cause === "shot" ? "shoot" : "attack");
  return g;
}

test("lethal shots and counterattacks retain victim, impact and pose through snapshots; reset revives", () => {
  for (const cause of ["shot", "attack"]) {
    const g = fatal(cause), role = cause === "shot" ? "killer" : "detective";
    assert.equal(g.state.phase, "GAME_OVER");
    const victim = g.state.players[role];
    assert.equal(victim.death.cause, cause);
    assert.ok(victim.death.point.y > 1);
    assert.ok(victim.death.parts.length >= 13);
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(g.state)).players[role].death), JSON.stringify(victim.death));
    const frozen = structuredClone(g.state);
    g.input(role, { forward: 1, yaw: 2 }); g.tick(.1); g.action(role, "shoot");
    assert.deepEqual(g.state, frozen);
    g.reset();
    assert.equal(g.state.players[role].death, null);
  }
});

test("inspection and nonviolent endings do not create blood or a corpse", () => {
  const g = new Game(); g.phase("DAY");
  Object.assign(g.state.players.detective, { x: 0, z: 0 });
  Object.assign(g.state.players.killer, { x: 0, z: -1 });
  g.input("detective", { inspect: true });
  for (let i = 0; i < 50; i++) g.tick(.05);
  assert.equal(g.state.result, "DETECTED");
  assert.equal(g.state.players.killer.death, null);
  for (const result of ["ESCAPED", "KILLER ESCAPED", "SURVIVED"]) {
    g.reset(); g.win(result);
    assert.ok(Object.values(g.state.players).every(p => !p.death));
  }
});

test("every pose falls horizontally with all body bounds above the floor", () => {
  for (const role of ["detective", "killer"]) for (const stance of ["stand", "sit", "curl", "wall", "arms"]) {
    const p = fatal(role === "killer" ? "shot" : "attack").state.players[role];
    p.y = stance === "sit" ? .7 : 0;
    p.death.parts = bodyParts(stance, 0, 0, role === "detective");
    for (const age of [0, .3, .6, 1.1, 3]) {
      const pose = fallenPose(p, age);
      if (age > 1) assert.ok(Math.abs(new T.Vector3(0, 1, 0).applyQuaternion(pose.rotation).y) < 1e-6);
      for (const part of pose.parts) {
        const local = new T.Quaternion().setFromEuler(new T.Euler(part.rx, 0, part.rz));
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
          const corner = new T.Vector3(x * part.w / 2, y * part.h / 2, z * part.d / 2)
            .applyQuaternion(local).add(new T.Vector3(part.x, part.y, part.z))
            .applyQuaternion(pose.rotation).add(pose.position);
          assert.ok(corner.y >= .0249, `${role}/${stance}/${age}`);
        }
      }
    }
  }
});

test("blood animates after the game clock stops, survives repeated snapshots and disposes on reset", () => {
  const g = fatal("shot"), scene = new T.Scene(), fx = new DeathEffects(scene);
  const actors = Object.fromEntries(Object.entries(g.state.players).map(([role, p]) => {
    const a = new T.Group();
    a.userData.parts = bodyParts("stand", 0, 0, role === "detective").map(() => new T.Object3D());
    a.userData.face = new T.Object3D();
    return [role, a];
  }));
  fx.update(g.state.players, actors, .02, false);
  assert.equal(fx.ready, false);
  const e = fx.entries.get("killer");
  assert.ok(e.pool.material.color.r > e.pool.material.color.g * 3);
  for (let i = 0; i < 180; i++) fx.update(structuredClone(g.state.players), actors, .02, false);
  assert.equal(fx.entries.get("killer"), e);
  assert.equal(fx.ready, true);
  assert.ok(e.drops.every(d => d.landed));
  let disposed = 0;
  e.pool.geometry.addEventListener("dispose", () => disposed++);
  g.reset(); fx.update(g.state.players, actors, .02, false);
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, 1);
});
