import * as T from 'three';
import { sculptureProfiles as profiles } from './assets/sculpture-profiles.js';

// One ring at each elbow/knee is shared by both sides of the bend. The hidden
// articulated parts remain the source of poses, hit boxes and death motion.
export class SculptureSurface {
  constructor(actor, material) {
    this.parts = actor.userData.parts;
    this.rings = [];
    const indices = [], n = 8;
    const ring = (part, row) => [{ part, row, weight: 1 }];
    const joint = (a, b, name) => [
      { part: a, row: profiles[name][0], weight: .5 },
      { part: b, row: profiles[name].at(-1), weight: .5 },
    ];
    const loop = start => Array.from({length:n},(_,i)=>start+i);
    const bridge = (a,b) => {
      let i=0,j=0;
      while(i<a.length || j<b.length) {
        if (j===b.length || (i<a.length && (i+1)/a.length <= (j+1)/b.length)) {
          indices.push(a[i%a.length],a[(i+1)%a.length],b[j%b.length]); i++;
        } else {
          indices.push(a[i%a.length],b[(j+1)%b.length],b[j%b.length]); j++;
        }
      }
    };
    const cap = a => {for(let i=1;i<a.length-1;i++) indices.push(a[0],a[i],a[i+1]);};
    const tube = (rings, skip=()=>false) => {
      const start=this.rings.length*n;
      this.rings.push(...rings);
      for(let j=0;j<rings.length-1;j++) for(let i=0;i<n;i++) {
        if(skip(j,i)) continue;
        const a=start+j*n+i,b=start+j*n+(i+1)%n,c=a+n,d=b+n;
        indices.push(a,c,d,a,d,b);
      }
      return {first:loop(start),last:loop(start+(rings.length-1)*n)};
    };
    // Open shoulder sockets and a split pelvis make a single closed surface.
    // There are no hidden overlapping limb caps, neck seams or ankle pieces.
    const body=tube([
      ...profiles.hips.slice(0,2).map(row=>ring(2,row)),
      ...profiles.torso.slice(1).map(row=>ring(0,row)),
      ...profiles.head.map(row=>ring(1,row)),
    ],(j,i)=>j===2 && [0,7,3,4].includes(i));
    cap(body.last);
    const leftSocket=[20,19,27,28,29,21];
    const rightSocket=[24,25,17,16,23,31];
    for(const [a,b,socket] of [[3,4,leftSocket],[8,9,rightSocket]]) {
      const arm=tube([ring(a,[.20,.46,.46]),joint(a,b,'arm'),
        ring(b,profiles.arm[1]),ring(b,profiles.arm[0])]);
      bridge(socket,arm.first); cap(arm.last);
    }
    const legs=[];
    for(const [a,b,foot] of [[5,6,7],[10,11,12]]) {
      const leg=tube([ring(a,profiles.leg[1]),joint(a,b,'leg'),
        ring(b,profiles.leg[1]),...profiles.foot.toReversed().map(row=>ring(foot,row))]);
      cap(leg.last);legs.push(leg);
    }
    this.crotch=this.rings.length*n;
    bridge([this.crotch,2,3,4,5,6],legs[0].first);
    bridge([0,1,2,this.crotch,6,7],legs[1].first);
    // Orient adjacent faces consistently once; poses deform the shared vertices.
    const edges=new Map(),adj=Array.from({length:indices.length/3},()=>[]);
    for(let t=0;t<indices.length/3;t++) for(let k=0;k<3;k++) {
      const a=indices[t*3+k],b=indices[t*3+(k+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
      if(edges.has(key)) {
        const [other,oa]=edges.get(key),same=oa===a;
        adj[t].push([other,same]);adj[other].push([t,same]);
      } else edges.set(key,[t,a]);
    }
    const flipped=new Map([[0,false]]),queue=[0];
    for(let q=0;q<queue.length;q++) {
      const t=queue[q];
      for(const [other,same] of adj[t]) if(!flipped.has(other)) {
        flipped.set(other,flipped.get(t)!==same);queue.push(other);
      }
    }
    for(const [t,flip] of flipped) if(flip) [indices[t*3+1],indices[t*3+2]]=[indices[t*3+2],indices[t*3+1]];
    this.geometry = new T.BufferGeometry();
    this.geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array((this.rings.length*n+1)*3),3));
    this.geometry.setIndex(indices);
    this.mesh = new T.Mesh(this.geometry,material);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    actor.add(this.mesh);
    this.local = new T.Vector3();
    this.point = new T.Vector3();
    this.update();
  }
  update() {
    for (const part of this.parts) part.updateMatrix();
    const attr=this.geometry.attributes.position;
    this.rings.forEach((sources,j)=> {
      for (let i=0;i<8;i++) {
        const angle=i*Math.PI/4;
        this.point.set(0,0,0);
        for (const {part,row:[y,rx,rz],weight} of sources) {
          this.local.set(rx*Math.cos(angle),y,rz*Math.sin(angle)).applyMatrix4(this.parts[part].matrix);
          this.point.addScaledVector(this.local,weight);
        }
        attr.setXYZ(j*8+i,this.point.x,this.point.y,this.point.z);
      }
    });
    this.local.set(0,-.5,0).applyMatrix4(this.parts[2].matrix);
    attr.setXYZ(this.crotch,this.local.x,this.local.y,this.local.z);
    attr.needsUpdate=true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}

