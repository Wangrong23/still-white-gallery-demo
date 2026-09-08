import { CONFIG as C } from '../shared/config.js';
import { lateDayAt, sunAt } from '../shared/sun.js';
const clamp = (v) => Math.max(0, Math.min(1, v));
export const smooth = (a, b, dt, seconds) => a + (b - a) * (1 - Math.exp(-dt / seconds));

// Information boundary: only own input/state, public clocks and AUDIBLE events.
// Never pass targets, remote players, death objects, or game.tension() here.
export class AudioModel {
  constructor() { this.reset(); }
  reset() { this.suspicion = 0; this.observation = 0; this.aimTime = 0; this.heard = 0; }
  hear(amount) { this.heard = Math.max(this.heard, clamp(amount)); }
  update({ phase, dayTime, nightTime, role, inspecting, aiming, moving, holding, breath }, dt) {
    this.heard *= Math.exp(-dt / 3);
    this.observation = moving ? 0 : Math.min(20, this.observation + dt);
    this.aimTime = aiming ? Math.min(8, this.aimTime + dt) : 0;
    const target = phase === 'DAY' && role === 'detective'
      ? clamp((inspecting ? .66 : 0) + .16 * this.aimTime / 8
        + .12 * clamp((this.observation - 5) / 15) + this.heard * .3) : 0;
    this.suspicion = smooth(this.suspicion, target, dt, target > this.suspicion ? .8 : 3.5);
    const danger = role === 'killer' && holding ? clamp(1 - breath / C.breathDuration) : 0;
    const remaining = C.nightDuration - nightTime;
    return this.value = { phase, dayProgress: sunAt(dayTime).progress, late: lateDayAt(dayTime),
      suspicion: this.suspicion, breathDanger: danger, inspecting: !!inspecting,
      holding: role === 'killer' && holding, moving,
      nightIntensity: phase === 'NIGHT' ? clamp(.25 + .3 * nightTime / C.nightDuration + .4 * this.heard) : 0,
      // Fixed tempo; each component leaves separately, with no end-game acceleration.
      percussion: clamp((remaining - 7) / 3), bass: clamp((remaining - 3) / 4),
      drone: clamp((remaining - 3) / 2), role };
  }
}
