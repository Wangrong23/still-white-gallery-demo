// Shared articulated pose: render meshes and authoritative hit boxes use the
// same shoulder/elbow and hip/knee chains, including intermediate poses.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const CLASSIC_POSES = Object.freeze(['david', 'discobolus', 'liberty', 'thinker', 'victory', 'venus']);
function stance(pose) {
  const s = { hip: .88, torso: 1.22, head: 1.63, arm: .05, elbow: .12,
    forward: 0, ankleY: .1, ankleZ: 0, asymmetry: 0, leftX: 0, rightX: 0, leftZ: 0, rightZ: 0,
    leftForeX: 0, rightForeX: 0, leftForeZ: 0, rightForeZ: 0, chestZ: 0, headZ: 0, lean: 0, headLean: 0, shift: 0, stagger: 0, chestX: 0, headX: 0, roll: 0 };
  if (pose === 'sit') Object.assign(s, { hip: .06, torso: .40, head: .81,
    forward: .45, elbow: .55, ankleY: -.58, ankleZ: -.36 });
  if (pose === 'crouch' || pose === 'curl') Object.assign(s,
    { hip: .35, torso: .63, head: 1.02, ankleZ: .06, forward: .55, elbow: .7 });
  if (pose === 'curl') Object.assign(s, { forward: 1.05, elbow: .8 });
  if (pose === 'arms') Object.assign(s, { arm: 1.35, elbow: .04 });
  if (pose === 'contrapposto') Object.assign(s, { arm: .45, asymmetry: .18 });
  if (pose === 'david') Object.assign(s, { shift: .055, stagger: .09, ankleZ: -.09,
    leftX: .12, leftZ: -.28, leftForeX: 2.48, leftForeZ: .44, headLean: -.08 });
  if (pose === 'liberty') Object.assign(s, { stagger: .06,
    rightZ: 2.65, rightForeZ: .18, leftX: .18, leftForeX: 1.35, leftForeZ: .3 });
  if (pose === 'discobolus') Object.assign(s, { hip: .71, torso: 1.04, head: 1.39,
    chestZ: -.17, headZ: -.34, chestX: -.10, headX: -.23, roll: .35, lean: -.58, headLean: .18, stagger: .16,
    leftX: .5, leftZ: .55, leftForeX: .12, leftForeZ: .30,
    rightX: .30, rightZ: 1.80, rightForeX: -.12, rightForeZ: -.10 });
  if (pose === 'thinker') Object.assign(s, { hip: .42, torso: .70, head: 1.04,
    ankleZ: -.28, chestZ: -.14, headZ: -.31, lean: -.35, headLean: -.18,
    rightX: .65, rightZ: -.60, rightForeX: 1.95, rightForeZ: .58,
    leftX: .55, leftZ: -.16, leftForeX: .35, leftForeZ: .35 });
  if (pose === 'victory') Object.assign(s, { stagger: .13, chestZ: -.06, headZ: -.12,
    lean: -.16, headLean: -.12, leftX: -.3, rightX: -.3,
    leftZ: -1.22, rightZ: 1.22, leftForeZ: -.15, rightForeZ: .15 });
  if (pose === 'venus') Object.assign(s, { shift: -.065, stagger: .08, ankleZ: .08,
    roll: -.12, headX: .04, headLean: .08, leftX: -.40, rightX: -.40,
    leftZ: .20, rightZ: -.20, leftForeX: -2.10, rightForeX: -2.10 });
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
  const settle = detective && !options.relaxedArms ? 1 - blend : 0;
  if (detective) { s.lean += .04 * settle; s.roll -= .065 * settle; s.chestZ += .012 * settle; }
  const phase = options.phase ?? Math.asin(clamp(motion / .6, -1, 1));
  const weight = detective && !options.relaxedArms ? .065 * (1 - blend) : 0;
  const sway = s.shift + weight + Math.sin(phase) * .012 * blend + (options.turn || 0) * .025;
  const drop = .06 * blend + .012 * settle;
  const hip = s.hip - drop, torso = s.torso - drop, head = s.head - drop;
  const parts = [
    { name: 'torso', x: sway + s.chestX, y: torso + breath, z: s.chestZ, w: detective ? .62 : .44, h: .61, d: detective ? .34 : .27, ...(s.lean ? { rx: s.lean } : {}), ...(s.roll ? { rz: s.roll } : {}) },
    { name: 'head', x: sway + s.headX, y: head + breath, z: s.headZ, ...(s.headLean ? { rx: s.headLean } : {}), w: detective ? .36 : .3, h: detective ? .4 : .37, d: detective ? .38 : .3, round: true },
    { name: 'hips', x: 0, y: hip, z: 0, w: .36, h: .24, d: .26 },
  ];
  let gunHand = null;
  for (const side of [-1, 1]) {
    const swing = Math.sin(phase) * blend;
    const shoulder = { x: sway + s.chestX + side * (detective ? .255 : .18) - .18 * Math.sin(s.roll), y: torso + .18 * Math.cos(s.lean) + side * .18 * Math.sin(s.roll) + breath, z: s.chestZ + .18 * Math.sin(s.lean) };
    const holdingGun = detective && side === 1 && !options.relaxedArms;
    const armX = holdingGun ? -.12 + swing * .07 : s.forward + swing * side * .42 + (side < 0 ? s.leftX : s.rightX);
    const armZ = holdingGun ? -.12 : side * (s.arm + s.asymmetry * side) + (side < 0 ? s.leftZ : s.rightZ);
    const elbow = limb(parts, 'arm', shoulder, .32, detective ? .21 : .18, detective ? .22 : .18, armX, armZ);
    const hand = limb(parts, 'arm', elbow, .34, detective ? .18 : .16, detective ? .19 : .16,
      armX + (holdingGun ? 1.48 : s.elbow + (side < 0 ? s.leftForeX : s.rightForeX)),
      armZ + (detective ? 0 : side < 0 ? s.leftForeZ : s.rightForeZ));
    if (detective && side === 1) gunHand = hand;
    // Two-bone leg solve keeps knees attached and feet on the pose's floor.
    const legPhase = phase + (side < 0 ? Math.PI : 0);
    const ankleY = s.ankleY + Math.max(0, -Math.sin(legPhase)) * .10 * blend;
    const ankleZ = s.ankleZ + side * s.stagger - Math.cos(legPhase) * .30 * blend
      + (detective ? (side < 0 ? -.16 : 0) * (1 - blend) : 0);
    const dy = hip - ankleY, dz = ankleZ;
    const reach = clamp(Math.hypot(dy, dz), .001, .7999);
    const aim = Math.atan2(-dz, dy);
    const bend = Math.acos(clamp(reach / .8, -1, 1));
    const knee = limb(parts, 'leg', { x: side * .105, y: hip, z: 0 }, .4, detective ? .16 : .19, .18, aim + bend);
    const ankle = limb(parts, 'leg', knee, .4, detective ? .14 : .16, .16, aim - bend);
    parts.push({ name: 'foot', x: ankle.x, y: ankle.y - .04, z: ankle.z - .055, w: detective ? .23 : .17, h: .12, d: detective ? .36 : .28 });
  }
  if (detective) {
    parts.push({ name: 'coat', x: sway * .7, y: .91 - drop, z: 0, w: .68, h: 1.2, d: .50, rx: .04 * settle, rz: -.065 * settle });
    parts.push({ name: 'hat', x: sway, y: 1.79 - drop, z: 0, w: .7, h: .10, d: .57 });
    parts.push({ name: 'hat', x: sway, y: 1.91 - drop, z: 0, w: .41, h: .24, d: .38 });
    parts.push({ name: 'gun', x: gunHand.x, y: gunHand.y + .024, z: gunHand.z - .1643,
      w: .11, h: .2, d: .43 });
    // Head, fedora and attached cigarette rotate together about the neck.
    const attitude = options.relaxedArms ? 0 : 1 - .25 * blend;
    const nod = -7 * Math.PI / 180 * attitude, glance = -10 * Math.PI / 180 * attitude;
    const neckY = head + breath - .18;
    for (const part of parts.filter(p => p.name === 'head' || p.name === 'hat')) {
      const offset = part.y - neckY;
      part.y = neckY + offset * Math.cos(nod);
      part.z += offset * Math.sin(nod);
      part.rx = nod; part.ry = glance;
    }
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
  return bodyParts(p.pose, 0, p.breathOffset || 0, p.role === 'detective', {
    blend: p.still ? 0 : (p.moveBlend ?? (p.moving ? 1 : 0)),
    phase: (p.step || 0) * Math.PI / .47,
    turn: p.still ? 0 : p.turnBlend || 0,
    poseFrom: p.poseFrom, poseMix: p.poseMix, poseFromY: p.poseFromY,
  });
}
