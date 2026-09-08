import { statues } from "../shared/world.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createApp } from "../server/index.js";
import { Connection } from "../client/network.js";
import { AudioDirector } from "../client/audio-director.js";
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

test('two real websocket clients drive the same complete audio phase sequence', async () => {
  const app = createApp({port:0,host:'127.0.0.1'});
  const {port} = await app.start();
  const a = client(`ws://127.0.0.1:${port}/ws`), b = client(`ws://127.0.0.1:${port}/ws`);
  const directors = [new AudioDirector(), new AudioDirector()], phases = [new Set(),new Set()];
  try {
    [a,b].forEach((client,i)=>client.ws.on('message',raw=>{
      const message=JSON.parse(raw);
      if(message.type!=='state') return;
      const role=i?'killer':'detective', state=message.state;
      directors[i].updateState(state,role,{},.05);
      for(const event of state.events) directors[i].event(event,state.players[role],role);
      phases[i].add(directors[i].debugState.phase);
    }));
    await Promise.all([a.open(),b.open()]);
    a.send({type:'host',role:'detective'});
    const {code}=await a.wait('room'); b.send({type:'join',code});
    await b.wait('state');const game=app.rooms.get(code).game;
    game.state.players.detective.z=3;
    for(const phase of ['PREPARATION','DAY','SUNSET','NIGHT']) {
      await Promise.all([a.wait('state',m=>m.state.phase===phase),b.wait('state',m=>m.state.phase===phase)]);
      while(game.state.phase===phase) game.tick(.05);
    }
    await Promise.all([a.wait('state',m=>m.state.phase==='GAME_OVER'),b.wait('state',m=>m.state.phase==='GAME_OVER')]);
    assert.equal(game.state.result,'SURVIVED');
    assert.deepEqual([...phases[0]],['PREPARATION','DAY','SUNSET','NIGHT','GAME_OVER']);
    assert.deepEqual(phases[0],phases[1]);
    assert.equal(directors[0].eventId,directors[1].eventId);
  } finally {a.ws.close();b.ws.close();await app.close();}
});
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
    b.send({ type: "leave" });
    await a.wait("peer-left");
    assert.equal(app.rooms.has(ar.code), false);
    b.ws.close();
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
    Object.assign(room.game.state.players.killer, { breath: 0, cooldown: 5, breathNeedsRelease: true, breathOffset: .007 });
    room.game.win("FOUND YOU");
    a.send({ type: "rematch" });
    await a.wait("waiting-rematch");
    assert.equal(room.game.state.phase, "GAME_OVER");
    b.send({ type: "rematch" });
    await a.wait("waiting-rematch", (m) => m.count === 2);
    assert.equal(room.game.state.ammo, 4);
    assert.deepEqual(room.game.state.destroyedStatues, []);
    assert.equal("marks" in room.game.state, false);
    assert.equal("markData" in room.game.state, false);
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

