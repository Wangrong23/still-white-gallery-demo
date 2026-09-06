import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noirMeshes } from "../client/assets/noir-meshes.js";
import { bodyParts } from "../shared/body.js";
import { createApp } from "../server/index.js";

test("Blender templates cover both roles and remain inside authoritative unit hit bounds", () => {
  for (const p of bodyParts("stand", 0, 0, true)) {
    const name = p.name === "hat" && p.h > .1 ? "crown" : p.name;
    const mesh = noirMeshes[name];
    assert.ok(mesh, name);
    assert.equal(mesh.positions.length % 9, 0);
    assert.equal(mesh.normals.length, mesh.positions.length);
    assert.ok(mesh.positions.every((v) => Number.isFinite(v) && Math.abs(v) <= .5));
    for (let i = 0; i < mesh.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < .001);
  }
});

test("original effect assets are nonempty mono PCM WAVs that can be decoded without dependencies", () => {
  for (const name of ["heel", "revolver", "plaster", "bell"]) {
    const data = readFileSync(new URL(`../client/assets/${name}.wav`, import.meta.url));
    assert.equal(data.toString("ascii", 0, 4), "RIFF");
    assert.equal(data.toString("ascii", 8, 12), "WAVE");
    assert.equal(data.readUInt16LE(20), 1);
    assert.equal(data.readUInt16LE(22), 1);
    assert.equal(data.readUInt32LE(24), 22050);
    assert.equal(data.readUInt16LE(34), 16);
    assert.equal(data.readUInt32LE(40), data.length - 44);
  }
});

test("runtime art and audio are served with browser-compatible MIME types", async () => {
  const app = createApp({ port: 0, host: "127.0.0.1" });
  const { port } = await app.start();
  try {
    for (const [file, type] of [["heel.wav", "audio/wav"], ["noir-meshes.js", "text/javascript"]]) {
      const response = await fetch(`http://127.0.0.1:${port}/client/assets/${file}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("content-type").startsWith(type));
      assert.ok((await response.arrayBuffer()).byteLength > 100);
    }
  } finally { await app.close(); }
});
