import * as T from "three";
import { noirMeshes } from "./assets/noir-meshes.js";

// Shared templates: the killer and every intact decoy use identical geometry.
export const sculptureGeometry = Object.fromEntries(Object.entries(noirMeshes).map(([name, data]) => {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(data.normals, 3));
  return [name, geometry];
}));

export function decorateGallery(world, material) {
  // Keep walls uninterrupted: contrasting trim exposes a hidden silhouette.
  const pieces = [];
  // Sparse paired strips make readable, intentional skylight shadows.
  for (const x of [-18, -12, -3, 3, 12, 18])
    pieces.push([x, 5.55, -7, .32, .12, 24]);
  const mesh = new T.InstancedMesh(new T.BoxGeometry(1,1,1), material, pieces.length);
  const transform = new T.Object3D();
  pieces.forEach(([x,y,z,w,h,d], i) => {
    transform.position.set(x,y,z); transform.scale.set(w,h,d); transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);
}

export function posterTexture(variant) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 640;
  const c = canvas.getContext("2d");
  c.fillStyle = "#dedede"; c.fillRect(0,0,512,640);
  c.strokeStyle = "#242424"; c.lineWidth = 3;
  c.strokeRect(22,22,468,596); c.strokeRect(30,30,452,580);
  c.save(); c.beginPath(); c.rect(48,48,416,455); c.clip();
  c.fillStyle = "#252525";
  if (variant % 2) {
    // Metropolis silhouettes, a pale moon, and long diagonal shafts.
    for (let i=0;i<9;i++) c.fillRect(42+i*52,180+(i*73%160),40,350);
    c.fillStyle="#dedede"; c.beginPath(); c.arc(325,138,66,0,Math.PI*2); c.fill();
    c.strokeStyle="#a0a0a0"; c.lineWidth=11;
    for(let i=0;i<4;i++){ c.beginPath();c.moveTo(60+i*80,80);c.lineTo(260+i*80,490);c.stroke(); }
  } else {
    // Anonymous profile: an exhibition print, never a clue to the live actor.
    c.beginPath(); c.ellipse(254,218,100,139,-.16,0,Math.PI*2); c.fill();
    c.beginPath();c.moveTo(212,320);c.lineTo(100,500);c.lineTo(410,500);c.lineTo(296,314);c.fill();
    c.strokeStyle="#dedede";c.lineWidth=16;
    for(let i=0;i<7;i++){c.beginPath();c.moveTo(70,90+i*58);c.lineTo(420,165+i*58);c.stroke();}
  }
  c.restore(); c.fillStyle="#242424"; c.textAlign="center";
  c.font="34px Georgia"; c.fillText(variant%2 ? "AFTER HOURS" : "THE SILENT FORM",256,551);
  c.font="15px monospace"; c.fillText("WHITE GALLERY  /  1936",256,585);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace=T.SRGBColorSpace;
  return texture;
}
