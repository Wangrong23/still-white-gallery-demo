import { CONFIG as C } from "./config.js";

// Runs on the authority; the same offset drives the mesh and its hit geometry.
export function updateBreath(p, pressed, dt, allowed) {
  const wasHolding = p.holding;
  const blocked = Math.max(p.cooldown, p.breathDelay);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.breathDelay = Math.max(0, p.breathDelay - dt);
  if (!pressed) p.breathNeedsRelease = false;
  const wantsHold = allowed && p.still && pressed && !p.breathNeedsRelease;
  const ready = p.cooldown === 0 && p.breath >= C.breathRestart;
  p.holding = !!(wantsHold && (wasHolding ? p.breath > 0 : ready));
  // An early press must be released, rather than automatically retrying later.
  if (wantsHold && !p.holding) p.breathNeedsRelease = true;
  if (wasHolding && !p.holding) p.breathDelay = C.breathRecoveryDelay;
  let exhausted = false;
  if (p.holding) {
    p.breath = Math.max(0, p.breath - dt);
    if (p.breath < 1e-8) {
      p.breath = 0;
      p.holding = false;
      p.breathNeedsRelease = true;
      p.cooldown = C.breathCooldown;
      p.breathDelay = C.breathRecoveryDelay;
      exhausted = true;
    }
  } else {
    const recoveryDt = wasHolding ? 0 : Math.max(0, dt - blocked);
    p.breath = Math.min(C.breathDuration,
      p.breath + recoveryDt * C.breathDuration / C.breathRecovery);
  }
  // Ease breathing speed to zero at the current pose; never snap to neutral.
  const targetRate = p.still && !p.holding ? 1 : 0;
  const decay = Math.exp(-dt / C.breathTransition);
  const phaseStep = targetRate * dt + (p.breathRate - targetRate)
    * C.breathTransition * (1 - decay);
  p.breathPhase += phaseStep * 2.1;
  p.breathRate = targetRate + (p.breathRate - targetRate) * decay;
  p.breathOffset = p.still ? Math.sin(p.breathPhase) * 0.009 : 0;
  return exhausted;
}
