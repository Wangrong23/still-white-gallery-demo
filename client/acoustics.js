import { solids } from "../shared/world.js";
import { rayBox } from "../shared/math.js";

export function gaspAcoustics(source, listener) {
  const origin = { x: source.x, y: source.y ?? 1.63, z: source.z };
  const delta = { x: listener.x - origin.x,
    y: (listener.y || 0) + 1.55 - origin.y, z: listener.z - origin.z };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const gain = Math.max(0, 1 - length / 8);
  if (!gain || length < 0.15) return { gain, frequency: 1500 };
  const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
  const blocked = solids.some((b) => b.type === "wall"
    && rayBox(origin, direction, b) < length);
  return { gain: gain * (blocked ? 0.12 : 1), frequency: blocked ? 600 : 1500 };
}
