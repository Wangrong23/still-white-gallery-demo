import { CONFIG } from "./config.js";
import { clamp } from "./math.js";
export function sunAt(dayTime) {
  const progress = clamp(dayTime / CONFIG.dayDuration, 0, 1);
  const elevation = ((60 - 53 * progress) * Math.PI) / 180;
  const azimuth = ((-58 + 108 * progress) * Math.PI) / 180;
  return {
    progress,
    elevation,
    azimuth,
    x: Math.sin(azimuth) * Math.cos(elevation) * 65,
    y: Math.sin(elevation) * 65,
    z: -Math.cos(azimuth) * Math.cos(elevation) * 65,
  };
}
