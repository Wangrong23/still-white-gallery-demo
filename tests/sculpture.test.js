import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { bodyParts, CLASSIC_POSES } from '../shared/body.js';
import { SculptureSurface } from '../client/sculpture-surface.js';
import { Game } from '../shared/game.js';
import { inversePart } from '../shared/math.js';

function surface(pose, options={}) {
  const actor=new T.Group(), parts=bodyParts(pose,0,0,false,options);
  actor.userData.parts=parts.map(p=> {
    const m=new T.Object3D(); m.position.set(p.x,p.y,p.z);
    m.scale.set(p.w,p.h,p.d); m.rotation.set(p.rx||0,0,p.rz||0); actor.add(m); return m;
  });
  return {parts,skin:new SculptureSurface(actor,new T.MeshBasicMaterial())};
}

test('classic pose preview is stable, consumed once and replicated as ordinary game state',()=> {
  for (const pose of CLASSIC_POSES) {
    const g=new Game(); g.state.sculpturePose=pose;
    Object.assign(g.state.players.killer,{x:0,z:-3.5});
    assert.equal(g.nearestSpot().pose,pose);
    assert.equal(g.nearestSpot().pose,pose);
    g.action('killer','pose');
    assert.equal(g.state.players.killer.pose,pose);
    assert.notEqual(g.state.sculpturePose,pose);
    const peer=new Game(); peer.state=JSON.parse(JSON.stringify(g.state));
    assert.deepEqual(peer.state.players.killer,g.state.players.killer);
    for (let i=0;i<20;i++) g.tick(.025);
    assert.equal(g.state.players.killer.pose,pose);
    g.leaveStill();
    for (let i=0;i<12;i++) g.tick(.025);
    assert.equal(g.state.players.killer.pose,'stand');
  }
});

test('anonymous surfaces share topology and stay finite through every bend and blend',()=> {
  const reference=surface('stand').skin.geometry.index.array;
  for (const pose of [...CLASSIC_POSES,'sit','curl','wall']) for (const mix of [0,.25,.5,.75,1]) {
    const {skin}=surface(pose,{poseFrom:'stand',poseMix:mix});
    assert.deepEqual(skin.geometry.index.array,reference);
    assert.ok(skin.geometry.attributes.position.array.every(Number.isFinite));
    assert.ok(skin.geometry.attributes.normal.array.every(Number.isFinite));
    // Every ring edge belongs to two triangles; no open elbow/knee gaps.
    const edges=new Map(), ix=skin.geometry.index.array;
    for (let i=0;i<ix.length;i+=3) for (let j=0;j<3;j++) {
      const a=ix[i+j],b=ix[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
      edges.set(key,(edges.get(key)||0)+1);
    }
    assert.ok([...edges.values()].every(n=>n===2));
  }
});

test('surface silhouette remains near authoritative hit volumes in all classic poses',()=> {
  for (const pose of CLASSIC_POSES) {
    const {parts,skin}=surface(pose), pos=skin.geometry.attributes.position;
    for(let i=0;i<pos.count;i++) {
      const p={x:pos.getX(i),y:pos.getY(i),z:pos.getZ(i)};
      assert.ok(parts.some(part=> {
        const v=inversePart(p,part);
        return Math.abs(v.x)<=part.w/2+.045 && Math.abs(v.y)<=part.h/2+.045 && Math.abs(v.z)<=part.d/2+.045;
      }),`${pose}: surface vertex ${i} escaped hit volumes`);
    }
  }
});
