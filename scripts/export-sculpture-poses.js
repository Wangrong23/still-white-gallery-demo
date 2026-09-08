import * as T from 'three';
import { writeFileSync } from 'node:fs';
import { bodyParts, CLASSIC_POSES } from '../shared/body.js';
import { SculptureSurface } from '../client/sculpture-surface.js';

const poses = Object.fromEntries(['stand', ...CLASSIC_POSES].map(pose => {
  const actor = new T.Group();
  actor.userData.parts = bodyParts(pose).map(p => {
    const part = new T.Object3D();
    part.position.set(p.x,p.y,p.z); part.scale.set(p.w,p.h,p.d);
    part.rotation.set(p.rx || 0,0,p.rz || 0);
    actor.add(part); return part;
  });
  const surface = new SculptureSurface(actor,new T.MeshBasicMaterial());
  return [pose, {positions:Array.from(surface.geometry.attributes.position.array),
    indices:Array.from(surface.geometry.index.array)}];
}));
writeFileSync(new URL('../art/sculpture-poses.json',import.meta.url),JSON.stringify(poses));
