import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../shared/game.js";
import { CONFIG as C } from "../shared/config.js";
import { gaspAcoustics } from "../client/acoustics.js";
import { SnapshotBuffer } from "../client/interpolation.js";
const advance = (g, seconds, dt = .05) => { for (let i = 0; i < Math.round(seconds / dt); i++) g.tick(dt); };
const setup = () => {
  const g = new Game(); g.phase("DAY");
  Object.assign(g.state.players.killer, { x: 0, z: -1.3, still: true });
  Object.assign(g.state.players.detective, { x: 0, z: 0 });
  return g;
};

test("holding Space through exhaustion emits one gasp and never automatically restarts", () => {
  const g = setup(), p = g.state.players.killer;
  g.input("killer", { breath: true }); advance(g, 40);
  assert.equal(g.state.events.filter(e => e.type === "gasp").length, 1);
  assert.equal(p.holding, false); assert.equal(p.breathNeedsRelease, true);
  assert.equal(p.breath, C.breathDuration);
  g.input("killer", { breath: false }); g.tick(.05);
  g.input("killer", { breath: true }); g.tick(.05);
  assert.equal(p.holding, true);
});

test("exhaustion blocks refill during cooldown and premature presses need release", () => {
  const g = setup(), p = g.state.players.killer;
  g.input("killer", { breath: true }); advance(g, C.breathDuration);
  g.input("killer", { breath: false }); advance(g, 4.9);
  assert.equal(p.breath, 0); assert.equal(p.holding, false);
  advance(g, 1); assert.ok(p.breath < C.breathRestart);
  g.input("killer", { breath: true }); advance(g, 4);
  assert.ok(p.breath >= C.breathRestart); assert.equal(p.holding, false);
  g.input("killer", {}); g.tick(.05);
  g.input("killer", { breath: true }); g.tick(.05); assert.equal(p.holding, true);
});

test("release waits a full second before refill; tapping cannot refill breath", () => {
  const g = setup(), p = g.state.players.killer;
  g.input("killer", { breath: true }); advance(g, 2);
  g.input("killer", {}); g.tick(.05); const remaining = p.breath;
  advance(g, .95); assert.equal(p.breath, remaining);
  advance(g, .15); assert.ok(p.breath > remaining);
  const beforeTaps = p.breath;
  for (let i = 0; i < 10; i++) {
    g.input("killer", { breath: true }); g.tick(.05);
    g.input("killer", {}); g.tick(.05);
  }
  assert.ok(Math.abs(p.breath - (beforeTaps - .5)) < 1e-6);
});

test("breathing freezes smoothly at its current pose and resumes without a snap", () => {
  const g = setup(), p = g.state.players.killer;
  advance(g, .5, .01); const before = p.breathOffset;
  g.input("killer", { breath: true }); g.tick(.01);
  assert.ok(Math.abs(p.breathOffset - before) < .0003);
  advance(g, 1); const held = p.breathOffset; advance(g, 1);
  assert.ok(Math.abs(p.breathOffset - held) < .00001);
  g.input("killer", {}); g.tick(.01);
  assert.ok(Math.abs(p.breathOffset - held) < .0003);
  advance(g, .5); assert.ok(Math.abs(p.breathOffset - held) > .0005);
});

test("screen and hit geometry share the serialized breathing offset", () => {
  const g = setup(), p = g.state.players.killer;
  advance(g, .5); const offset = p.breathOffset;
  const origin = { x: 0, y: 1.63 + .185 + offset - .0001, z: 0 };
  assert.ok(Number.isFinite(g.hitPlayer("killer", origin, { x: 0, y: 0, z: -1 })));
  p.breathOffset = 0;
  assert.equal(g.hitPlayer("killer", origin, { x: 0, y: 0, z: -1 }), Infinity);
  const a = structuredClone(g.state), b = structuredClone(g.state);
  b.players.killer.breathOffset = .009;
  const buffer = new SnapshotBuffer(); buffer.push(a, 1000); buffer.push(b, 1100);
  assert.equal(buffer.sample(b, 1150).players.killer.breathOffset, .0045);
});

test("holding breath delays arrest, release speeds it up, continuous inspection always wins", () => {
  const held = setup(); held.state.ammo = 0;
  held.input("killer", { breath: true }); held.input("detective", { inspect: true });
  advance(held, 1.3); assert.equal(held.state.result, null);
  const progress = held.state.players.detective.inspectProgress;
  held.input("killer", {}); advance(held, .9);
  assert.equal(held.state.result, "DETECTED"); assert.ok(progress > 0);
  const g = setup(); g.input("killer", { breath: true }); g.input("detective", { inspect: true });
  advance(g, C.inspectConcealedDuration + .1); assert.equal(g.state.result, "DETECTED");
  const tapping = setup(); tapping.input("detective", { inspect: true });
  for (let i = 0; i < 80 && !tapping.state.result; i++) {
    tapping.input("killer", { breath: i % 2 === 0 }); tapping.tick(.05);
  }
  assert.equal(tapping.state.result, "DETECTED");
});

test("gasp is nearby, quieter and muffled through walls", () => {
  const source = { x: 0, y: 1.63, z: -12 }, listener = { x: 0, z: -14 };
  const blocked = gaspAcoustics(source, listener);
  const clear = gaspAcoustics({ ...source, z: 0 }, { ...listener, z: -2 });
  assert.ok(Math.abs(blocked.gain / clear.gain - .12) < 1e-6);
  assert.ok(blocked.frequency < clear.frequency);
  assert.equal(gaspAcoustics(source, { x: 0, z: 0 }).gain, 0);
  assert.ok(gaspAcoustics(source, { x: 0, z: -12 }).gain > .9);
});

test("sunset cancels holding and reset clears all exhaustion and animation state", () => {
  const g = setup(), p = g.state.players.killer;
  g.input("killer", { breath: true }); g.tick(.05); assert.equal(p.holding, true);
  g.phase("SUNSET"); g.tick(.05); assert.equal(p.holding, false);
  g.phase("NIGHT"); assert.equal(p.still, false);
  g.reset(); const fresh = g.state.players.killer;
  assert.equal(fresh.breath, C.breathDuration); assert.equal(fresh.breathNeedsRelease, false);
  assert.equal(fresh.cooldown, 0); assert.equal(fresh.breathDelay, 0); assert.equal(fresh.breathOffset, 0);
});

test('exhaustion makes the body heave harder and faster before settling',()=>{
  const g=setup(),p=g.state.players.killer;
  g.input('killer',{breath:true});advance(g,C.breathDuration);
  const phase=p.breathPhase;let peak=0;
  for(let i=0;i<100;i++){g.tick(.01);peak=Math.max(peak,Math.abs(p.breathOffset));}
  assert.ok(peak>.045);assert.ok(p.breathPhase-phase>5);
  advance(g,7);assert.ok(Math.abs(p.breathOffset)<=.0161);
  g.reset();assert.equal(g.state.players.killer.breathStrain,0);
});
