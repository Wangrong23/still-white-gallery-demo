// Pose geometry is shared with exact oriented-box hit detection.
export function bodyParts(
  pose = "stand",
  motion = 0,
  breath = 0,
  detective = false,
) {
  let hip = 0.88,
    head = 1.63,
    torso = 1.22,
    armAngle = 0.05,
    legAngle = 0;
  if (pose === "sit") {
    hip = 0.18;
    torso = 0.53;
    head = 0.94;
  }
  if (pose === "crouch" || pose === "curl") {
    hip = 0.35;
    torso = 0.63;
    head = 1.02;
  }
  if (pose === "arms") armAngle = 1.35;
  if (pose === "contrapposto") armAngle = 0.55;
  const parts = [
    {
      name: "torso",
      x: 0,
      y: torso + breath,
      z: 0,
      w: detective ? 0.58 : 0.4,
      h: 0.61,
      d: 0.25,
    },
    {
      name: "head",
      x: 0,
      y: head + breath,
      z: 0,
      w: 0.3,
      h: 0.37,
      d: 0.3,
      round: true,
    },
    { name: "hips", x: 0, y: hip, z: 0, w: 0.36, h: 0.24, d: 0.26 },
  ];
  for (const side of [-1, 1]) {
    parts.push({
      name: "arm",
      x: side * (0.3 + Math.sin(armAngle) * 0.22),
      y: torso - 0.02 + breath,
      z: pose === "curl" ? -0.2 : 0,
      w: 0.135,
      h: 0.69,
      d: 0.14,
      rz: side * armAngle,
      rx: motion * side * 0.5,
    });
    parts.push({
      name: "leg",
      x: side * 0.115,
      y: pose === "sit" ? -0.14 : hip / 2,
      z: pose === "sit" ? -0.18 : 0,
      w: 0.15,
      h: pose === "sit" ? 0.58 : hip,
      d: 0.17,
      rx: pose === "sit" ? -0.55 : motion * side * 0.62 + legAngle,
    });
    parts.push({
      name: "foot",
      x: side * 0.115,
      y: pose === "sit" ? -0.43 : 0.06,
      z: pose === "sit" ? -0.35 : -0.055,
      w: 0.17,
      h: 0.12,
      d: 0.28,
    });
  }
  if (detective) {
    parts.push({ name: "coat", x: 0, y: 0.76, z: 0, w: 0.64, h: 0.9, d: 0.36 });
    parts.push({ name: "hat", x: 0, y: 1.88, z: 0, w: 0.58, h: 0.09, d: 0.48 });
    parts.push({ name: "hat", x: 0, y: 1.98, z: 0, w: 0.35, h: 0.2, d: 0.32 });
    parts.push({
      name: "gun",
      x: 0.35,
      y: 1.1,
      z: -0.42,
      w: 0.085,
      h: 0.1,
      d: 0.53,
    });
  }
  return parts;
}

export function playerBodyParts(p) {
  const parts = bodyParts(p.pose, p.moving ? Math.sin((p.step || 0) * 8) * 0.6 : 0,
    p.still ? p.breathOffset || 0 : 0, p.role === "detective");
  if (!p.poseFrom || p.poseMix >= 1) return parts;
  const from = bodyParts(p.poseFrom, 0, 0, p.role === "detective");
  return parts.map((part, i) => {
    const out = { ...part };
    for (const key of ["x", "y", "z", "w", "h", "d", "rx", "rz"])
      out[key] = (from[i][key] || 0) + ((part[key] || 0) - (from[i][key] || 0)) * p.poseMix;
    return out;
  });
}
