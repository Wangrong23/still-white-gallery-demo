import { CONFIG as C, STATES as S } from "./config.js";
import { solids, spots, exit, statues } from "./world.js";
import { bodyParts } from "./body.js";
import {
  clamp,
  distance,
  direction,
  rayBox,
  rotateY,
  inversePart,
} from "./math.js";

const player = (role) => ({
  role,
  x: role === "killer" ? 0 : 0,
  y: 0,
  z: role === "killer" ? -2 : 22,
  yaw: 0,
  pitch: 0,
  still: false,
  spotId: null,
  pose: "stand",
  breath: C.breathDuration,
  holding: false,
  cooldown: 0,
  moving: false,
  sprint: 0,
  flashlight: true,
  step: 0,
  inspectTarget: null,
  inspectProgress: 0,
});
export class Game {
  constructor({ debug = false } = {}) {
    this.debug = debug;
    this.reset();
  }
  reset() {
    this.state = {
      phase: S.PREPARATION,
      phaseTime: 0,
      dayTime: 0,
      nightTime: 0,
      elapsed: 0,
      ammo: C.detectiveAmmo,
      result: null,
      players: { detective: player("detective"), killer: player("killer") },
      marks: [],
      markData: {},
      destroyedStatues: [],
      events: [],
      eventId: 0,
    };
    this.inputs = {};
    this.lastShot = -10;
  }
  event(type, data = {}) {
    const s = this.state;
    s.events.push({ id: ++s.eventId, type, ...data });
    s.events = s.events.slice(-24);
  }
  phase(phase) {
    this.state.phase = phase;
    this.state.phaseTime = 0;
    this.event("phase", { phase });
    if (phase === S.NIGHT) {
      this.leaveStill();
      this.state.players.detective.flashlight = true;
    }
  }
  win(result) {
    if (this.state.phase === S.GAME_OVER) return;
    this.state.result = result;
    this.phase(S.GAME_OVER);
  }
  input(role, data) {
    if (!this.state.players[role]) return;
    this.inputs[role] = {
      forward: clamp(Number(data.forward) || 0, -1, 1),
      strafe: clamp(Number(data.strafe) || 0, -1, 1),
      yaw: Number.isFinite(data.yaw) ? data.yaw : 0,
      pitch: clamp(Number(data.pitch) || 0, -1.3, 1.3),
      sprint: !!data.sprint,
      breath: !!data.breath,
      inspect: !!data.inspect,
    };
  }
  nearestSpot() {
    const p = this.state.players.killer;
    return spots
      .filter((s) => distance(s, p) <= s.range)
      .sort((a, b) => distance(a, p) - distance(b, p))[0];
  }
  leaveStill() {
    const p = this.state.players.killer;
    if (!p.still) return;
    p.still = false;
    p.pose = "stand";
    p.holding = false;
    p.y = 0;
    // Step off a pedestal without leaving the actor stuck inside its collider.
    if (!this.canMove(p.x, p.z)) {
      const spot = spots[p.spotId];
      for (let r = 0.9; r <= 2; r += 0.3) {
        let found = false;
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6,
            x = spot.x + Math.sin(a) * r,
            z = spot.z + Math.cos(a) * r;
          if (this.canMove(x, z)) {
            p.x = x;
            p.z = z;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    p.spotId = null;
    this.event("unstill", { x: p.x, z: p.z });
  }
  action(role, action) {
    const s = this.state,
      p = s.players[role];
    if (!p || s.phase === S.GAME_OVER) return;
    if (!p.still && this.inputs[role]) {
      p.yaw = this.inputs[role].yaw;
      p.pitch = this.inputs[role].pitch;
    }
    if (
      action === "still" &&
      role === "killer" &&
      [S.PREPARATION, S.DAY].includes(s.phase)
    ) {
      if (p.still) this.leaveStill();
      else {
        const spot = this.nearestSpot();
        if (spot) {
          Object.assign(p, {
            x: spot.x,
            y: spot.y,
            z: spot.z,
            yaw: spot.yaw,
            still: true,
            spotId: spot.id,
            pose: spot.pose,
            moving: false,
          });
          this.event("still", { spotId: spot.id });
        }
      }
    }
    if (
      action === "shoot" &&
      role === "detective" &&
      [S.DAY, S.NIGHT].includes(s.phase) &&
      s.ammo > 0 &&
      s.elapsed - this.lastShot > C.shotCooldown
    ) {
      this.lastShot = s.elapsed;
      s.ammo--;
      const o = { x: p.x, y: 1.65, z: p.z },
        d = direction(p.yaw, p.pitch),
        hit = this.hitPlayer("killer", o, d),
        obstacle = this.obstacleHit(o, d),
        wall = obstacle.distance;
      const detected = hit < wall && hit < 65;
      const travel = Math.min(hit, wall);
      const impact = Number.isFinite(travel) && travel < 65;
      if (!detected && impact && obstacle.statueId != null)
        this.breakStatue(obstacle.statueId);
      this.event("shot", {
        x: p.x,
        z: p.z,
        hit: detected,
        surface: !detected && impact ? obstacle.solidId ?? null : null,
        point: impact ? {
          x: o.x + d.x * travel,
          y: o.y + d.y * travel,
          z: o.z + d.z * travel,
        } : null,
      });
      if (detected) this.win("DETECTED");
      else if (s.phase === S.DAY) {
        s.dayTime = Math.min(C.dayDuration, s.dayTime + C.wrongShotPenalty);
        this.event("penalty");
        if (s.dayTime >= C.dayDuration) this.phase(S.SUNSET);
      }
    }
    if (action === "attack" && role === "killer" && s.phase === S.NIGHT) {
      const d = s.players.detective;
      const dir = direction(p.yaw);
      const len = distance(p, d);
      if (
        len < C.attackRange &&
        ((d.x - p.x) * dir.x + (d.z - p.z) * dir.z) / Math.max(len, 0.01) >
          0.25 &&
        this.lineOfSight(p, d)
      )
        this.win("FOUND YOU");
      else this.event("swipe");
    }
    if (action === "flashlight" && role === "detective" && s.phase === S.NIGHT)
      p.flashlight = !p.flashlight;
    if (action === "mark" && role === "detective" && s.phase === S.DAY) {
      const o = { x: p.x, y: 1.65, z: p.z },
        d = direction(p.yaw, p.pitch);
      let chosen = null,
        best = Infinity;
      for (const spot of spots) {
        const t = rayBox(o, d, {
          x: spot.x,
          y: spot.y + 1,
          z: spot.z,
          w: 1.4,
          h: 2.4,
          d: 1.4,
        });
        if (t < best && t < 22 && t < this.obstacleDistance(o, d) + 0.001) {
          best = t;
          chosen = spot;
        }
      }
      if (chosen) {
        const i = s.marks.indexOf(chosen.id);
        if (i >= 0) {
          s.marks.splice(i, 1);
          delete s.markData[chosen.id];
        }
        else {
          s.marks.push(chosen.id);
          s.markData[chosen.id] = {
            expiresAt: s.elapsed + C.markDuration,
            triggeredAt: null,
            inside: distance(chosen, s.players.killer) < C.markRadius,
            lastX: s.players.killer.x,
            lastZ: s.players.killer.z,
          };
          if (s.marks.length > 3) delete s.markData[s.marks.shift()];
        }
        this.event("mark", { placed: i < 0, spotId: chosen.id });
      }
    }
  }
  debugAction(action) {
    if (!this.debug) return;
    const s = this.state;
    if (action === "time") {
      s.dayTime = Math.min(C.dayDuration, s.dayTime + 45);
    }
    if (action === "sunset") {
      s.dayTime = C.dayDuration;
      this.phase(S.SUNSET);
    }
    if (action === "night") {
      s.dayTime = C.dayDuration;
      this.phase(S.NIGHT);
    }
    if (action === "ammo") s.ammo = C.detectiveAmmo;
    if (action === "day") {
      this.phase(S.DAY);
    }
  }
  canMove(x, z) {
    if (x < -23.45 || x > 23.45 || z < -19.45 || z > 23.5) return false;
    if (z > 19.4 && Math.abs(x) > 2.5) return false;
    for (const b of solids) {
      if (b.type === "floor") continue;
      if (
        Math.abs(x - b.x) < b.w / 2 + C.playerRadius &&
        Math.abs(z - b.z) < b.d / 2 + C.playerRadius
      )
        return false;
    }
    for (const [id, p] of statues.entries()) {
      if (this.state.destroyedStatues.includes(id)) continue;
      if (Math.hypot(x - p.x, z - p.z) < 0.55) return false;
    }
    return true;
  }
  move(p, dx, dz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    const other =
      this.state.players[p.role === "killer" ? "detective" : "killer"];
    const allowed = (x, z) =>
      this.canMove(x, z) &&
      !(this.state.phase === S.PREPARATION && z > 19.5) &&
      !(other.y < 0.4 && Math.hypot(x - other.x, z - other.z) < 0.51);
    for (let i = 0; i < steps; i++) {
      if (allowed(p.x + dx / steps, p.z)) p.x += dx / steps;
      if (allowed(p.x, p.z + dz / steps)) p.z += dz / steps;
    }
  }
  obstacleDistance(o, d) {
    return this.obstacleHit(o, d).distance;
  }
  obstacleHit(o, d) {
    let hit = { distance: Infinity };
    for (const b of solids) {
      const t = rayBox(o, d, b);
      if (t < hit.distance) hit = { distance: t, solidId: b.id };
    }
    statues.forEach((p, statueId) => {
      if (this.state.destroyedStatues.includes(statueId)) return;
      const t = this.bodyDistance(p, o, d);
      if (t < hit.distance) hit = { distance: t, statueId };
    });
    return hit;
  }
  breakStatue(id) {
    if (this.state.destroyedStatues.includes(id)) return;
    this.state.destroyedStatues.push(id);
    this.event("shatter", { statueId: id, x: statues[id].x, z: statues[id].z });
  }
  inspectionTarget() {
    if (this.state.phase !== S.DAY) return null;
    const p = this.state.players.detective;
    const o = { x: p.x, y: 1.65, z: p.z }, d = direction(p.yaw, p.pitch);
    const obstacle = this.obstacleHit(o, d), killer = this.hitPlayer("killer", o, d);
    if (killer < obstacle.distance && killer <= C.interactRange) return "killer";
    if (obstacle.statueId != null && obstacle.distance <= C.interactRange)
      return `statue:${obstacle.statueId}`;
    return null;
  }
  inspect(dt) {
    const p = this.state.players.detective, i = this.inputs.detective || {};
    const target = i.inspect && !i.forward && !i.strafe ? this.inspectionTarget() : null;
    if (target !== p.inspectTarget || !target) p.inspectProgress = 0;
    p.inspectTarget = target;
    if (!target) return;
    p.inspectProgress += dt;
    if (p.inspectProgress < C.inspectDuration) return;
    if (target === "killer") this.win("DETECTED");
    else {
      this.breakStatue(Number(target.split(":")[1]));
      this.event("inspected");
    }
    p.inspectTarget = null;
    p.inspectProgress = 0;
  }
  updateMarks() {
    const s = this.state, k = s.players.killer;
    for (const id of [...s.marks]) {
      const m = s.markData[id];
      if (s.phase !== S.DAY || s.elapsed >= m.expiresAt) {
        s.marks.splice(s.marks.indexOf(id), 1);
        delete s.markData[id];
        continue;
      }
      const inside = distance(spots[id], k) < C.markRadius;
      const moved = Math.hypot(k.x - m.lastX, k.z - m.lastZ) > 0.001;
      if (m.triggeredAt === null && ((inside && (k.moving || moved)) || inside !== m.inside)) {
        m.triggeredAt = s.elapsed;
        m.expiresAt = s.elapsed + 5;
        this.event("mark-alert", { spotId: id });
      }
      m.inside = inside;
      m.lastX = k.x;
      m.lastZ = k.z;
    }
  }
  bodyDistance(p, o, d) {
    const local = rotateY(
        { x: o.x - p.x, y: o.y - (p.y || 0), z: o.z - p.z },
        -p.yaw,
      ),
      dir = rotateY(d, -p.yaw);
    let closest = Infinity;
    for (const part of bodyParts(
      p.pose,
      p.moving ? Math.sin((p.step || 0) * 8) * 0.6 : 0,
      p.still && !p.holding ? Math.sin(this.state.elapsed * 2.1) * 0.009 : 0,
      p.role === "detective",
    )) {
      const ro = inversePart(local, part),
        rd = inversePart(dir, { ...part, x: 0, y: 0, z: 0 });
      closest = Math.min(
        closest,
        rayBox(ro, rd, { x: 0, y: 0, z: 0, w: part.w, h: part.h, d: part.d }),
      );
    }
    return closest;
  }
  hitPlayer(role, o, d) {
    return this.bodyDistance(this.state.players[role], o, d);
  }
  lineOfSight(a, b) {
    const len = Math.hypot(a.x - b.x, a.z - b.z);
    const o = { x: a.x, y: 1.55, z: a.z },
      d = { x: (b.x - a.x) / len, y: 0, z: (b.z - a.z) / len };
    return this.obstacleDistance(o, d) > len - 0.3;
  }
  tension() {
    const { detective: d, killer: k } = this.state.players,
      len = distance(d, k);
    if (len > 23 || !this.lineOfSight(d, k)) return 0;
    const f = direction(d.yaw, d.pitch),
      dot = ((k.x - d.x) * f.x + (k.z - d.z) * f.z) / Math.max(len, 0.01);
    return dot > 0.52 ? clamp((1 - len / 28) * (dot - 0.45) * 1.8, 0, 1) : 0.04;
  }
  tick(dt) {
    const s = this.state;
    dt = clamp(dt, 0, 0.1);
    if (s.phase === S.GAME_OVER) return;
    s.elapsed += dt;
    s.phaseTime += dt;
    if (s.phase === S.PREPARATION && s.phaseTime >= C.preparationDuration)
      this.phase(S.DAY);
    if (s.phase === S.DAY) {
      s.dayTime += dt;
      if (s.dayTime >= C.dayDuration) {
        s.dayTime = C.dayDuration;
        this.phase(S.SUNSET);
      }
    } else if (s.phase === S.SUNSET && s.phaseTime >= C.sunsetDuration)
      this.phase(S.NIGHT);
    else if (s.phase === S.NIGHT) {
      s.nightTime += dt;
      if (distance(s.players.detective, exit) < exit.radius)
        this.win("ESCAPED");
      else if (s.nightTime >= C.nightDuration) this.win("SURVIVED");
    }
    for (const role of ["detective", "killer"]) {
      const p = s.players[role],
        i = this.inputs[role] || {};
      p.moving = false;
      if (!p.still) {
        p.yaw = i.yaw ?? p.yaw;
        p.pitch = i.pitch ?? p.pitch;
      }
      const canAct =
        s.phase !== S.GAME_OVER &&
        s.phase !== S.SUNSET &&
        !(role === "detective" && s.phase === S.PREPARATION);
      if (canAct && !p.still) {
        let f = i.forward || 0,
          r = i.strafe || 0;
        const len = Math.hypot(f, r);
        if (len > 1) {
          f /= len;
          r /= len;
        }
        let speed =
          role === "detective"
            ? s.phase === S.NIGHT
              ? C.detectiveNightSpeed
              : C.detectiveSpeed
            : s.phase === S.NIGHT
              ? C.killerNightSpeed
              : i.sprint && p.sprint < 3
                ? C.killerSprint
                : C.killerSpeed;
        if (role === "killer") {
          p.sprint = clamp(
            p.sprint + (i.sprint && len ? dt : -dt * 1.25),
            0,
            4,
          );
        }
        const old = { x: p.x, z: p.z };
        this.move(
          p,
          (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * r) * speed * dt,
          (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * r) * speed * dt,
        );
        p.moving = distance(old, p) > 0.001;
        if (p.moving) {
          const prev = Math.floor(p.step / 0.47);
          p.step += dt * (speed / 2.65);
          if (Math.floor(p.step / 0.47) > prev)
            this.event("step", { role, x: p.x, z: p.z });
        }
      }
      if (role === "killer") {
        p.cooldown = Math.max(0, p.cooldown - dt);
        p.holding = !!(p.still && i.breath && p.breath > 0 && p.cooldown === 0);
        if (p.holding) {
          p.breath = Math.max(0, p.breath - dt);
          if (p.breath === 0) {
            p.cooldown = C.breathCooldown;
            p.holding = false;
            this.event("gasp", { x: p.x, z: p.z });
          }
        } else if (p.cooldown === 0)
          p.breath = Math.min(
            C.breathDuration,
            p.breath + (dt * C.breathDuration) / C.breathRecovery,
          );
      }
    }
    this.inspect(dt);
    this.updateMarks();
  }
}
