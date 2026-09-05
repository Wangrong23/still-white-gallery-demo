import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG as C } from "../shared/config.js";
import { Game } from "../shared/game.js";
import { spots } from "../shared/world.js";
import { sunAt } from "../shared/sun.js";
const advance = (g, n) => {
  for (let t = 0; t < n; t += 0.05) g.tick(0.05);
};
test("preparation gate, movement, wall collision and 12 reachable spots", () => {
  const g = new Game();
  g.input("detective", { forward: 1 });
  advance(g, 2);
  assert.equal(g.state.players.detective.z, 22);
  advance(g, 14);
  assert.equal(g.state.phase, "DAY");
  assert.ok(g.state.players.detective.z < 22);
  assert.equal(spots.length, 12);
  assert.equal(g.canMove(24, 0), false);
  for (const s of spots) {
    let reachable = false;
    for (let a = 0; a < 6.28; a += 0.2)
      if (g.canMove(s.x + Math.sin(a) * 1.5, s.z + Math.cos(a) * 1.5))
        reachable = true;
    assert.ok(reachable, s.name);
  }
});
test("exhibit poses blend from reachable approaches, lock facing and safely release", () => {
  for (const spot of spots) {
    const g = new Game();
    let entry = null;
    for (let a = 0; a < Math.PI * 2; a += .2) {
      Object.assign(g.state.players.killer, { x: spot.x + Math.sin(a) * 1.5, z: spot.z + Math.cos(a) * 1.5 });
      if (g.nearestSpot()?.id === spot.id) { entry = { ...g.state.players.killer }; break; }
    }
    assert.ok(entry, `reachable pose ${spot.id}`);
    g.action("killer", "pose");
    advance(g, C.poseDuration + .05);
    const k = g.state.players.killer;
    assert.equal(k.spotId, spot.id);
    assert.equal(k.pose, spot.pose);
    g.input("killer", { yaw: 2.2 });
    advance(g, 1);
    assert.equal(k.x, spot.x);
    assert.equal(k.z, spot.z);
    g.action("killer", "still");
    assert.equal(k.still, false);
    assert.ok(g.canMove(k.x, k.z), spot.name);
  }
});
test("sun shadow projection grows and changes direction", () => {
  const a = sunAt(0),
    b = sunAt(410);
  assert.ok(b.y < a.y);
  assert.ok(Math.abs(1.8 / Math.tan(b.elevation)) > 10);
  assert.notEqual(Math.sign(a.x), Math.sign(b.x));
});
test("breath has exhaustion, cooldown and recovery", () => {
  const g = new Game();
  Object.assign(g.state.players.killer, { x: 0, z: -2 });
  g.action("killer", "still");
  g.input("killer", { breath: true });
  advance(g, C.breathDuration + .1);
  assert.ok(g.state.players.killer.cooldown > 0);
  assert.equal(g.state.players.killer.holding, false);
  g.input("killer", { breath: false });
  advance(g, C.breathCooldown + C.breathRecovery + .1);
  assert.equal(g.state.players.killer.breath, C.breathDuration);
});
test("wrong shots spend ammo, move sun, never end the game at zero ammo", () => {
  const g = new Game({ debug: true });
  g.debugAction("day");
  g.input("detective", { pitch: 1.2 });
  g.tick(0.01);
  for (let i = 0; i < 4; i++) {
    g.action("detective", "shoot");
    advance(g, 0.7);
  }
  assert.equal(g.state.ammo, 0);
  assert.ok(g.state.dayTime >= 140);
  assert.equal(g.state.phase, "DAY");
  g.action("detective", "shoot");
  assert.equal(g.state.ammo, 0);
});
test("sunset blackout, night, ammo persistence, escape and hunt timeout", () => {
  const g = new Game({ debug: true });
  g.state.ammo = 2;
  g.state.players.detective.z = 10;
  g.debugAction("sunset");
  advance(g, 2.5);
  assert.equal(g.state.phase, "NIGHT");
  assert.equal(g.state.ammo, 2);
  g.state.players.detective.z = 22;
  g.tick(0.05);
  assert.equal(g.state.result, "ESCAPED");
  const h = new Game({ debug: true });
  h.state.players.detective.z = 10;
  h.debugAction("night");
  advance(h, 45.2);
  assert.equal(h.state.result, "SURVIVED");
});
test("hits on an exposed still body win, walls stop bullets", () => {
  const g = new Game({ debug: true });
  g.debugAction("day");
  Object.assign(g.state.players.detective, { x: 0, z: 1, yaw: 0 });
  Object.assign(g.state.players.killer, {
    x: 0,
    z: -2,
    still: true,
    pose: "statue",
  });
  g.action("detective", "shoot");
  assert.equal(g.state.result, "DETECTED");
  const h = new Game({ debug: true });
  h.debugAction("day");
  Object.assign(h.state.players.detective, { x: 0, z: -10, yaw: 0 });
  Object.assign(h.state.players.killer, { x: 0, z: -16, still: true });
  h.action("detective", "shoot");
  assert.equal(h.state.result, null);
});
test("night melee requires range, facing and unobstructed line", () => {
  const g = new Game({ debug: true });
  g.debugAction("night");
  Object.assign(g.state.players.killer, { x: 0, z: 2, yaw: 0 });
  Object.assign(g.state.players.detective, { x: 0, z: 1 });
  g.action("killer", "attack");
  assert.equal(g.state.result, "FOUND YOU");
});
test("debug commands cannot mutate online game", () => {
  const g = new Game();
  g.debugAction("night");
  assert.equal(g.state.phase, "PREPARATION");
});

test("suspicion marks remain at spots, toggle, and cap at three", () => {
  const g = new Game({ debug: true });
  g.debugAction("day");
  for (const id of [0, 3, 8, 10]) {
    const s = spots[id];
    Object.assign(g.state.players.detective, { x: s.x, z: s.z + 3, yaw: 0, pitch: 0 });
    g.action("detective", "mark");
  }
  assert.deepEqual(g.state.marks, [3, 8, 10]);
  Object.assign(g.state.players.killer, { x: 10, z: 10 });
  assert.deepEqual(g.state.marks, [3, 8, 10]);
  g.action("detective", "mark");
  assert.deepEqual(g.state.marks, [3, 8]);
});

test("a full default round terminates through all five phases", () => {
  const g = new Game();
  const phases = new Set([g.state.phase]);
  for (let i = 0; i < 10000 && g.state.phase !== "GAME_OVER"; i++) {
    if (g.state.phase === "DAY") g.state.players.detective.z = 3;
    g.tick(0.05);
    phases.add(g.state.phase);
  }
  assert.deepEqual([...phases], ["PREPARATION", "DAY", "SUNSET", "NIGHT", "GAME_OVER"]);
  assert.equal(g.state.result, "SURVIVED");
  assert.equal(g.state.ammo, 4);
});
