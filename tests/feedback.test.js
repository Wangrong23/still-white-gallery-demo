import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../shared/game.js";
import { statues, spots } from "../shared/world.js";
import { CONFIG as C } from "../shared/config.js";
import { SnapshotBuffer } from "../client/interpolation.js";
const day = () => { const g = new Game(); g.phase("DAY"); return g; };
const advance = (g, seconds) => { for (let n = 0; n < Math.ceil(seconds / .05); n++) g.tick(.05); };

test("zero-ammo inspection catches a nearby killer only after continuous aiming", () => {
  const g = day(); g.state.ammo = 0;
  Object.assign(g.state.players.detective, { x: 0, z: 0 });
  Object.assign(g.state.players.killer, { x: 0, z: -1.3 });
  g.input("detective", { inspect: true });
  advance(g, .6); assert.equal(g.state.result, null);
  g.input("detective", {}); g.tick(.05);
  assert.equal(g.state.players.detective.inspectProgress, 0);
  g.input("detective", { inspect: true }); advance(g, 1.3);
  assert.equal(g.state.result, "DETECTED"); assert.equal(g.state.ammo, 0);
});

test("inspection interrupts on movement, looking away, target escape and night; walls block it", () => {
  for (const interrupt of ["move", "aim", "escape", "night", "wall"]) {
    const g = day();
    Object.assign(g.state.players.detective, { x: 0, z: 0 });
    Object.assign(g.state.players.killer, { x: 0, z: -1.3 });
    g.input("detective", { inspect: true }); advance(g, .6);
    if (interrupt === "move") g.input("detective", { inspect: true, strafe: 1 });
    if (interrupt === "aim") g.input("detective", { inspect: true, yaw: Math.PI });
    if (interrupt === "escape") g.state.players.killer.z = -3;
    if (interrupt === "night") g.phase("NIGHT");
    if (interrupt === "wall") {
      Object.assign(g.state.players.detective, { x: 0, z: -12.3 });
      Object.assign(g.state.players.killer, { x: 0, z: -13.7 });
    }
    g.tick(.05);
    assert.equal(g.state.players.detective.inspectProgress, 0, interrupt);
    assert.equal(g.state.result, null, interrupt);
  }
});

test("shots destroy the first decoy, remove its collider, and preserve state until reset", () => {
  const g = day(), statue = statues[3];
  Object.assign(g.state.players.detective, { x: statue.x, z: statue.z + 3 });
  assert.equal(g.canMove(statue.x, statue.z), false);
  g.action("detective", "shoot");
  assert.deepEqual(g.state.destroyedStatues, [3]);
  assert.equal(g.canMove(statue.x, statue.z), true);
  assert.equal(g.state.events.find(e => e.type === "shot").surface, null);
  assert.equal(g.state.ammo, 3); assert.equal(g.state.dayTime, C.wrongShotPenalty);
  assert.deepEqual(JSON.parse(JSON.stringify(g.state)).destroyedStatues, [3]);
  g.phase("NIGHT"); assert.deepEqual(g.state.destroyedStatues, [3]);
  g.reset(); assert.deepEqual(g.state.destroyedStatues, []);
  assert.equal(g.canMove(statue.x, statue.z), false);
});

test("empty rays leave no impact and walls receive surface-bound impacts", () => {
  const g = day();
  g.input("detective", { pitch: 1.3 }); g.action("detective", "shoot");
  let shot = g.state.events.findLast(e => e.type === "shot");
  assert.equal(shot.point, null); assert.equal(shot.surface, null);
  advance(g, .7); g.state.players.detective.x = -2.3;
  g.input("detective", { yaw: Math.PI }); g.action("detective", "shoot");
  shot = g.state.events.findLast(e => e.type === "shot");
  assert.equal(shot.surface, "entry-back-left");
  assert.ok(Math.abs(shot.point.z - 23.85) < .001);
});

test("daylight inspection clears decoys without ammo or time penalty", () => {
  const g = day(), p = statues[3]; g.state.ammo = 0;
  Object.assign(g.state.players.detective, { x: p.x, z: p.z + 1.3 });
  g.input("detective", { inspect: true }); advance(g, C.inspectConcealedDuration + .1);
  assert.deepEqual(g.state.destroyedStatues, [3]);
  assert.equal(g.state.ammo, 0); assert.ok(g.state.dayTime < C.inspectConcealedDuration + .2);
  assert.equal(g.state.result, null);
});

const watch = (g, id = 0) => {
  const s = spots[id];
  Object.assign(g.state.players.detective, { x: s.x, z: s.z + 3, yaw: 0, pitch: 0 });
  g.action("detective", "mark");
};
test("motion watches detect a still killer leaving, alert once, expire and reset", () => {
  const g = day();
  Object.assign(g.state.players.killer, { x: 0, z: -3.5 }); g.action("killer", "pose"); advance(g, C.poseDuration + .1);
  watch(g); advance(g, .2);
  assert.equal(g.state.markData[0].triggeredAt, null);
  g.action("killer", "still"); g.tick(.05);
  assert.ok(g.state.markData[0].triggeredAt !== null, "stepping off the pedestal also trips the watch");
  g.input("killer", { forward: 1, yaw: Math.PI });
  advance(g, 1);
  assert.ok(g.state.markData[0].triggeredAt !== null);
  assert.equal(g.state.events.filter(e => e.type === "mark-alert").length, 1);
  advance(g, 6); assert.deepEqual(g.state.marks, []);
  watch(g); advance(g, 46); assert.deepEqual(g.state.marks, []);
  watch(g); g.phase("SUNSET"); g.tick(.05); assert.deepEqual(g.state.marks, []);
  g.reset(); assert.deepEqual(g.state.markData, {});
});

test("snapshot interpolation is smooth, takes the short rotation and never edits authority", () => {
  const g = day(), a = structuredClone(g.state), b = structuredClone(g.state);
  a.players.detective.x = 0; a.players.detective.yaw = Math.PI - .1;
  b.players.detective.x = 1; b.players.detective.yaw = -Math.PI + .1;
  b.elapsed = 1;
  const buffer = new SnapshotBuffer(100); buffer.push(a, 1000); buffer.push(b, 1100);
  const mid = buffer.sample(b, 1150);
  assert.equal(mid.players.detective.x, .5);
  assert.ok(Math.abs(mid.players.detective.yaw - Math.PI) < .001);
  assert.equal(b.players.detective.x, 1);
  assert.ok(buffer.sample(b, 1160).players.detective.x > mid.players.detective.x);
  b.players.killer.still = true; b.players.killer.x = 10;
  assert.equal(buffer.sample(b, 1150).players.killer.x, 10);
  buffer.push(a, 1200); assert.equal(buffer.frames.length, 1);
});
