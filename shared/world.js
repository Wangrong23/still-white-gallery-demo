// Shared layout: rendering, movement, sight and ballistics use the same solids.
export const solids = [];
const box = (id, x, y, z, w, h, d, type = "wall") => {
  const b = { id, x, y, z, w, h, d, type };
  solids.push(b);
  return b;
};
box("floor", 0, -0.15, 0, 48, 0.3, 40, "floor");
box("north", 0, 2.6, -20, 48, 5.2, 0.4);
box("west", -24, 2.6, 0, 0.4, 5.2, 40);
box("east", 24, 2.6, 0, 0.4, 5.2, 40);
box("south-west", -13.5, 2.6, 20, 21, 5.2, 0.4);
box("south-east", 13.5, 2.6, 20, 21, 5.2, 0.4);
// A gated entrance vestibule makes the night route a real destination.
box("entry-left", -3, 2, 22, 0.35, 4, 4);
box("entry-right", 3, 2, 22, 0.35, 4, 4);
box("entry-back", 0, 2, 24, 6, 4, 0.3);
box("entry-floor", 0, -0.15, 22, 6, 0.3, 4, "floor");
// Interior walls have wide, navigable doorways.
for (const x of [-9, 9]) {
  box(`partition-n-${x}`, x, 2.3, -14.5, 0.35, 4.6, 11);
  box(`partition-c-${x}`, x, 2.3, 0, 0.35, 4.6, 8);
  box(`partition-s-${x}`, x, 2.3, 14.5, 0.35, 4.6, 11);
}
box("gallery-a-divider", -18, 2.3, 0, 12, 4.6, 0.35);
box("gallery-b-divider", 18, 2.3, 0, 12, 4.6, 0.35);
for (const [x, z] of [
  [-6, -12],
  [6, -12],
  [-6, 12],
  [6, 12],
])
  box(`column-${x}-${z}`, x, 2.7, z, 0.75, 5.4, 0.75, "column");
for (const [i, x, z, w, d] of [
  [0, -3, -5, 1.7, 1.7],
  [1, 0, -5, 1.7, 1.7],
  [2, 3, -5, 1.7, 1.7],
  [3, -17, -13, 2, 2],
  [4, 17, -12, 2.2, 2.2],
  [5, 16, 11, 2, 2],
  [6, -16, 12, 2, 2],
])
  box(`plinth-${i}`, x, 0.35, z, w, 0.7, d, "plinth");
for (const [i, x, z, rot] of [
  [0, -4, 5, 0],
  [1, 16, -5, 0],
  [2, -17, 6, 0],
  [3, 5, 16, 0],
])
  box(`bench-${i}`, x, 0.34, z, 3.2, 0.68, 0.8, "bench");
box("case", 18, 0.7, 5, 3.4, 1.4, 1.5, "case");
// Irregular obstructions and screens break long sight lines without labyrinths.
box("screen", 0, 1.8, -13, 5, 3.6, 0.3);
box("screen-south", 3, 1.6, 9, 3.4, 3.2, 0.25);

export const spots = [
  {
    id: 0,
    name: "The third figure",
    x: 0,
    y: 0.7,
    z: -5,
    yaw: 0,
    pose: "statue",
  },
  {
    id: 1,
    name: "White on white",
    x: -8.43,
    y: 0,
    z: -13,
    yaw: -Math.PI / 2,
    pose: "wall",
  },
  {
    id: 2,
    name: "A seated visitor",
    x: -4,
    y: 0.68,
    z: 5,
    yaw: 0,
    pose: "sit",
  },
  {
    id: 3,
    name: "Study of a body",
    x: -17,
    y: 0.7,
    z: -13,
    yaw: 0.25,
    pose: "arms",
  },
  {
    id: 4,
    name: "In the corner",
    x: -22,
    y: 0,
    z: -18,
    yaw: Math.PI,
    pose: "curl",
  },
  { id: 5, name: "The attendant", x: -13, y: 0, z: 1, yaw: 0, pose: "hands" },
  {
    id: 6,
    name: "Untitled, no. 6",
    x: -16,
    y: 0.7,
    z: 12,
    yaw: -0.5,
    pose: "contrapposto",
  },
  {
    id: 7,
    name: "Under the frame",
    x: -22.8,
    y: 0,
    z: 16,
    yaw: -Math.PI / 2,
    pose: "crouch",
  },
  {
    id: 8,
    name: "The sun room",
    x: 17,
    y: 0.7,
    z: -12,
    yaw: 0.4,
    pose: "statue",
  },
  {
    id: 9,
    name: "A waiting figure",
    x: 16,
    y: 0.68,
    z: -5,
    yaw: Math.PI,
    pose: "sit",
  },
  { id: 10, name: "Arms in air", x: 16, y: 0.7, z: 11, yaw: 0, pose: "arms" },
  {
    id: 11,
    name: "Behind the door",
    x: 8.42,
    y: 0,
    z: 15,
    yaw: Math.PI / 2,
    pose: "wall",
  },
].map((s) => ({ ...s, range: 1.7 }));

export const statues = [
  { x: -3, y: 0.7, z: -5, yaw: 0, pose: "statue" },
  { x: 3, y: 0.7, z: -5, yaw: 0, pose: "statue" },
  { x: 15, y: 0, z: -15, yaw: 1, pose: "hands" },
  { x: -19, y: 0, z: 13, yaw: 0.1, pose: "arms" },
  { x: 21, y: 0, z: 14, yaw: 0, pose: "contrapposto" },
  { x: -17, y: 0, z: -17, yaw: 0, pose: "crouch" },
];
export const props = [
  { type: "plant", x: -20, z: -3 },
  { type: "plant", x: 21, z: -17 },
  { type: "plant", x: 7, z: 18 },
  { type: "coat", x: -12, z: 17 },
  { type: "coat", x: 20, z: 2 },
  { type: "abstract", x: 3, z: -15 },
  { type: "abstract", x: -20, z: 9 },
];
// Footprints for movement and pose paths, separate from detailed visual meshes.
// Air between coat hooks and sculpture rings stays open to sight and bullets.
export const propFootprints = props.map((p, id) => ({
  id: `prop-footprint-${id}`, x: p.x, z: p.z, y: 0, h: 2, type: "prop",
  w: p.type === "abstract" ? 1.4 : p.type === "plant" ? .65 : .12,
  d: p.type === "abstract" ? 1.4 : p.type === "plant" ? .65 : .12,
}));
export const movementSolids = [...solids, ...propFootprints];
export const exit = { x: 0, z: 22.5, radius: 1.7 };
export const rooms = [
  { name: "THE WHITE GALLERY", sub: "白厅 · CENTRAL HALL", x: 0, z: 2 },
  { name: "FIGURE STUDIES", sub: "雕塑厅", x: -16, z: -10 },
  { name: "GALLERY A", sub: "画廊 A", x: -16, z: 10 },
  { name: "THE SKYLIGHT", sub: "天窗厅", x: 16, z: -10 },
  { name: "GALLERY B", sub: "画廊 B", x: 16, z: 10 },
];
