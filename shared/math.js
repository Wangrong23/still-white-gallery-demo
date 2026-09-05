export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function direction(yaw,pitch=0){return {x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};}
export function rayBox(o,d,b){
  let lo=0,hi=Infinity;
  for(const [axis,size] of [['x','w'],['y','h'],['z','d']]){
    const min=b[axis]-b[size]/2,max=b[axis]+b[size]/2;
    if(Math.abs(d[axis])<1e-8){if(o[axis]<min||o[axis]>max)return Infinity;}
    else {let a=(min-o[axis])/d[axis],c=(max-o[axis])/d[axis]; if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)return Infinity;}
  }return lo;
}
export function rotateY(p,a){return{x:p.x*Math.cos(a)+p.z*Math.sin(a),y:p.y,z:-p.x*Math.sin(a)+p.z*Math.cos(a)};}
export function inversePart(p,part){
 let v={x:p.x-part.x,y:p.y-part.y,z:p.z-part.z};
 // THREE Euler XYZ: invert X then Z (Y is zero).
 if(part.rx){const c=Math.cos(-part.rx),s=Math.sin(-part.rx);v={x:v.x,y:v.y*c-v.z*s,z:v.y*s+v.z*c};}
 if(part.rz){const c=Math.cos(-part.rz),s=Math.sin(-part.rz);v={x:v.x*c-v.y*s,y:v.x*s+v.y*c,z:v.z};}
 return v;
}