test("decoys and breath-delayed zero-ammo arrest replicate to both players", async () => {
  const app = createApp({ port: 0, host: "127.0.0.1" }), addr = await app.start();
  try {
    const a = client(`ws://127.0.0.1:${addr.port}/ws`), b = client(`ws://127.0.0.1:${addr.port}/ws`);
    await Promise.all([a.open(), b.open()]); a.send({ type: "host", role: "detective" });
    const r = await a.wait("room"); b.send({ type: "join", code: r.code }); await b.wait("start");
    const game = app.rooms.get(r.code).game;
    game.phase("DAY"); Object.assign(game.state.players.detective, { x: statues[3].x, z: statues[3].z + 3 });
    a.send({ type: "input", input: { yaw: 0 } }); a.send({ type: "action", action: "shoot" });
    for (const c of [a, b]) {
      const m = await c.wait("state", m => m.state.destroyedStatues.includes(3));
      assert.equal(m.state.ammo, 3);
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

test("free STILL, pose transition and movement release replicate authoritatively", async () => {
  const app = createApp({port:0,host:"127.0.0.1"}), addr=await app.start();
  try {
    const a=client(`ws://127.0.0.1:${addr.port}/ws`),b=client(`ws://127.0.0.1:${addr.port}/ws`);
    await Promise.all([a.open(),b.open()]);a.send({type:"host",role:"killer"});
    const room=await a.wait("room");b.send({type:"join",code:room.code});await b.wait("start");
    const game=app.rooms.get(room.code).game;
    a.send({type:"action",action:"still"});
    for(const c of [a,b]) {
      const m=await c.wait("state",m=>m.state.players.killer.still);
      assert.equal(m.state.players.killer.spotId,null);assert.equal(m.state.players.killer.z,-2);
    }
    a.send({type:"input",input:{forward:1}});
    await b.wait("state",m=>!m.state.players.killer.still&&m.state.players.killer.z < -2);
    game.input('killer',{});Object.assign(game.state.players.killer,{x:0,z:-3.5});
    a.send({type:"input",input:{}});a.send({type:"action",action:"pose"});
    for(const c of [a,b]) {
      const m=await c.wait("state",m=>m.state.players.killer.spotId===0&&m.state.players.killer.poseMix>0&&m.state.players.killer.poseMix<1);
      assert.ok(m.state.players.killer.y>0&&m.state.players.killer.y<.7);
    }
    await b.wait("state",m=>m.state.players.killer.spotId===0&&m.state.players.killer.poseMix===1);
    const eventId=game.state.eventId;
    a.send({type:"input",input:{strafe:1}});
    for(const c of [a,b]) {
      const m=await c.wait("state",m=>m.state.eventId>eventId&&!m.state.players.killer.still);
      assert.equal(m.state.players.killer.spotId,null);assert.equal(m.state.players.killer.y,0);
    }
    a.ws.close();b.ws.close();
  } finally {await app.close();}
});

test("disconnected seats pause the round, reject impersonation, restore state and expire", async () => {
  const app = createApp({ port: 0, host: '127.0.0.1' });
  const { port } = await app.start(), url = `ws://127.0.0.1:${port}/ws`;
  try {
    const a = client(url), b = client(url);
    await Promise.all([a.open(), b.open()]);
    a.send({ type: 'host', role: 'detective' });
    const roomInfo = await a.wait('room');
    b.send({ type: 'join', code: roomInfo.code });
    const seat = await b.wait('room'); await a.wait('start');
    const room = app.rooms.get(roomInfo.code);
    room.game.state.ammo = 1;
    room.game.state.destroyedStatues = [0];
    b.ws.terminate();
    await a.wait('peer-reconnecting');
    const elapsed = room.game.state.elapsed;
    await new Promise(r => setTimeout(r, 80));
    assert.equal(room.game.state.elapsed, elapsed);
    assert.equal(room.active, false);
    const impostor = client(url); await impostor.open();
    impostor.send({ type: 'resume', code: roomInfo.code, role: 'killer', token: roomInfo.token });
    await impostor.wait('error');
    impostor.send({ type: 'join', code: roomInfo.code });
    await impostor.wait('error', m => !m.code);
    const restored = client(url); await restored.open();
    restored.send({ type: 'resume', code: roomInfo.code, role: 'killer', token: seat.token });
    const recovered = await restored.wait('room');
    assert.equal(recovered.resumed, true);
    assert.equal(recovered.state.ammo, 1);
    assert.deepEqual(recovered.state.destroyedStatues, [0]);
    assert.equal(recovered.state.elapsed, elapsed);
    await a.wait('resumed');
    assert.equal(room.active, true);
    restored.ws.terminate();
    await new Promise(r => setTimeout(r, 40));
    room.resumeUntil = Date.now() - 1;
    await a.wait('peer-left', m => m.reason === 'expired');
    assert.equal(app.rooms.has(roomInfo.code), false);
    a.ws.close(); impostor.ws.close();
  } finally { await app.close(); }
});

test("browser connection automatically resumes and can restore its saved tab session", async () => {
  const app = createApp({ port: 0, host: '127.0.0.1' });
  const { port } = await app.start(), url = `ws://127.0.0.1:${port}/ws`;
  const memory = new Map();
  const storage = { getItem: k => memory.get(k), setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k) };
  let state, restored = 0, conn;
  const waitFor = async predicate => {
    for (let i=0; i<100 && !predicate(); i++) await new Promise(r=>setTimeout(r,20));
    assert.ok(predicate());
  };
  const make = () => new Connection(s => { state = s; }, m => { if(m.type === 'restored') restored++; },
    undefined, { Socket: WebSocket, url, storage });
  try {
    conn = make();
    const own = await conn.connect('host', 'killer');
    const peer = client(url); await peer.open(); peer.send({ type:'join', code:own.code }); await peer.wait('start');
    app.rooms.get(own.code).game.state.ammo = 2;
    conn.ws.terminate();
    await waitFor(() => restored === 1);
    assert.equal(state.ammo, 2);
    assert.equal(conn.role, 'killer');
    assert.equal(conn.reconnecting, false);
    // Simulate page disposal without the explicit leave action.
    const oldSocket = conn.ws;
    conn.ws = null;
    oldSocket.close();
    conn = make();
    assert.equal(conn.resumeSaved(), true);
    await waitFor(() => restored === 2);
    assert.equal(state.ammo, 2);
    conn.close();
    await peer.wait('peer-left');
    assert.equal(memory.size, 0);
    assert.equal(app.rooms.has(own.code), false);
    peer.ws.close();
  } finally { conn?.close(); await app.close(); }
});

test('classic disguise pose and preview selection reach both websocket clients', async () => {
  const app=createApp({port:0,host:'127.0.0.1'}), {port}=await app.start();
  const a=client(`ws://127.0.0.1:${port}/ws`), b=client(`ws://127.0.0.1:${port}/ws`);
  try {
    await Promise.all([a.open(),b.open()]);
    a.send({type:'host',role:'detective'});
    const {code}=await a.wait('room');b.send({type:'join',code});await b.wait('state');
    const g=app.rooms.get(code).game;g.phase('DAY');
    for(const pose of ['david','discobolus','liberty','thinker','victory','venus']) {
      if(g.state.players.killer.still) g.leaveStill();
      for(let i=0;i<12;i++) g.tick(.025);
      Object.assign(g.state.players.killer,{x:0,z:-3.5});g.state.sculpturePose=pose;
      b.send({type:'action',action:'pose'});
      const states=await Promise.all([a,b].map(c=>c.wait('state',m=>m.state.players.killer.still && m.state.players.killer.pose===pose)));
      assert.equal(states[0].state.players.killer.pose,states[1].state.players.killer.pose);
      assert.equal(states[0].state.sculpturePose,states[1].state.sculpturePose);
      assert.notEqual(states[0].state.sculpturePose,pose);
    }
  } finally {a.ws.close();b.ws.close();await app.close();}
});
