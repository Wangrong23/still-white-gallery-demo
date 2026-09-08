import { CONFIG as C, STATES as S } from "./config.js";
import { solids, movementSolids, spots, exit, statues } from "./world.js";
import { playerBodyParts, CLASSIC_POSES } from "./body.js";
import { updateBreath } from "./breath.js";
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
  idleTime: 0,
  spotId: null,
  pose: "stand",
  poseFrom: null,
  poseFromY: 0,
  poseMix: 1,
  stillTransition: null,
  stillExit: null,
  stillForward: 0,
  stillStrafe: 0,
  breath: C.breathDuration,
  holding: false,
  breathDelay: 0,
  breathNeedsRelease: false,
  breathPhase: 0,
  breathRate: 0,
  breathOffset: 0,
  cooldown: 0,
  moving: false,
  sprint: 0,
  flashlight: true,
  step: 0,
  moveBlend: 0,
  turnBlend: 0,
  inspectTarget: null,
  inspectProgress: 0,
  death: null,
});
export class Game {
  constructor({ debug = false } = {}) {
    this.debug = debug;
    this.reset();
  }
  reset() {
    this.state = {
      sculpturePose: CLASSIC_POSES[Math.floor(Math.random() * CLASSIC_POSES.length)],
      phase: S.PREPARATION,
      phaseTime: 0,
      dayTime: 0,
      nightTime: 0,
      elapsed: 0,
      ammo: C.detectiveAmmo,
      result: null,
      players: { detective: player("detective"), killer: player("killer") },
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
    if (this.state.phase === S.GAME_OVER) return;
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
    const p = this.state.players[role], i = this.inputs[role];
    if (role === "killer" && p.still) {
      if ([S.PREPARATION, S.DAY].includes(this.state.phase) && (i.forward || i.strafe)
        && (i.forward !== p.stillForward || i.strafe !== p.stillStrafe)) this.leaveStill();
      p.stillForward = i.forward;
      p.stillStrafe = i.strafe;
    }
  }
  nearestSpot() {
    const p = this.state.players.killer;
    return [...spots.map(s => s.y === .7 ? { ...s, pose: this.state.sculpturePose || CLASSIC_POSES[0] } : s), ...this.wallPoses()]
      .filter((s) => distance(s, p) <= s.range && this.canStandAt(p.x, p.z)
        && this.posePathClear(p, s, s)
        && distance(s, this.state.players.detective) >= 0.65)
      .sort((a, b) => distance(a, p) - distance(b, p))[0];
  }
  wallPoses() {
    const p = this.state.players.killer, candidates = [];
    // Sample the nearest point on each broad wall face; leave room at corners.
    for (const b of solids.filter(b => b.type === "wall" && b.h >= 2)) {
      for (const sign of [-1, 1]) {
        const alongX = b.w >= b.d;
        const half = (alongX ? b.w : b.d) / 2;
        if (half < .4) continue;
        const along = clamp(alongX ? p.x : p.z,
          (alongX ? b.x : b.z) - half + .35, (alongX ? b.x : b.z) + half - .35);
        const nx = alongX ? 0 : sign, nz = alongX ? sign : 0;
        const target = { id: `wall:${b.id}:${sign}`, pose: "wall", range: 1.05, y: 0,
          x: alongX ? along : b.x + sign * (b.w / 2 + C.playerRadius + .08),
          z: alongX ? b.z + sign * (b.d / 2 + C.playerRadius + .08) : along,
          yaw: Math.atan2(-nx, -nz) };
        if (distance(p, target) <= target.range && this.canStandAt(target.x, target.z)) candidates.push(target);
      }
    }
    return candidates;
  }
  canStandAt(x, z) {
    return this.canMove(x, z)
      && !(this.state.phase === S.PREPARATION && z > 19.5)
      && distance({ x, z }, this.state.players.detective) >= 0.51;
  }
  posePathClear(from, to, spot) {
    const len = distance(from, to);
    const d = { x: (to.x - from.x) / (len || 1), y: 0, z: (to.z - from.z) / (len || 1) };
    const o = { x: from.x, y: 0, z: from.z };
    for (const b of movementSolids) {
      if (b.type === "floor") continue;
      const support = spot && ["bench", "plinth"].includes(b.type)
        && Math.abs(b.y + b.h / 2 - spot.y) < .05
        && Math.abs(b.x - spot.x) <= b.w / 2 && Math.abs(b.z - spot.z) <= b.d / 2;
      if (support) continue;
      if (rayBox(o, d, { ...b, y: 0, h: 100,
        w: b.w + C.playerRadius * 2, d: b.d + C.playerRadius * 2 }) <= len) return false;
    }
    for (const [id, statue] of statues.entries()) {
      if (this.state.destroyedStatues.includes(id)) continue;
      const t = clamp((statue.x - from.x) * d.x + (statue.z - from.z) * d.z, 0, len);
      if (distance(statue, { x: from.x + d.x * t, z: from.z + d.z * t }) < .55) return false;
    }
    return true;
  }
  leaveStill() {
    const p = this.state.players.killer;
    if (!p.still) return;
    const previousPose = p.pose, previousY = p.y, interrupted = !!p.stillTransition;
    const spot = spots[p.spotId];
    if (spot || !this.canStandAt(p.x, p.z)) {
      const candidates = p.stillExit ? [p.stillExit] : [];
      for (let r = .4; r <= 2.4; r += .2)
        for (let i = 0; i < 16; i++)
          candidates.push({ x: p.x + Math.sin(i * Math.PI / 8) * r,
            z: p.z + Math.cos(i * Math.PI / 8) * r });
      const target = candidates.find((c) => this.canStandAt(c.x, c.z) && this.posePathClear(p, c, spot));
      if (!target) return false;
      p.x = target.x;
      p.z = target.z;
    }
    p.still = false;
    p.idleTime = 0;
    p.pose = "stand";
    p.poseFrom = interrupted ? null : previousPose;
    p.poseFromY = interrupted ? 0 : previousY;
    p.poseMix = interrupted ? 1 : 0;
    p.stillTransition = null;
    p.stillExit = null;
    if (p.holding) p.breathDelay = C.breathRecoveryDelay;
    p.holding = false;
    p.y = 0;
    p.spotId = null;
    this.event("unstill", { x: p.x, z: p.z });
    return true;
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
      ["still", "pose", "unstill"].includes(action) &&
      role === "killer" &&
      [S.PREPARATION, S.DAY].includes(s.phase)
    ) {
      if (["still", "unstill"].includes(action) && p.still) this.leaveStill();
      else if (action === "still" && this.canStandAt(p.x, p.z)) {
        Object.assign(p, { still: true, spotId: null, pose: "stand", moving: false,
          poseFrom: null, poseFromY: 0, poseMix: 1,
          stillForward: this.inputs.killer?.forward || 0, stillStrafe: this.inputs.killer?.strafe || 0 });
        this.event("still", { spotId: null });
      } else if (action === "pose" && (!p.still || p.spotId === null)) {
        const spot = this.nearestSpot();
        if (spot) {
          Object.assign(p, {
            stillExit: { x: p.x, z: p.z },
            stillTransition: { from: { x: p.x, y: p.y, z: p.z, yaw: p.yaw }, to: spot, time: 0 },
            poseFrom: p.pose,
            poseFromY: 0,
            poseMix: 0,
            still: true,
            spotId: spot.id,
            pose: spot.pose,
            moving: false,
            stillForward: this.inputs.killer?.forward || 0,
            stillStrafe: this.inputs.killer?.strafe || 0,
          });
          if (spot.y === .7) {
            const choices = CLASSIC_POSES.filter(pose => pose !== spot.pose);
            this.state.sculpturePose = choices[Math.floor(Math.random() * choices.length)];
          }
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
      if (detected) {
        this.kill("killer", "shot", {
          x: o.x + d.x * travel, y: o.y + d.y * travel, z: o.z + d.z * travel,
        }, d);
        this.win("DETECTED");
      }
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
      ) {
        this.kill("detective", "attack", { x: d.x, y: 1.25, z: d.z }, dir);
        this.win("FOUND YOU");
      } else this.event("swipe");
    }
    if (action === "flashlight" && role === "detective" && s.phase === S.NIGHT)
      p.flashlight = !p.flashlight;
  }

  kill(role, cause, point, direction) {
    const p = this.state.players[role];
    if (p.death) return;
    // Keep the impact and original pose in snapshots, including reconnects.
    p.death = { cause, point, direction, parts: playerBodyParts(p) };
    p.moving = false;
    p.holding = false;
    p.stillTransition = null;
    p.inspectTarget = null;
    p.inspectProgress = 0;
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
    for (const b of movementSolids) {
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
    // A motionless decoy takes as long as a killer holding their breath, so
    // inspection speed alone cannot identify a perfectly still figure.
    const duration = target === "killer" && !this.state.players.killer.holding
      ? C.inspectDuration : C.inspectConcealedDuration;
    p.inspectProgress += dt * C.inspectDuration / duration;
    if (p.inspectProgress < C.inspectDuration) return;
    if (target === "killer") this.win("DETECTED");
    else {
      this.breakStatue(Number(target.split(":")[1]));
      this.event("inspected");
    }
    p.inspectTarget = null;
    p.inspectProgress = 0;
  }
  bodyDistance(p, o, d) {
    const local = rotateY(
        { x: o.x - p.x, y: o.y - (p.y || 0), z: o.z - p.z },
        -p.yaw,
      ),
      dir = rotateY(d, -p.yaw);
    let closest = Infinity;
    for (const part of playerBodyParts(p)) {
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
      else if (distance(s.players.killer, exit) < exit.radius) this.win("KILLER ESCAPED");
      else if (s.nightTime >= C.nightDuration) this.win("SURVIVED");
    }
    for (const role of ["detective", "killer"]) {
      const p = s.players[role],
        i = this.inputs[role] || {};
      if (role === "killer" && p.still) {
        const f = i.forward || 0, r = i.strafe || 0;
        if ([S.PREPARATION, S.DAY].includes(s.phase) && (f || r)
          && (f !== p.stillForward || r !== p.stillStrafe)) this.leaveStill();
        p.stillForward = f;
        p.stillStrafe = r;
      }
      if (p.stillTransition) {
        const tr = p.stillTransition;
        tr.time = Math.min(C.poseDuration, tr.time + dt);
        const t = tr.time / C.poseDuration;
        p.poseMix = t * t * (3 - 2 * t);
        const next = {};
        for (const key of ["x", "y", "z"]) next[key] = tr.from[key] + (tr.to[key] - tr.from[key]) * p.poseMix;
        if (distance(next, s.players.detective) < .51) this.leaveStill();
        else {
          Object.assign(p, next);
          const angle = Math.atan2(Math.sin(tr.to.yaw - tr.from.yaw), Math.cos(tr.to.yaw - tr.from.yaw));
          p.yaw = tr.from.yaw + angle * p.poseMix;
          if (t === 1) p.stillTransition = null;
        }
      }
      p.moving = false;
      if (!p.still && p.poseFrom && p.poseMix < 1) {
        p.poseMix = Math.min(1, p.poseMix + dt / .22);
        if (p.poseMix === 1) { p.poseFrom = null; p.poseFromY = 0; }
      }
      const previousYaw = p.yaw;
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
          p.step += distance(old, p) / 2.65;
          if (Math.floor(p.step / 0.47) > prev)
            this.event("step", { role, x: p.x, z: p.z });
        }
      }
      const blendRate = 1 - Math.exp(-dt * 12);
      p.moveBlend = p.still ? 0 : (p.moveBlend || 0) + ((p.moving ? 1 : 0) - (p.moveBlend || 0)) * blendRate;
      const turn = Math.atan2(Math.sin(p.yaw - previousYaw), Math.cos(p.yaw - previousYaw));
      const turnTarget = clamp(turn / Math.max(.001, dt * 5), -1, 1);
      p.turnBlend = p.still ? 0 : (p.turnBlend || 0) + (turnTarget - (p.turnBlend || 0)) * blendRate;
      if (role === "killer") {
        if (!p.still && [S.PREPARATION, S.DAY].includes(s.phase)) {
          p.idleTime = (i.forward || i.strafe) ? 0 : (p.idleTime || 0) + dt;
          if (p.idleTime >= C.autoStillDelay && !p.poseFrom && this.canStandAt(p.x, p.z))
            this.action("killer", "still");
        }
        if (updateBreath(p, !!i.breath, dt, [S.PREPARATION, S.DAY].includes(s.phase)))
          this.event("gasp", { x: p.x, y: p.y + playerBodyParts(p).find(part => part.name === "head").y, z: p.z });
      }
    }
    this.inspect(dt);
  }
}
