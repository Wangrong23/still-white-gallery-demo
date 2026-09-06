import { solids } from "../shared/world.js";
import { rayBox } from "../shared/math.js";

export function spatialAcoustics(source, listener, {
  range = 18, height = .15, wallGain = .22, clearFrequency = 4200, blockedFrequency = 700,
} = {}) {
  const origin = { x: source.x, y: source.y ?? height, z: source.z };
  const delta = { x: listener.x - origin.x,
    y: (listener.y || 0) + 1.55 - origin.y, z: listener.z - origin.z };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const gain = Math.max(0, 1 - length / range);
  const horizontal = Math.hypot(delta.x, delta.z);
  const pan = horizontal < .15 ? 0 : Math.max(-1, Math.min(1,
    (-delta.x * Math.cos(listener.yaw || 0) + delta.z * Math.sin(listener.yaw || 0)) / horizontal));
  if (!gain || length < 0.15) return { gain, pan, frequency: clearFrequency, blocked: false };
  const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
  const blocked = solids.some((b) => ["wall", "column"].includes(b.type)
    && rayBox(origin, direction, b) < length);
  return { gain: gain * (blocked ? wallGain : 1), pan,
    frequency: blocked ? blockedFrequency : clearFrequency, blocked };
}

export function gaspAcoustics(source, listener) {
  return spatialAcoustics(source, listener, {
    range: 8, height: 1.63, wallGain: .12, clearFrequency: 1500, blockedFrequency: 600,
  });
}
