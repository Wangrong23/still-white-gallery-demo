// Shared articulated pose: render meshes and authoritative hit boxes use the
// same shoulder/elbow and hip/knee chains, including intermediate poses.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function stance(pose) {
  const s = { hip: .88, torso: 1.22, head: 1.63, arm: .05, elbow: .12,
    forward: 0, ankleY: .1, ankleZ: 0, asymmetry: 0 };
  if (pose === 'sit') Object.assign(s, { hip: .06, torso: .40, head: .81,
    forward: .45, elbow: .55, ankleY: -.58, ankleZ: -.36 });
  if (pose === 'crouch' || pose === 'curl') Object.assign(s,
    { hip: .35, torso: .63, head: 1.02, ankleZ: .06, forward: .55, elbow: .7 });
  if (pose === 'curl') Object.assign(s, { forward: 1.05, elbow: .8 });
  if (pose === 'arms') Object.assign(s, { arm: 1.35, elbow: .04 });
  if (pose === 'contrapposto') Object.assign(s, { arm: .45, asymmetry: .18 });
  return s;
}
function limb(parts, name, start, length, width, depth, rx, rz = 0) {
  const end = { x: start.x + Math.sin(rz) * length,
    y: start.y - Math.cos(rz) * Math.cos(rx) * length,
    z: start.z - Math.cos(rz) * Math.sin(rx) * length };
  parts.push({ name, x: (start.x + end.x)/2, y: (start.y + end.y)/2,
    z: (start.z + end.z)/2, w: width, h: length, d: depth, rx, rz });
  return end;
}
export function bodyParts(pose = 'stand', motion = 0, breath = 0, detective = false, options = {}) {
  const s = stance(pose);
  if (options.poseFrom && options.poseMix < 1) {
    const from = stance(options.poseFrom), t = clamp(options.poseMix, 0, 1);
    for (const key of ['hip', 'torso', 'head', 'ankleY']) from[key] += options.poseFromY || 0;
    for (const key of Object.keys(s)) s[key] = from[key] + (s[key] - from[key]) * t;
  }
  const blend = options.blend ?? (motion ? 1 : 0);
  const phase = options.phase ?? Math.asin(clamp(motion / .6, -1, 1));
  const weight = detective && !options.relaxedArms ? .035 * (1 - blend) : 0;
  const sway = weight + Math.sin(phase) * .012 * blend + (options.turn || 0) * .025;
  const drop = .06 * blend;
  const hip = s.hip - drop, torso = s.torso - drop, head = s.head - drop;
  const parts = [
    { name: 'torso', x: sway, y: torso + breath, z: 0, w: detective ? .62 : .4, h: .61, d: detective ? .34 : .25 },
    { name: 'head', x: sway, y: head + breath, z: 0, w: detective ? .36 : .3, h: detective ? .4 : .37, d: detective ? .38 : .3, round: true },
    { name: 'hips', x: 0, y: hip, z: 0, w: .36, h: .24, d: .26 },
  ];
  let gunHand = null;
  for (const side of [-1, 1]) {
    const swing = Math.sin(phase) * blend;
    const shoulder = { x: sway + side * (detective ? .255 : .18), y: torso + .18 + breath, z: 0 };
    const holdingGun = detective && side === 1 && !options.relaxedArms;
    const armX = holdingGun ? -.12 + swing * .07 : s.forward + swing * side * .42;
    const armZ = holdingGun ? -.12 : side * (s.arm + s.asymmetry * side);
    const elbow = limb(parts, 'arm', shoulder, .32, detective ? .21 : .145, detective ? .22 : .15, armX, armZ);
    const hand = limb(parts, 'arm', elbow, .34, detective ? .18 : .13, detective ? .19 : .14,
      armX + (holdingGun ? 1.48 : s.elbow), armZ);
    if (detective && side === 1) gunHand = hand;
    // Two-bone leg solve keeps knees attached and feet on the pose's floor.
    const legPhase = phase + (side < 0 ? Math.PI : 0);
    const ankleY = s.ankleY + Math.max(0, -Math.sin(legPhase)) * .10 * blend;
    const ankleZ = s.ankleZ - Math.cos(legPhase) * .30 * blend
      + (detective ? side * .055 * (1 - blend) : 0);
    const dy = hip - ankleY, dz = ankleZ;
    const reach = clamp(Math.hypot(dy, dz), .001, .7999);
    const aim = Math.atan2(-dz, dy);
    const bend = Math.acos(clamp(reach / .8, -1, 1));
    const knee = limb(parts, 'leg', { x: side * .105, y: hip, z: 0 }, .4, .16, .18, aim + bend);
    const ankle = limb(parts, 'leg', knee, .4, .14, .16, aim - bend);
    parts.push({ name: 'foot', x: ankle.x, y: ankle.y - .04, z: ankle.z - .055, w: detective ? .23 : .17, h: .12, d: detective ? .36 : .28 });
  }
  if (detective) {
    parts.push({ name: 'coat', x: sway * .5, y: .91 - drop, z: 0, w: .68, h: 1.2, d: .4 });
    parts.push({ name: 'hat', x: sway, y: 1.79 - drop, z: 0, w: .7, h: .10, d: .57 });
    parts.push({ name: 'hat', x: sway, y: 1.91 - drop, z: 0, w: .41, h: .24, d: .38 });
    parts.push({ name: 'gun', x: gunHand.x, y: gunHand.y + .024, z: gunHand.z - .1643,
      w: .11, h: .2, d: .43 });
  }
  if (pose === 'wall' || options.poseFrom === 'wall') {
    const t = options.poseFrom && options.poseMix < 1 ? options.poseMix : 1;
    const mix = (options.poseFrom === 'wall' ? 1 - t : 0) + (pose === 'wall' ? t : 0);
    for (const part of parts) {
      // Wall anchors sit .36m out for safe locomotion. Bring the body back
      // so the head's rear bound leaves only 1cm, rather than a visible gap.
      part.z = part.z * (1 - .3 * mix) + .245 * mix;
      part.d *= 1 - .3 * mix;
    }
  }
  return parts;
}
export function playerBodyParts(p) {
  return bodyParts(p.pose, 0, p.still ? p.breathOffset || 0 : 0, p.role === 'detective', {
    blend: p.still ? 0 : (p.moveBlend ?? (p.moving ? 1 : 0)),
    phase: (p.step || 0) * Math.PI / .47,
    turn: p.still ? 0 : p.turnBlend || 0,
    poseFrom: p.poseFrom, poseMix: p.poseMix, poseFromY: p.poseFromY,
  });
}
