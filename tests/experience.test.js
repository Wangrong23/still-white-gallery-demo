import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings, loadSettings, saveSettings } from "../client/settings.js";
import { spatialAcoustics } from "../client/acoustics.js";
import { Game } from "../shared/game.js";
import { propFootprints } from "../shared/world.js";
import { Sound } from "../client/audio.js";

test("settings survive reload and reject malformed or out-of-range saved values", () => {
  const values = new Map();
  const storage = { getItem: (k) => values.get(k), setItem: (k,v) => values.set(k,v) };
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  const changed = { ...DEFAULT_SETTINGS, volume: .4, sensitivity: 2, invertY: true, quality: "performance" };
  assert.equal(saveSettings(storage, changed), true);
  assert.deepEqual(loadSettings(storage), changed);
  assert.deepEqual(normalizeSettings({ volume: -4, ambience: 8, sensitivity: Infinity, invertY: "false", quality: "unknown" }),
    { ...DEFAULT_SETTINGS, volume: 0 });
  values.set("still.settings.v1", "{broken");
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
});

test("blocked browser storage falls back to defaults and reports save failure", () => {
  const storage = { getItem() { throw Error("denied"); }, setItem() { throw Error("full"); } };
  assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  assert.equal(saveSettings(storage, DEFAULT_SETTINGS), false);
});

test("audio settings control live gains and returning to menu stops pending sounds", () => {
  const sound = new Sound();
  const gains = {}, stopped = [];
  sound.ctx = { currentTime: 2, suspend: () => stopped.push("context") };
  sound.master = { gain: { setTargetAtTime: (v) => { gains.master = v; } } };
  sound.ambience = { gain: { setTargetAtTime: (v) => { gains.ambience = v; } } };
  sound.configure({ ...DEFAULT_SETTINGS, volume: .5, ambience: 0 });
  assert.equal(gains.master, .15);
  assert.equal(gains.ambience, 0);
  sound.configure({ ...DEFAULT_SETTINGS, volume: 0 });
  assert.equal(sound.muted, true);
  // Muting must suppress TTS too, which would access window if reached in Node.
  assert.doesNotThrow(() => sound.event({ type: "phase", phase: "SUNSET" }, {}, "detective"));
  sound.track({ stop: () => stopped.push("effect"), addEventListener() {} });
  sound.stop();
  assert.deepEqual(stopped, ["effect", "context"]);
  assert.equal(sound.activeSources.size, 0);
});

test("footsteps are muffled across a wall but retain clear sound through the doorway", () => {
  const wall = spatialAcoustics({ x: 8, z: 0 }, { x: 10, z: 0 });
  const doorway = spatialAcoustics({ x: 8, z: 6 }, { x: 10, z: 6 });
  assert.equal(wall.blocked, true);
  assert.equal(doorway.blocked, false);
  assert.ok(Math.abs(wall.gain / doorway.gain - .22) < 1e-6);
  assert.ok(wall.frequency < doorway.frequency);
  assert.equal(spatialAcoustics({ x: 0, z: 0 }, { x: 0, z: 20 }).gain, 0);
});

test("spatial pan follows the listener's facing and stays centered for own footsteps", () => {
  assert.equal(spatialAcoustics({ x: 2, z: 0 }, { x: 0, z: 0, yaw: 0 }).pan, 1);
  assert.equal(spatialAcoustics({ x: 2, z: 0 }, { x: 0, z: 0, yaw: Math.PI }).pan, -1);
  assert.equal(spatialAcoustics({ x: -2, z: 0 }, { x: 0, z: 0 }).pan, -1);
  assert.equal(spatialAcoustics({ x: 0, z: 0 }, { x: 0, z: 0 }).pan, 0);
});

test("every prop base blocks movement, freezing inside it and pose paths through it", () => {
  const game = new Game();
  game.state.phase = "DAY";
  const p = game.state.players.killer;
  for (const b of propFootprints) {
    assert.equal(game.canMove(b.x, b.z), false, b.id);
    Object.assign(p, { x: b.x, z: b.z, still: false });
    game.action("killer", "still");
    assert.equal(p.still, false, b.id);
    assert.equal(game.posePathClear({ x: b.x - 2, z: b.z }, { x: b.x + 2, z: b.z }), false, b.id);
    Object.assign(p, { x: b.x - 2, z: b.z });
    assert.equal(game.canMove(p.x, p.z), true, b.id);
    game.move(p, 4, 0);
    assert.ok(p.x < b.x - b.w / 2, b.id);
  }
});

test("movement footprints do not create floating bullet impacts in empty space above pots", () => {
  const game = new Game();
  const hit = game.obstacleHit({ x: -22, y: 1.65, z: -3 }, { x: 1, y: 0, z: 0 });
  assert.ok(hit.distance > 2);
  assert.ok(!hit.solidId?.startsWith("prop-footprint"));
});
