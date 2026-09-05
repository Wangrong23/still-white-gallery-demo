// Render between snapshots; authoritative gameplay state is never modified.
export class SnapshotBuffer {
  constructor(delay = 100) {
    this.delay = delay;
    this.frames = [];
  }
  reset() { this.frames = []; }
  push(state, now) {
    if (this.frames.length && state.elapsed < this.frames.at(-1).state.elapsed)
      this.reset();
    this.frames.push({ state, now });
    if (this.frames.length > 20) this.frames.shift();
  }
  sample(latest, now) {
    const time = now - this.delay;
    while (this.frames.length > 2 && this.frames[1].now <= time)
      this.frames.shift();
    const [a, b] = this.frames;
    if (!a || !b || a.state.phase !== latest.phase) return latest;
    const alpha = Math.max(0, Math.min(1, (time - a.now) / Math.max(1, b.now - a.now)));
    const players = {};
    for (const role of ["detective", "killer"]) {
      const p = a.state.players[role], q = b.state.players[role];
      if (p.still !== q.still || p.pose !== q.pose || Math.hypot(p.x - q.x, p.z - q.z) > 3) {
        players[role] = { ...q };
        continue;
      }
      const out = { ...q };
      for (const key of ["x", "y", "z", "pitch", "step", "breathOffset"])
        out[key] = p[key] + (q[key] - p[key]) * alpha;
      const angle = Math.atan2(Math.sin(q.yaw - p.yaw), Math.cos(q.yaw - p.yaw));
      out.yaw = p.yaw + angle * alpha;
      players[role] = out;
    }
    return { ...latest, players };
  }
}
