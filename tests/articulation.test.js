import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Euler } from 'three';
import { bodyParts, playerBodyParts } from '../shared/body.js';
import { Game } from '../shared/game.js';

const endpoint = (p, side) => new Vector3(0, side * p.h / 2, 0)
  .applyEuler(new Euler(p.rx || 0, 0, p.rz || 0)).add(new Vector3(p.x, p.y, p.z));

test('wall pose closes the rear gap without putting any hit box through the wall', () => {
  const parts = bodyParts('wall');
  for (const p of parts) {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new Vector3(x*p.w/2, y*p.h/2, z*p.d/2)
        .applyEuler(new Euler(p.rx || 0, 0, p.rz || 0)).add(new Vector3(p.x,p.y,p.z));
      assert.ok(corner.z < .36, p.name);
    }
  }
  const head=parts.find(p=>p.name==='head');
  assert.ok(.36-head.z-head.d/2 <= .011);
});

test('rendered limb endpoints meet throughout walking and special-pose transitions', () => {
  for (const pose of ['stand', 'sit', 'crouch', 'curl', 'arms', 'contrapposto', 'david', 'discobolus', 'liberty', 'thinker', 'victory', 'venus']) {
    for (const mix of [0, .25, .5, .75, 1]) {
      const parts = bodyParts(pose, 0, 0, false,
        { poseFrom: 'stand', poseMix: mix, phase: mix * Math.PI * 2, blend: .7 });
      for (const name of ['arm', 'leg']) {
        const limbs = parts.filter(p => p.name === name);
        for (let i = 0; i < limbs.length; i += 2)
          assert.ok(endpoint(limbs[i], -1).distanceTo(endpoint(limbs[i + 1], 1)) < 1e-9);
      }
    }
    assert.deepEqual(playerBodyParts({ pose, still: true, step: 4, moveBlend: 1, turnBlend: 1 }), bodyParts(pose));
  }
});

test('leaving a completed bench pose preserves body height and finishes standing', () => {
  const g = new Game(); g.phase('DAY');
  const p = g.state.players.killer;
  Object.assign(p, { x: -4, z: 6.5 }); g.action('killer', 'pose');
  for (let i = 0; i < 8; i++) g.tick(.05);
  p.breathOffset = 0; // Isolate the pose transition from the independent breath cycle.
  const before = playerBodyParts(p).find(p => p.name === 'head').y + p.y;
  g.leaveStill();
  assert.ok(Math.abs(playerBodyParts(p).find(p => p.name === 'head').y + p.y - before) < .001);
  g.tick(.05); assert.ok(p.poseMix > 0 && p.poseMix < 1);
  for (let i = 0; i < 5; i++) g.tick(.05);
  assert.equal(p.poseFrom, null); assert.equal(p.poseMix, 1);
});
