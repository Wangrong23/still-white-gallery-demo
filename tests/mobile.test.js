import test from "node:test";
import assert from "node:assert/strict";
import { landscapeLayout, stagePoint, joystick } from "../client/mobile.js";

test("landscape stage follows the viewport without accumulating rotation and keeps menus native", () => {
  assert.deepEqual(landscapeLayout(390, 844, true), { width: 844, height: 390, rotated: true });
  assert.deepEqual(landscapeLayout(844, 390, true), { width: 844, height: 390, rotated: false });
  assert.deepEqual(landscapeLayout(390, 844, false), { width: 390, height: 844, rotated: false });
  assert.equal(landscapeLayout(500, 500, true).rotated, false);
});

test("touch coordinates round-trip through clockwise rotation, scale-free viewport offsets, and corners", () => {
  for (const rotated of [false, true]) {
    const width = 844, height = 390;
    const rect = { left: 12, top: 31, right: 12 + (rotated ? height : width) };
    for (const [x, y] of [[0, 0], [844, 390], [430, 123], [1, 389]]) {
      const clientX = rotated ? rect.right - y : rect.left + x;
      const clientY = rotated ? rect.top + x : rect.top + y;
      assert.deepEqual(stagePoint(clientX, clientY, rect, rotated), { x, y });
    }
  }
});

test("joystick has a neutral dead zone, analog walking, bounded diagonals and deliberate forward sprint", () => {
  assert.deepEqual(joystick(4, 3), { forward: 0, strafe: 0, sprint: false });
  assert.equal(joystick(0, -28).forward, .5);
  assert.equal(joystick(0, -80).sprint, true);
  assert.equal(joystick(0, 80).sprint, false);
  assert.equal(joystick(80, -80).sprint, false);
  const diagonal = joystick(200, -300);
  assert.ok(Math.abs(Math.hypot(diagonal.forward, diagonal.strafe) - 1) < 1e-12);
});
