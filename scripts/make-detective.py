"""Original STILL detective, authored/exported through Blender MCP.
Run after generating art/detective-bind.json from shared/body.js (see art/README.md).
Creates a separate scene and saves a copy; existing Blender scenes are preserved.
"""
import bpy, json, math, pathlib
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parent.parent
bind = json.loads((ROOT / 'art/detective-bind.json').read_text())
scene = bpy.data.scenes.new('STILL / The Last Cigarette')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
collection = bpy.data.collections.new('DET / articulated character')
scene.collection.children.link(collection)
palette = [('coat',0x666666),('ink',0x151515),('lapel',0x797979),
           ('skin',0xcacaca),('paper',0xe9e9e9),('ash',0x515151)]
materials = []
for name, value in palette:
    mat = bpy.data.materials.new('DET / ' + name)
    c = (value & 255) / 255
    # Convert sRGB swatches to linear values for Blender's shader.
    c = ((c+.055)/1.055)**2.4 if c>.04045 else c/12.92
    mat.diffuse_color = (c,c,c,1)
    mat.use_nodes = True
    shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (c,c,c,1)
    shader.inputs['Roughness'].default_value = .9
    materials.append(mat)

templates = {}
class Part:
    def __init__(self,name):
        self.name=name; self.v=[]; self.f=[]; self.m=[]
    def poly(self,verts,faces,mat):
        n=len(self.v); self.v.extend(verts)
        self.f.extend(tuple(n+i for i in f) for f in faces); self.m.extend([mat]*len(faces))
    def loft(self,rings,mat=0,n=8):
        # Game-space Y up, front -Z. Each ring may shift for a bent silhouette.
        v=[]
        for y,rx,rz,cx,cz in rings:
            v.extend((cx+rx*math.cos(2*math.pi*i/n), y, cz+rz*math.sin(2*math.pi*i/n)) for i in range(n))
        f=[tuple(range(n))]
        for j in range(len(rings)-1):
            for i in range(n):
                k=(i+1)%n; f.append((j*n+i,(j+1)*n+i,(j+1)*n+k,j*n+k))
        f.append(tuple(reversed([(len(rings)-1)*n+i for i in range(n)])))
        self.poly(v,f,mat)
    def box(self,c,s,mat):
        x,y,z=c; a,b,d=[v/2 for v in s]
        self.poly([(x+i*a,y+j*b,z+k*d) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
                  [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],mat)
    def plate(self,points,mat,depth=.025):
        n=len(points)
        self.poly(points+[(x,y,z+depth) for x,y,z in points],
                  [tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
    def finish(self):
        mesh=bpy.data.meshes.new('DET_'+self.name)
        mesh.from_pydata([(x,-z,y) for x,y,z in self.v],[],self.f)
        mesh.validate(); mesh.update()
        for mat in materials: mesh.materials.append(mat)
        for face,mat in zip(mesh.polygons,self.m): face.material_index=mat
        templates[self.name]=mesh

def rings(rows): return [(y,rx,rz,0,0) for y,rx,rz in rows]

# Primary masses first: a single shoulder-to-hem coat, broad cheek planes,
# and plain tapered sleeves. Clothing details share the coat surface.
p=Part('torso')
# Internal articulation volume; entirely enclosed by the continuous coat.
p.loft(rings([(-.5,.20,.20),(.40,.20,.20)]))
p.finish()

p=Part('coat')
# Chamfered rectangle: the large front and back stay planar, not radial facets.
outline=[(1,.55),(.68,1),(-.68,1),(-1,.55),(-1,-.55),(-.68,-1),(.68,-1),(1,-.55)]
rows=[(-.49,.48,.46),(.12,.35,.43),(.40,.45,.43),(.49,.24,.30)]
v=[(x*rx,y,z*rz) for y,rx,rz in rows for x,z in outline]
f=[tuple(range(8))]
for j in range(3):
    for i in range(8):
        if i==5: continue
        k=(i+1)%8
        f.append((j*8+i,(j+1)*8+i,(j+1)*8+k,j*8+k))
f.append(tuple(reversed(range(24,32))))
p.poly(v,f,0)
# Two long overlapping front panels: one restrained ridge, continuous to hem.
HL=v[5]; HR=v[6]; WL=v[13]; WR=v[14]
HT=(.065,-.49,-.472); WT=(.025,.12,-.445)
p.poly([HL,HR,WL,WR,HT,WT],[(0,2,5,4),(4,5,3,1)],0)
# Narrow closure edge, not a separate strip of hardware.
p.poly([HT,WT,(.078,-.49,-.46),(.038,.12,-.43)],[(0,1,3,2)],5)
# Inset shirt and two restrained lapel planes complete the SAME outer shell.
# No extruded diamonds, pockets, buttons, belt or stacked waist seam.
L=v[13]; R=v[14]; SL=v[21]; SR=v[22]; NL=v[29]; NR=v[30]
V=(.025,.22,-.475)
p.poly([L,R,SL,SR,NL,NR,V],[(0,2,6),(0,6,1),(1,6,3)],0)
# A shallow collar break catches light without becoming a floating plate.
CL=(-.17,.405,-.405)
p.poly([SL,NL,V,CL],[(0,1,3),(0,3,2),(1,2,3)],2)
CR=(.155,.41,-.402)
p.poly([SR,V,NR,CR],[(0,3,2),(0,1,3),(1,2,3)],2)
A=(-.065,.49,-.30); B=(.065,.49,-.30)
W=(.01,.382,-.352)
p.poly([NL,NR,V,A,B,W],[(0,3,5),(0,5,2),(2,5,1),(1,5,4)],2)
p.poly([A,B,W],[(0,1,2)],4)
p.finish()

p=Part('head')
# Nose belongs to the face topology. Ears disappear into the side silhouette.
profile=[(.44,.12),(.31,.35),(-.31,.35),(-.44,.12),(-.36,-.25),(-.13,-.31),(0,-.33),(.13,-.31),(.36,-.25)]
rows=[(-.49,.61,.82),(-.32,.88,1.03),(-.10,.86,.97),(.10,1,1),(.39,.96,.98),(.49,.85,.85)]
v=[]
for j,(y,sx,sz) in enumerate(rows):
    for i,(x,z) in enumerate(profile):
        # A single continuous long nose bridge, ending in a blunt tip.
        if i==6: z=[-.36,-.39,-.46,-.49,-.32,-.28][j]
        v.append((x*sx,y,z*sz))
f=[tuple(range(9))]
for j in range(len(rows)-1):
    for i in range(9):
        k=(i+1)%9; f.append((j*9+i,(j+1)*9+i,(j+1)*9+k,j*9+k))
f.append(tuple(reversed(range((len(rows)-1)*9,len(rows)*9))))
p.poly(v,f,3)
# Tiny tired eyes lie flush on the cheek plane; no eyebrow blocks.
for side in [-1,1]:
    x=side*.23
    def zface(x): return -.312+(abs(x)-.13)*(.06/.23)
    p.poly([(x-.06,.15,zface(x-.06)-.002),(x+.06,.15,zface(x+.06)-.002),
            (x+.06,.12,zface(x+.06)-.002),(x-.06,.12,zface(x-.06)-.002)],[(0,1,2,3)],1)
# One slanted mouth mark on the muzzle, the cigarette emerges from its corner.
p.poly([(.04,-.29,-.383),(.28,-.265,-.313),(.28,-.285,-.313),(.04,-.307,-.383)],[(0,1,2,3)],5)
p.finish()

p=Part('hat')
# Thin brim sits inside the head's upper volume, not above it.
v=[]; n=12
for layer in [-.065,.065]:
    for i in range(n):
        a=2*math.pi*i/n; x=.49*math.cos(a); z=.49*math.sin(a)
        v.append((x,layer+.20*x+.18*z,z))
p.poly(v,[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)],1)
p.finish()
p=Part('crown')
# One pinched crown with a material-only band, no stacked rim or crease plate.
p.loft([(-.5,.49,.47,0,0),(-.33,.48,.46,0,0)],5,8)
p.loft([(-.33,.48,.46,0,0),(.34,.40,.39,-.03,.01),(.46,.32,.29,-.03,.01)],1,8)
# Replace the crown cap by two broad slopes into a shallow central dent.
cap=p.f.pop(); p.m.pop()
center=len(p.v); p.v.append((-.03,.31,.01))
for i in range(len(cap)):
    p.f.append((cap[i],cap[(i+1)%len(cap)],center)); p.m.append(1)
p.finish()
for name in ['hips','arm','leg','foot']:
    p=Part(name)
    if name=='arm':
        # Continuous broad sleeve planes; no cuff at either articulation joint.
        p.loft(rings([(-.5,.40,.42),(.36,.48,.48),(.5,.44,.44)]))
    elif name=='foot':
        p.loft([(-.49,.46,.48,0,0),(-.15,.46,.48,0,0),(.48,.32,.31,0,.13)],1)
    else: p.loft(rings([(-.5,.39,.40),(.5,.43,.44)]),1)
    p.finish()
p=Part('gun')
# Compact revolver: barrel, broad cylinder, raked grip and an open guard.
p.box((0,.28,-.15),(.32,.22,.64),1)
p.box((0,.415,-.40),(.12,.10,.065),1)
p.box((0,.18,.19),(.38,.38,.25),1)
# Cylinder axis follows the barrel rather than standing vertically.
t=Part('cylinder')
t.loft(rings([(-.10,.46,.27),(.15,.46,.27)]),5,8)
p.poly([(x,z+.16,-y+.065) for x,y,z in t.v],t.f,5)
p.plate([(-.22,-.03,.28),(.22,-.03,.28),(.28,-.48,.46),(-.28,-.48,.46)],1,.035)
# Guard has actual negative space, no filled rectangular plate.
p.box((0,-.16,.02),(.13,.055,.23),1)
p.box((0,-.065,-.085),(.13,.19,.045),1)
# One mitten-shaped palm establishes contact at the wrist; no finger detailing.
p.box((0,-.015,.397),(.70,.28,.16),3)
p.finish()
# Accessory uses head-relative normalized coordinates and is not a hit target.
p=Part('cigarette')
for z,length,mat in [(-.60,.55,4),(-.96,.17,5)]:
    # Six sides read as a cigarette, not a tiny square plank.
    t=Part('paper')
    t.loft(rings([(-length/2,.032,.03),(length/2,.032,.03)]),mat,6)
    p.poly([(x+.24,zz-.27,-y+z) for x,y,zz in t.v],t.f,mat)
p.box((.24,-.27,-1.05),(.054,.05,.018),1)
p.finish()

# Export flat triangle normals and material groups from the actual Blender meshes.
export={}
for name,mesh in templates.items():
    mesh.calc_loop_triangles(); pos=[]; normals=[]; groups=[]
    for mat in range(len(materials)):
        start=len(pos)//3
        for tri in mesh.loop_triangles:
            if tri.material_index!=mat: continue
            for vi in tri.vertices:
                x,y,z=mesh.vertices[vi].co; pos.extend(round(c,6) for c in (x,z,-y))
                x,y,z=tri.normal; normals.extend(round(c,6) for c in (x,z,-y))
        count=len(pos)//3-start
        if count: groups.append({'start':start,'count':count,'materialIndex':mat})
    export[name]={'positions':pos,'normals':normals,'groups':groups}
(ROOT/'client/assets/detective-meshes.js').write_text('// Authored in Blender via MCP; regenerate with scripts/make-detective.py.\nexport const detectivePalette = '+json.dumps([v for _,v in palette])+';\nexport const detectiveMeshes = '+json.dumps(export,separators=(',',':'))+';\n',encoding='utf8')

# Assemble an editable, correctly scaled character in Blender, Y forward/Z up.
for i,part in enumerate(bind):
    key='crown' if part['name']=='hat' and part['h']>.1 else part['name']
    obj=bpy.data.objects.new('DET_%02d_%s'%(i,key),templates[key]); collection.objects.link(obj)
    obj.location=(part['x'],-part['z'],part['y']); obj.scale=(part['w'],part['d'],part['h'])
    obj.rotation_euler=(part.get('rx',0),-part.get('rz',0),0)
    if key=='head':
        cig=bpy.data.objects.new('DET_cigarette',templates['cigarette']); collection.objects.link(cig)
        cig.parent=obj

# A separate studio scene, not game lighting; restrained hard shadows for inspection.
bpy.ops.mesh.primitive_plane_add(size=200)
floor=bpy.context.object; floor.name='STUDIO / floor'; floor.data.materials.append(materials[2])
world=bpy.data.worlds.new('DET / studio'); world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs[0].default_value=(.25,.25,.25,1)
background.inputs[1].default_value=.5; scene.world=world
for name,location,power,size in [('key',(-3,4,6),650,3),('rim',(3,-2,4),850,2)]:
    data=bpy.data.lights.new('STUDIO / '+name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(data.name,data); scene.collection.objects.link(obj); obj.location=location
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('STUDIO / portrait'); cam=bpy.data.objects.new(data.name,data); scene.collection.objects.link(cam)
cam.location=(3.3,6,2.6); cam.rotation_euler=(Vector((0,0,1.08))-cam.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'; data.ortho_scale=2.75; scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.render.resolution_x=900; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'artifacts/detective-portrait.png')
for area in bpy.context.screen.areas:
    if area.type=='CONSOLE': area.type='VIEW_3D'
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/detective-noir.blend'),copy=True)
result={'scene':scene.name,'triangles':sum(len(v['positions'])//9 for v in export.values()),'source':str(ROOT/'art/detective-noir.blend')}
