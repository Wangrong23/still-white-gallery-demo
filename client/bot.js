import { CONFIG as C } from "../shared/config.js";
import { spots } from "../shared/world.js";
import { distance } from "../shared/math.js";
// Local rehearsal only. Grid navigation shares the real collision map.
export class RehearsalBot {
  constructor(game) {
    this.game = game;
    this.path = [];
    this.target = null;
    this.replan = 0;
    this.stillSince = 0;
    this.suspicion = 0;
    this.role = null;
    this.patrol = 0;
    this.walkable = new Map();
    this.collisionKey = "";
  }
  route(from, to) {
    const collisionKey = this.game.state.destroyedStatues.join(",");
    if (collisionKey !== this.collisionKey) {
      this.walkable.clear();
      this.collisionKey = collisionKey;
    }
    const game = this.game,
      key = (x, z) => `${x},${z}`,
      start = { x: Math.round(from.x), z: Math.round(from.z) },
      end = { x: Math.round(to.x), z: Math.round(to.z) },
      queue = [start],
      parents = new Map([[key(start.x, start.z), null]]);
    let found = null;
    for (let n = 0; n < queue.length; n++) {
      const v = queue[n];
      if (Math.hypot(v.x - end.x, v.z - end.z) < 1.6) {
        found = v;
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = v.x + dx,
          z = v.z + dz,
          k = key(x, z);
        if (parents.has(k)) continue;
        if (!this.walkable.has(k)) this.walkable.set(k, game.canMove(x, z));
        if (this.walkable.get(k)) {
          parents.set(k, v);
          queue.push({ x, z });
        }
      }
    }
    const path = [];
    while (found && parents.get(key(found.x, found.z))) {
      path.unshift(found);
      found = parents.get(key(found.x, found.z));
    }
    return path;
  }
  tick(dt, role) {
    const g = this.game,
      s = g.state,
      p = s.players[role],
      op = s.players[role === "detective" ? "killer" : "detective"];
    if (this.role !== role) {
      this.role = role;
      this.target = null;
      this.path = [];
      this.replan = 0;
    }
    if (s.phase === "GAME_OVER" || s.phase === "SUNSET") return;
    this.replan -= dt;
    if (role === "killer" && s.phase !== "NIGHT") {
      if (p.still) {
        this.stillSince += dt;
        g.input(role, { breath: !p.breathNeedsRelease && p.cooldown === 0
          && (p.holding || p.breath >= C.breathRestart) && g.tension() > 0.2 });
        if (this.stillSince > 28 && g.tension() < 0.12) {
          g.action(role, "still");
          this.target = null;
          this.stillSince = 0;
        }
        return;
      }
      if (!this.target) {
        this.patrol = (this.patrol + 5) % spots.length;
        this.target = spots[this.patrol];
      }
      if (distance(p, this.target) < 1.65 && g.nearestSpot()) {
        g.action(role, "pose");
        this.path = [];
        this.stillSince = 0;
        return;
      }
    } else if (s.phase === "NIGHT") {
      this.target = role === "killer" ? op : { x: 0, z: 22.4 };
      if (role === "killer" && distance(p, op) < 1.6) {
        g.input(role, { yaw: Math.atan2(-(op.x - p.x), -(op.z - p.z)) });
        g.action(role, "attack");
      }
    } else {
      const patrol = [
        { x: 0, z: 3 },
        { x: 5, z: -7 },
        { x: 15, z: -7 },
        { x: 18, z: -15 },
        { x: 5, z: -7 },
        { x: -5, z: -7 },
        { x: -18, z: -10 },
        { x: -5, z: 7 },
        { x: -17, z: 9 },
        { x: 4, z: 14 },
        { x: 15, z: 7 },
      ];
      if (!this.target || distance(p, this.target) < 1.4) {
        this.target = patrol[this.patrol++ % patrol.length];
        this.replan = 0;
      }
      if ((op.moving || (s.ammo === 0 && this.target === op)) && distance(p, op) < 15 && g.lineOfSight(p, op)) {
        this.suspicion += dt;
        const yaw = Math.atan2(-(op.x - p.x), -(op.z - p.z));
        if (s.ammo === 0) {
          this.target = op;
          if (distance(p, op) < 1.6) {
            g.input(role, { yaw, pitch: Math.atan2((op.y || 0) + 1.3 - 1.65, distance(p, op)), inspect: true });
            return;
          }
        } else {
          g.input(role, { yaw, pitch: 0 });
          if (this.suspicion > 1.5) {
            g.action(role, "shoot");
            this.suspicion = 0;
          }
          return;
        }
      }
      this.suspicion = 0;
    }
    if (this.replan <= 0) {
      this.path = this.route(p, this.target);
      this.replan = s.phase === "NIGHT" ? 0.7 : 2;
    }
    while (this.path.length && distance(p, this.path[0]) < 0.35)
      this.path.shift();
    const next = this.path[0];
    if (next)
      g.input(role, {
        forward: 1,
        yaw: Math.atan2(-(next.x - p.x), -(next.z - p.z)),
        sprint: role === "killer",
      });
    else g.input(role, { forward: 0, yaw: p.yaw + 0.15 * dt });
  }
}
