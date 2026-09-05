import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createApp } from "../server/index.js";
function client(url) {
  const ws = new WebSocket(url),
    messages = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw)));
  return {
    ws,
    messages,
    send: (m) => ws.send(JSON.stringify(m)),
    open: () => new Promise((r) => ws.once("open", r)),
    wait: async (type, predicate = () => true) => {
      for (let i = 0; i < 100; i++) {
        const m = messages.find((x) => x.type === type && predicate(x));
        if (m) return m;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw Error(`Timed out waiting for ${type}`);
    },
  };
}
test("host/join, server authority, movement replication, room isolation, disconnect", async () => {
  const app = createApp({ port: 0, host: "127.0.0.1" });
  const addr = await app.start(),
    url = `ws://127.0.0.1:${addr.port}/ws`;
  try {
    const a = client(url),
      b = client(url),
      c = client(url);
    await Promise.all([a.open(), b.open(), c.open()]);
    a.send({ type: "host", role: "detective" });
    const ar = await a.wait("room");
    assert.equal(ar.role, "detective");
    b.send({ type: "join", code: ar.code });
    const br = await b.wait("room");
    assert.equal(br.role, "killer");
    await a.wait("start");
    await b.wait("state");
    c.send({ type: "join", code: ar.code });
    await c.wait("error");
    const room = app.rooms.get(ar.code);
    a.send({ type: "input", input: { forward: 1, yaw: 0, x: 999 } });
    b.send({ type: "input", input: { forward: 1, yaw: 0 } });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(room.game.state.players.detective.z, 22);
    assert.ok(room.game.state.players.killer.z < -2);
    assert.ok(room.game.state.players.detective.x < 24);
    a.send({ type: "action", action: "still" });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(room.game.state.players.killer.still, false);
    const snapshot = await a.wait(
      "state",
      (m) => m.state.players.killer.z < -2,
    );
    assert.equal(snapshot.state.phase, "PREPARATION");
    b.ws.close();
    await a.wait("peer-left");
    assert.equal(app.rooms.has(ar.code), false);
    a.ws.close();
    c.ws.close();
  } finally {
    await app.close();
  }
});
test("two-player rematch resets all authoritative state and serves assets safely", async () => {
  const app = createApp({ port: 0, host: "127.0.0.1" }),
    addr = await app.start(),
    url = `ws://127.0.0.1:${addr.port}/ws`;
  try {
    const a = client(url),
      b = client(url);
    await Promise.all([a.open(), b.open()]);
    a.send({ type: "host", role: "killer" });
    const r = await a.wait("room");
    b.send({ type: "join", code: r.code });
    await b.wait("start");
    const room = app.rooms.get(r.code);
    room.game.state.ammo = 0;
    room.game.state.destroyedStatues = [1, 3];
    room.game.state.marks = [0];
    room.game.state.markData = { 0: { expiresAt: 45, triggeredAt: null, inside: false } };
    Object.assign(room.game.state.players.killer, { breath: 0, cooldown: 5, breathNeedsRelease: true, breathOffset: .007 });
    room.game.win("FOUND YOU");
    a.send({ type: "rematch" });
    await a.wait("waiting-rematch");
    assert.equal(room.game.state.phase, "GAME_OVER");
    b.send({ type: "rematch" });
    await a.wait("waiting-rematch", (m) => m.count === 2);
    assert.equal(room.game.state.ammo, 4);
    assert.deepEqual(room.game.state.destroyedStatues, []);
    assert.deepEqual(room.game.state.marks, []);
    assert.deepEqual(room.game.state.markData, {});
    assert.equal(room.game.state.players.killer.breath, 15);
    assert.equal(room.game.state.players.killer.breathNeedsRelease, false);
    assert.equal(room.game.state.players.killer.breathOffset, 0);
    assert.equal(room.game.state.phase, "PREPARATION");
    for (const path of [
      "/",
      "/client/main.js",
      "/shared/game.js",
      "/vendor/three.module.js",
      "/vendor/three.core.js",
    ])
      assert.equal(
        (await fetch(`http://127.0.0.1:${addr.port}${path}`)).status,
        200,
      );
    assert.equal(
      (await fetch(`http://127.0.0.1:${addr.port}/package.json`)).status,
      404,
    );
    assert.equal(
      (await fetch(`http://127.0.0.1:${addr.port}/server/index.js`)).status,
      404,
    );
    a.ws.close();
    b.ws.close();
  } finally {
    await app.close();
  }
});

test("decoys, watches, breath-delayed zero-ammo arrest replicate to both players", async () => {
  const app = createApp({ port: 0, host: "127.0.0.1" }), addr = await app.start();
  try {
    const a = client(`ws://127.0.0.1:${addr.port}/ws`), b = client(`ws://127.0.0.1:${addr.port}/ws`);
    await Promise.all([a.open(), b.open()]); a.send({ type: "host", role: "detective" });
    const r = await a.wait("room"); b.send({ type: "join", code: r.code }); await b.wait("start");
    const game = app.rooms.get(r.code).game;
    game.phase("DAY"); Object.assign(game.state.players.detective, { x: -19, z: 16 });
    a.send({ type: "input", input: { yaw: 0 } }); a.send({ type: "action", action: "shoot" });
    for (const c of [a, b]) {
      const m = await c.wait("state", m => m.state.destroyedStatues.includes(3));
      assert.equal(m.state.ammo, 3);
    }
    Object.assign(game.state.players.detective, { x: 0, z: -2 });
    a.send({ type: "action", action: "mark" });
    for (const c of [a, b]) {
      const m = await c.wait("state", m => m.state.marks.includes(0));
      assert.ok(m.state.markData[0].expiresAt > m.state.elapsed);
    }
    game.state.ammo = 0;
    Object.assign(game.state.players.detective, { x: 0, z: 0 });
    Object.assign(game.state.players.killer, { x: 0, z: -1.3, still: true });
    let breathHeld = true;
    const hold = setInterval(() => {
      b.send({ type: "input", input: { breath: breathHeld } });
      a.send({ type: "input", input: { yaw: 0, inspect: true } });
    }, 50);
    try {
      for (const c of [a, b]) {
        const m = await c.wait("state", m => m.state.players.detective.inspectProgress >= .43);
        assert.equal(m.state.players.killer.holding, true);
        assert.equal(m.state.result, null);
        assert.ok(Number.isFinite(m.state.players.killer.breathOffset));
      }
      breathHeld = false;
      for (const c of [a, b]) {
        const m = await c.wait("state", m => m.state.result === "DETECTED");
        assert.equal(m.state.ammo, 0);
      }
    } finally { clearInterval(hold); }
    a.ws.close(); b.ws.close();
  } finally { await app.close(); }
});
