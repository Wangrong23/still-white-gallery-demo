import * as T from 'three';

// A sunlight depth pass containing scenery only. Neither dark albedo nor the
// character's own back-facing surfaces can qualify as environmental cover.
export class ConcealmentMask {
  constructor(world, sun) {
    this.scene = new T.Scene();
    this.camera = sun.shadow.camera.clone();
    this.camera.updateProjectionMatrix();
    this.target = new T.WebGLRenderTarget(1024,1024,{
      minFilter:T.NearestFilter,magFilter:T.NearestFilter,
    });
    const depth = new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});
    this.sources = [];
    world.traverse(source=> {
      if (!source.isMesh || !source.castShadow) return;
      for(let p=source;p && p!==world;p=p.parent)
        if(p.userData.parts) return;
      // Instanced roof strips use a unit box plus per-instance transforms.
      // Treating them as a Mesh puts a phantom shadow-casting cube at the
      // world origin and drops every real strip from the concealment map.
      const mesh = source.isInstancedMesh
        ? new T.InstancedMesh(source.geometry,depth,source.count)
        : new T.Mesh(source.geometry,depth);
      if (source.isInstancedMesh) {
        mesh.instanceMatrix = source.instanceMatrix;
        mesh.frustumCulled = false;
      }
      mesh.matrixAutoUpdate=false;this.scene.add(mesh);
      this.sources.push({source,mesh});
    });
    this.world=world;
    this.uniforms={
      concealmentMap:{value:this.target.texture},
      concealmentMatrix:{value:new T.Matrix4()},
    };
    this.bias = new T.Matrix4().set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
    this.look = new T.Vector3();
    this.clear = new T.Color();
  }
  update(renderer,sun) {
    this.world.updateWorldMatrix(true,true);
    for(const {source,mesh} of this.sources) {
      mesh.matrix.copy(source.matrixWorld);
      if (source.isInstancedMesh) {
        mesh.count = source.count;
        mesh.instanceMatrix = source.instanceMatrix;
      }
      mesh.visible=true;
      for(let p=source;p;p=p.parent) if(!p.visible) mesh.visible=false;
    }
    this.camera.position.copy(sun.position);
    sun.target.getWorldPosition(this.look);this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
    this.uniforms.concealmentMatrix.value.copy(this.bias)
      .multiply(this.camera.projectionMatrix).multiply(this.camera.matrixWorldInverse);
    const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();
    renderer.getClearColor(this.clear);
    renderer.setRenderTarget(this.target);renderer.setClearColor(0xffffff,1);
    renderer.clear();renderer.render(this.scene,this.camera);
    renderer.setRenderTarget(previous);renderer.setClearColor(this.clear,alpha);
  }
}
