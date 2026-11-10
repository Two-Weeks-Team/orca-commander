"""Responsive static art, rendered only in an isolated factory-startup Blender process.

  blender -b --factory-startup -P docs/deck-design/blender/deck_responsive_primitives.py -- docs/deck-design/renders/responsive-primitives 128

The existing phone and approved A/B source files are never executed or modified.
Only their helper/material definitions and original lighting recipe are reused.
No moving caps, labels, icons, screws or wordmark are rendered.
"""
import hashlib,json,math,sys
from pathlib import Path

PX_PER_PT=3
PLANE={'w':390,'h':844}
PRIMITIVES={
 'lcdWell':{'contentPt':{'w':366,'h':140},'centerPt':{'x':195,'y':117},'radiusPt':14,'paddingPt':8,'capPt':17,'shape':'rrect'},
 'agentWell':{'contentPt':{'w':110,'h':104},'centerPt':{'x':90,'y':300},'radiusPt':20,'paddingPt':8,'capPt':23,'shape':'rrect'},
 'commandWell':{'contentPt':{'w':110,'h':84},'centerPt':{'x':290,'y':300},'radiusPt':18,'paddingPt':8,'capPt':21,'shape':'rrect'},
 'pttWell':{'contentPt':{'w':114,'h':118},'centerPt':{'x':90,'y':500},'radiusPt':24,'paddingPt':8,'capPt':27,'shape':'rrect'},
 'stickRing':{'contentPt':{'w':337/3,'h':337/3},'centerPt':{'x':290+1/6,'y':500+1/6},'radiusPt':54,'paddingPt':8,'shape':'circle'},
 'dialTicks':{'contentPt':{'w':337/3,'h':337/3},'centerPt':{'x':195+1/6,'y':700+1/6},'radiusPt':54,'paddingPt':8,'shape':'circle'},
}
LIGHTS=[('key',(-4.5,6,9),7,2200,(1,.97,.94)),('fill',(5,-2.5,8),9,420,(.85,.92,1)),('rim',(0,-7,3),5,260,(.9,.95,1))]
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def render(outdir,samples=128):
 import bpy,bmesh
 from mathutils import Vector
 if samples!=128:raise ValueError('Reviewed shipping render requires 128 samples')
 bpy.ops.wm.read_factory_settings(use_empty=True)
 scene=bpy.context.scene;parent=Path(__file__).with_name('deck_scene.py');source=parent.read_text()
 ns=globals()|{'bpy':bpy,'bmesh':bmesh,'Vector':Vector}
 exec(compile(source[source.index('def lin('):source.index('# ---------------------------------------------------------------- layout')],parent.name,'exec'),ns)
 exec(compile(source[source.index('# ---------------------------------------------------------------- materials'):source.index('# ---------------------------------------------------------------- chassis with wells')],parent.name,'exec'),ns)
 rbox,cyl,smooth=ns['rbox'],ns['cyl'],ns['smooth']
 def center(x,y):return((x-PLANE['w']/2)/100,(PLANE['h']/2-y)/100)
 # Original phone chassis dimensions preserve the source Object-coordinate metal grain.
 chassis=rbox('responsive_chassis',4.6,9.2,.5,.05,0,(0,0,-.25),ns['m_chassis'])
 world=bpy.data.worlds.new('W');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.010,.012,.016,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=1;scene.world=world
 aim=bpy.data.objects.new('aim',None);bpy.context.collection.objects.link(aim)
 for name,loc,size,energy,color in LIGHTS:
  light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.size=size;light.color=color
  ob=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(ob);ob.location=loc
  tr=ob.constraints.new('TRACK_TO');tr.target=aim;tr.track_axis='TRACK_NEGATIVE_Z';tr.up_axis='UP_Y'
 camera=bpy.data.cameras.new('cam');camera.lens=100;camera.sensor_fit='HORIZONTAL';camera.sensor_width=36;camera.clip_end=100
 ob=bpy.data.objects.new('cam',camera);bpy.context.collection.objects.link(ob);ob.location=(0,0,3.9*100/36);scene.camera=ob
 scene.render.engine='CYCLES';cycles=scene.cycles;cycles.samples=samples;cycles.use_denoising=True;cycles.max_bounces=8;cycles.transmission_bounces=8;cycles.glossy_bounces=6
 try:cycles.denoiser='OPENIMAGEDENOISE'
 except Exception:pass
 try:
  prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
  for device in prefs.devices:device.use=True
  cycles.device='GPU'
 except Exception:cycles.device='CPU'
 scene.render.resolution_x=1170;scene.render.resolution_y=2532;scene.render.resolution_percentage=100
 scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8';scene.render.image_settings.color_mode='RGBA'
 scene.view_settings.view_transform='Khronos PBR Neutral';scene.view_settings.exposure=-.1
 outdir=Path(outdir);outdir.mkdir(parents=True,exist_ok=True)
 scene.render.filepath=str(outdir/'metal-raw.png');bpy.ops.render.render(write_still=True)
 cutters=[]
 for name,p in PRIMITIVES.items():
  x,y=center(p['centerPt']['x'],p['centerPt']['y']);w,h=p['contentPt'].values()
  if p['shape']=='circle':
   bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.54,depth=.4,location=(x,y,.08));cut=bpy.context.active_object;cut.name='well-'+name
  else:
   floor=-.07 if name=='lcdWell' else -.12
   cut=rbox('well-'+name,w/100,h/100,.4,p['radiusPt']/100,0,(x,y,floor+.2))
  cutters.append(cut)
 bpy.ops.object.select_all(action='DESELECT')
 for cut in cutters:cut.select_set(True)
 bpy.context.view_layer.objects.active=cutters[0];bpy.ops.object.join();joined=bpy.context.active_object
 modifier=chassis.modifiers.new('wells','BOOLEAN');modifier.operation='DIFFERENCE';modifier.object=joined;modifier.solver='EXACT';modifier.use_self=True
 bpy.context.view_layer.objects.active=chassis;bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(joined,do_unlink=True)
 bevel=chassis.modifiers.new('rim','BEVEL');bevel.width=.018;bevel.segments=3;bevel.limit_method='ANGLE';bevel.angle_limit=math.radians(30)
 bpy.context.view_layer.objects.active=chassis;bpy.ops.object.modifier_apply(modifier=bevel.name)
 p=PRIMITIVES['lcdWell'];x,y=center(p['centerPt']['x'],p['centerPt']['y'])
 for name,w,h,depth,z,material,rv,re in [('lcd_bezel_floor',364,138,.02,-.06,ns['m_bezel'],.13,0),('lcd_glass',354,128,.05,-.02,ns['m_glass'],.11,.012)]:rbox(name,w/100,h/100,depth,rv,re,(x,y,z),material)
 p=PRIMITIVES['stickRing'];x,y=center(p['centerPt']['x'],p['centerPt']['y'])
 bpy.ops.mesh.primitive_torus_add(major_radius=.47,minor_radius=.045,location=(x,y,-.045),major_segments=96,minor_segments=24)
 ring=bpy.context.active_object;ring.name='stick_ring';ring.data.materials.append(ns['m_alu']);smooth(ring);cyl('stick_base',.40,.06,(x,y,-.09),ns['m_well'])
 p=PRIMITIVES['dialTicks'];x,y=center(p['centerPt']['x'],p['centerPt']['y'])
 for i in range(32):
  angle=2*math.pi*i/32;length=.10 if i%4==0 else .06
  tick=rbox('dial_tick_'+str(i),.028,length,.02,.012,0,(x+.455*math.cos(angle),y+.455*math.sin(angle),-.075),ns['m_tick']);tick.rotation_euler=(0,0,angle+math.pi/2)
 scene.render.filepath=str(outdir/'atlas-raw.png');bpy.context.view_layer.update();bpy.ops.render.render(write_still=True)
 root=Path(__file__).resolve().parents[3]
 approval={'compose':'claudedocs/previews/2026-11-04-fold8/compose.py','matrix':'claudedocs/previews/2026-11-04-fold8/responsive-matrix-v3.png'}
 approval={key:{'file':relative,'sha256':digest(root/relative)} for key,relative in approval.items()}
 metadata={'format':1,'kind':'responsive-primitives','pxPerPt':3,'planePt':PLANE,'primitives':PRIMITIVES,'approval':approval,'sourceScene':'docs/deck-design/blender/deck_responsive_primitives.py','sourceSceneSha256':digest(__file__),'parentScene':'docs/deck-design/blender/deck_scene.py','parentSceneSha256':digest(parent),'renderer':{'blender':bpy.app.version_string,'engine':'CYCLES','device':cycles.device,'samples':samples,'pxPerPt':3,'denoising':True,'viewTransform':scene.view_settings.view_transform,'exposure':scene.view_settings.exposure,'movingPartObjects':0,'dialTicks':32,'stickRings':1,'lights':LIGHTS},'files':{name:{'sha256':digest(outdir/name),'bytes':(outdir/name).stat().st_size,'px':{'w':1170,'h':2532}} for name in ['metal-raw.png','atlas-raw.png']}}
 (outdir/'render-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
 print('RESPONSIVE_PRIMITIVES_DONE',len(PRIMITIVES),'128 samples; isolated source only')
if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
 render(args[0],int(args[1]) if len(args)>1 else 128)
