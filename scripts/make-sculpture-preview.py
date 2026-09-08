"""Blender MCP studio assembly from the exact runtime surface/pose export."""
import bpy, json, pathlib
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parent.parent
poses=json.loads((ROOT/'art/sculpture-poses.json').read_text())
scene=bpy.data.scenes.new('STILL / Anonymous figures')
bpy.context.window.scene=scene
mat=bpy.data.materials.new('SCULPTURE / chalk'); mat.diffuse_color=(.66,.66,.63,1)
mat.use_nodes=True
shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
shader.inputs['Base Color'].default_value=(.66,.66,.63,1)
shader.inputs['Roughness'].default_value=.95
preview_names=list(poses)[-3:]
for i,name in enumerate(preview_names):
    data=poses[name]
    points=data['positions']; indices=data['indices']
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([(points[j],-points[j+2],points[j+1]) for j in range(0,len(points),3)],[],
                     [indices[j:j+3] for j in range(0,len(indices),3)])
    mesh.update(); mesh.materials.append(mat)
    obj=bpy.data.objects.new(name,mesh); scene.collection.objects.link(obj)
    obj.location.x=(1-i)*1.9
floorMat=bpy.data.materials.new('SCULPTURE / floor'); floorMat.diffuse_color=(.23,.23,.23,1)
bpy.ops.mesh.primitive_plane_add(size=200)
bpy.context.object.data.materials.append(floorMat)
world=bpy.data.worlds.new('SCULPTURE / studio'); world.use_nodes=True
next(n for n in world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.22,.22,.22,1)
scene.world=world
for location,power,size in [((-3,4,7),500,5),((4,-3,5),700,4)]:
    data=bpy.data.lights.new('Studio softbox','AREA'); data.energy=power; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(data.name,data); scene.collection.objects.link(obj); obj.location=location
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('New sculpture parodies'); cam=bpy.data.objects.new(data.name,data); scene.collection.objects.link(cam)
cam.location=(.5,10,3.6);cam.rotation_euler=(Vector((0,0,1.05))-cam.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO';data.ortho_scale=6.5;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1600;scene.render.resolution_y=750;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.view_settings.exposure=-1;scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/anonymous-sculptures.blend'),copy=True)
result={'scene':scene.name,'poses':list(poses)}
