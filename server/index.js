import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Game } from "../shared/game.js";
import { CONFIG } from "../shared/config.js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function createApp({
  port = Number(process.env.PORT) || 5000,
  host = process.env.HOST || "::",
  reconnectGraceMs = 30000,
} = {}) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
  };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (path === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"status":"ok","game":"STILL"}');
        return;
      }
      let file;
      if (path.startsWith("/vendor/")) {
        const name = path.slice(8);
        if (!["three.module.js", "three.core.js"].includes(name)) throw Error();
        file = resolve(ROOT, "node_modules/three/build", name);
      } else if (path === "/" || path === "/index.html")
        file = resolve(ROOT, "index.html");
      else if (
        /^\/(client|shared)\/[a-zA-Z0-9_./-]+$/.test(path) &&
        !path.includes("..")
      )
        file = resolve(ROOT, "." + path);
      else {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
  const rooms = new Map();
  let shuttingDown = false;
  const send = (ws, data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };
  const broadcast = (room, data) => {
    for (const p of room.clients.values()) send(p, data);
  };
  const finishRoom = (room, reason = "left") => {
    rooms.delete(room.code);
    room.active = false;
    for (const ws of room.clients.values()) {
      ws.room = null;
      send(ws, { type: "peer-left", reason });
    }
    room.clients.clear();
    room.seats.clear();
  };
  wss.on("connection", (ws) => {
    ws.alive = true;
    ws.on("pong", () => (ws.alive = true));
    ws.role = null;
    ws.room = null;
    ws.messages = 0;
    ws.window = Date.now();
    ws.lastInput = Date.now();
    ws.on("message", (raw) => {
      try {
        if (Date.now() - ws.window > 1000) {
          ws.messages = 0;
          ws.window = Date.now();
        }
        if (++ws.messages > 100) {
          ws.close(1008, "Too many messages");
          return;
        }
        const m = JSON.parse(raw);
        if (!m || typeof m !== "object") return;
        if (m.type === "resume") {
          if (ws.room) return;
          const room = rooms.get(String(m.code || "").toUpperCase());
          const seat = room?.seats.get(m.role);
          if (!room || !seat || typeof m.token !== "string" || seat.token !== m.token
            || (room.resumeUntil && Date.now() >= room.resumeUntil)) {
            send(ws, { type: "error", code: "resume-expired", message: "原房间已失效，无法恢复本局。" });
            return;
          }
          const old = room.clients.get(m.role);
          if (old && old !== ws) { old.room = null; old.close(1000, "Session restored elsewhere"); }
          ws.room = room;
          ws.role = m.role;
          room.clients.set(ws.role, ws);
          if (room.clients.size === room.seats.size) room.resumeUntil = null;
          room.active = room.started && room.clients.size === 2;
          send(ws, { type: "room", code: room.code, role: ws.role, token: seat.token,
            resumed: true, active: room.active, started: room.started, state: room.game.state,
            reconnectGraceMs });
          if (room.active) broadcast(room, { type: "resumed" });
          return;
        }
        if (m.type === "host" || m.type === "join") {
          if (ws.room) return;
          let room, role;
          if (m.type === "host") {
            if (rooms.size >= 100) {
              send(ws, {
                type: "error",
                message: "服务器房间已满，请稍后重试。",
              });
              return;
            }
            let code;
            do {
              code = randomBytes(3).toString("hex").toUpperCase();
            } while (rooms.has(code));
            role = m.role === "killer" ? "killer" : "detective";
            room = {
              code,
              game: new Game(),
              clients: new Map(),
              seats: new Map(),
              ready: new Set(),
              active: false,
              started: false,
              resumeUntil: null,
              created: Date.now(),
            };
            rooms.set(code, room);
          } else {
            room = rooms.get(String(m.code || "").toUpperCase());
            if (!room || room.seats.size >= 2 || room.started || room.resumeUntil || room.clients.size !== 1) {
              send(ws, {
                type: "error",
                message: "房间不存在、已满或游戏已经开始。",
              });
              return;
            }
            role = room.clients.has("detective") ? "killer" : "detective";
          }
          ws.room = room;
          ws.role = role;
          room.clients.set(role, ws);
          const token = randomBytes(24).toString("hex");
          room.seats.set(role, { token });
          send(ws, { type: "room", code: room.code, role, token, reconnectGraceMs });
          if (room.clients.size === 2) {
            room.active = true;
            room.started = true;
            broadcast(room, { type: "start" });
            broadcast(room, { type: "state", state: room.game.state });
          }
          return;
        }
        const room = ws.room;
        if (!room) return;
        if (m.type === "leave") { finishRoom(room); return; }
        if (m.type === "input" && room.active) {
          ws.lastInput = Date.now();
          room.game.input(ws.role, m.input || {});
          if (Number.isSafeInteger(m.seq) && m.seq > 0)
            ws.pendingInputSeq = Math.max(ws.pendingInputSeq || 0, m.seq);
        }
        if (m.type === "action" && room.active && m.action !== "mark")
          room.game.action(ws.role, m.action);
        if (m.type === "rematch" && room.active && room.game.state.phase === "GAME_OVER") {
          room.ready.add(ws.role);
          broadcast(room, { type: "waiting-rematch", count: room.ready.size });
          if (room.ready.size === 2) {
            room.game.reset();
            room.ready.clear();
            broadcast(room, { type: "start" });
          }
        }
      } catch {
        send(ws, { type: "error", message: "请求格式无效。" });
      }
    });
    ws.on("close", () => {
      const room = ws.room;
      if (!room || shuttingDown || room.clients.get(ws.role) !== ws) return;
      room.clients.delete(ws.role);
      room.active = false;
      room.game.inputs = {};
      room.ready.clear();
      room.resumeUntil ??= Date.now() + reconnectGraceMs;
      broadcast(room, { type: "peer-reconnecting", remainingMs: Math.max(0, room.resumeUntil - Date.now()) });
    });
    ws.on("error", () => {});
  });
  let last = performance.now(),
    accum = 0;
  const tick = setInterval(() => {
    const now = performance.now(),
      dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    accum += dt;
    for (const room of rooms.values()) {
      if (room.resumeUntil && Date.now() >= room.resumeUntil) { finishRoom(room, "expired"); continue; }
      if (!room.active) continue;
      for (const [role, ws] of room.clients) {
        if (Date.now() - ws.lastInput > 500)
          room.game.input(role, {
            yaw: room.game.state.players[role].yaw,
            pitch: room.game.state.players[role].pitch,
          });
      }
      room.game.tick(dt);
      for (const [role, ws] of room.clients)
        room.game.state.players[role].inputAck = ws.pendingInputSeq || 0;
      if (accum >= 1 / CONFIG.snapshotHz)
        broadcast(room, { type: "state", state: room.game.state });
    }
    if (accum >= 1 / CONFIG.snapshotHz) accum = 0;
  }, 1000 / CONFIG.serverHz);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
    for (const room of rooms.values())
      if (!room.started && Date.now() - room.created > 600000) finishRoom(room, "expired");
  }, 15000);
  return {
    server,
    rooms,
    start: () =>
      new Promise((r) =>
        server.listen({ port, host, ipv6Only: false }, () => {
          const { address, port: bound, family } = server.address();
          const shown = family === "IPv6" ? `[${address}]` : address;
          console.log(`STILL is listening at http://${shown}:${bound}`);
          r(server.address());
        }),
      ),
    close: () =>
      new Promise((r) => {
        shuttingDown = true;
        clearInterval(tick);
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => server.close(r));
      }),
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  app.start();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => app.close().then(() => process.exit(0)));
}
