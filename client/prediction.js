import { Game } from '../shared/game.js';

// Local presentation only. Shooting, damage, inspection and audio stay authoritative.
export class MovementPrediction {
  constructor() { this.sequence = 0; this.reset(); }
  reset() { this.pending = []; this.sim = null; this.role = null; this.latest = null; }
  reconcile(state, role) {
    if (!this.latest || this.role !== role || state.elapsed < this.latest.elapsed
      || state.phase !== this.latest.phase) this.pending = [];
    this.sequence = Math.max(this.sequence, state.players[role].inputAck || 0);
    this.pending = this.pending.filter(c => c.seq > (state.players[role].inputAck || 0));
    this.latest = { elapsed: state.elapsed, phase: state.phase }; this.role = role;
    this.sim = new Game();
    this.sim.state = structuredClone(state);
    for (const command of this.pending) this.replay(command);
  }
  replay(command) {
    this.sim.input(this.role, command.input);
    this.sim.tick(command.dt);
  }
  advance(input, dt = 1/30) {
    const command = { seq: ++this.sequence, input: { ...input }, dt };
    // Stop speculative travel after half a second without acknowledgement.
    if (this.sim && this.pending.length < 15) {
      this.pending.push(command);
      this.replay(command);
    }
    return command.seq;
  }
  sample(rendered, input, remainder = 0) {
    if (!this.sim || this.sim.state.phase !== rendered.phase) return rendered;
    let source = this.sim;
    if (input && remainder > 0 && this.pending.length < 15) {
      source = new Game(); source.state = structuredClone(this.sim.state);
      source.input(this.role, input); source.tick(Math.min(remainder, 1/30));
    }
    const predicted = source.state.players[this.role];
    const authoritative = rendered.players[this.role];
    // Only movement and its pose are predicted; HUD and interactions read state.
    const own = { ...authoritative };
    for (const key of ['x','y','z','yaw','pitch','step','moving','moveBlend','turnBlend',
      'still','pose','poseFrom','poseFromY','poseMix','spotId']) own[key] = predicted[key];
    return { ...rendered, players: { ...rendered.players, [this.role]: own } };
  }
}
