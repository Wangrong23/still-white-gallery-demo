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
      const mesh = new T.Mesh(source.geometry,depth);
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
