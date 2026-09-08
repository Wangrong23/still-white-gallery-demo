import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { bodyParts } from '../shared/body.js';
import { detectiveMeshes, detectivePalette } from '../client/assets/detective-meshes.js';
import { DetectiveSmoke } from '../client/detective-smoke.js';

test('Blender detective bind pose matches gameplay and every body mesh fits its hit bounds', () => {
  const bind = JSON.parse(readFileSync(new URL('../art/detective-bind.json', import.meta.url)));
  assert.deepEqual(bind, bodyParts('stand', 0, 0, true));
  for (const p of bind) {
    const key = p.name === 'hat' && p.h > .1 ? 'crown' : p.name;
    assert.ok(detectiveMeshes[key], key);
    assert.ok(detectiveMeshes[key].positions.every(v => Number.isFinite(v) && Math.abs(v) <= .500001), key);
  }
  for (const [key, mesh] of Object.entries(detectiveMeshes)) {
    assert.equal(mesh.positions.length % 9, 0, key);
    assert.equal(mesh.normals.length, mesh.positions.length, key);
    for (let i = 0; i < mesh.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i+3)) - 1) < .001, key);
    let offset = 0;
    for (const group of mesh.groups) {
      assert.equal(group.start, offset, key);
      assert.ok(group.materialIndex < detectivePalette.length);
      offset += group.count;
    }
    assert.equal(offset * 3, mesh.positions.length, key);
  }
});

test('cigarette smoke leaves the moving head, stops on death and clears between rounds', () => {
  const scene = new T.Scene(), head = new T.Object3D(), smoke = new DetectiveSmoke(scene);
  head.position.set(2, 1.63, 3); head.scale.set(.36, .4, .38); scene.add(head);
  const player = { death: null };
  smoke.update(head, player, .46, 1, false);
  const puff = smoke.puffs[0];
  assert.equal(puff.mesh.visible, true);
  assert.ok(Math.abs(puff.mesh.position.z - (3 - .38 * 1.07)) < .02);
  head.position.x += 10;
  smoke.update(head, player, .02, 1.02, false);
  assert.ok(puff.mesh.position.x < 3, 'emitted smoke must not move with the actor');
  player.death = {};
  const serial = smoke.serial;
  for (let i = 0; i < 150; i++) smoke.update(head, player, .02, 2, false);
  assert.equal(smoke.serial, serial);
  assert.ok(smoke.puffs.every(p => !p.mesh.visible));
  player.death = null;
  smoke.update(head, player, .46, 3, false);
  smoke.update(head, player, .01, 0, false);
  assert.ok(smoke.puffs.every(p => !p.mesh.visible));
});

test('the revolver grip stays at the right wrist throughout the walking cycle', () => {
  for (const phase of [0,.7,1.5,2.3,3.5,5.2]) {
    const parts = bodyParts('stand', 0, 0, true, { phase, blend: 1 });
    const arm = parts.filter(p => p.name === 'arm')[3];
    const wrist = new T.Vector3(0,-arm.h/2,0)
      .applyEuler(new T.Euler(arm.rx || 0,0,arm.rz || 0)).add(new T.Vector3(arm.x,arm.y,arm.z));
    const gun = parts.find(p => p.name === 'gun');
    const grip = new T.Vector3(gun.x, gun.y - .024, gun.z + .1643);
    assert.ok(wrist.distanceTo(grip) < 1e-9);
  }
});

test('turned detective head and hat keep rendering and ray transforms aligned', async () => {
  const {inversePart}=await import('../shared/math.js');
  for(const blend of [0,.5,1]) {
    const parts=bodyParts('stand',0,0,true,{blend});
    const head=parts.find(p=>p.name==='head');
    assert.ok(head.rx<0 && head.ry<0);
    for(const part of parts.filter(p=>p.name==='head'||p.name==='hat')) {
      assert.equal(part.rx,head.rx);assert.equal(part.ry,head.ry);
      const local=new T.Vector3(.07,.02,-.09);
      const world=local.clone().applyEuler(new T.Euler(part.rx,part.ry,part.rz||0)).add(new T.Vector3(part.x,part.y,part.z));
      const back=inversePart(world,part);
      assert.ok(local.distanceTo(new T.Vector3(back.x,back.y,back.z))<1e-9);
    }
  }
});
