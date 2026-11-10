"""Background-only Fold faces; approved wide()/stretched() geometry, in dp.

Run only in a new isolated Blender background process:
  blender -b --factory-startup -P deck_approved_faces.py -- inner OUTDIR 128
  blender -b --factory-startup -P deck_approved_faces.py -- cover OUTDIR 128

No caps, moving controls, labels, screws or wordmark are rendered. The existing
phone sprites are reused without changing their bytes. Importing this module
outside Blender exposes only the pure geometry contract.
"""
import hashlib,json,math,sys
from pathlib import Path

APPROVED_COMPOSE_SHA256='dceb6e543a0bd5698bff7c8df7e256152e0a7e18244101649a9de77dc63b1ad4'
APPROVED_PREVIEWS={
 'inner':'0891ee720ad5f5a90250a553788fc5539d502a62396d9f63d1e3b74f682d4dc8',
 'cover':'391667600bf183ba57238bceaf3ab895ae1a56745b35ee4a659ecc40f09629da',
}
CANONICAL={'inner':(821.3,1088.0),'cover':(554.7,876.4)}
def rect(x,y,w,h):return {'x':x,'y':y,'w':w,'h':h}
def control_rects(x,y,w,size):
 gap=(w-3*size)/2
 return {'stick':rect(x,y,size,size),'ptt':rect(x+size+gap,y-size*.02,size*1.05,size*1.08),'dial':rect(x+2*(size+gap),y,size,size)}
def geometry(face,w_dp=None,h_dp=None):
 """Exact approved float expressions; never round the layout to display labels."""
 cw,ch=CANONICAL[face];w_dp=cw if w_dp is None else w_dp;h_dp=ch if h_dp is None else h_dp
 top,bottom,m=34,20,16;inner=w_dp-2*m
 if face=='inner':
  g=10;k=(inner-2*g-16-g)/(3+2*.9);b=k*.9;avail=h_dp-top-bottom
  ctl=min(180,avail*.17);kh=min(k*1.15,(avail*.80-ctl-16-30-24-2*g)/3)
  lcd_h=avail-ctl-16-30-24-2*g-3*kh;rows_h=3*kh+2*g;y0=top+lcd_h+16
  agents=[rect(m+(i%3)*(k+g),y0+(i//3)*(kh+g),k,kh) for i in range(9)]
  bx=m+3*k+2*g+16
  commands=[rect(bx+(i%2)*(b+g),y0+(i//2)*(kh+g),b,kh) for i in range(6)]
  controls=control_rects(m+24,y0+rows_h+30+(h_dp-bottom-(y0+rows_h+30)-ctl)/2,inner-48,ctl)
 else:
  g=12;s=(h_dp-top-bottom)/800;kw=(inner-2*g)/3;kh=104*s;ch=84*s;size=104*s
  used=130*s+18*s+2*kh+16*s+44*s+2*ch+16*s+24*s+size+8
  lcd_h=130*s+max(0,(h_dp-top-bottom)-used);y0=top+lcd_h+18*s
  agents=[rect(m+(i%3)*(kw+g),y0+(i//3)*(kh+16*s),kw,kh) for i in range(6)]
  yc=y0+2*kh+16*s+44*s
  commands=[rect(m+(i%3)*(kw+g),yc+(i//3)*(ch+16*s),kw,ch) for i in range(6)]
  controls=control_rects(m+20,h_dp-bottom-size-8,inner-40,size)
 layout={'agentSlotsPt':agents,'cmdSlotsPt':commands,'status':rect(m,top,inner,lcd_h),**controls}
 sprites={'agentSlotsPt':[rect(r['x']-r['w']*.04,r['y']-r['h']*.04,r['w']*1.08,r['h']*1.1) for r in agents],
          'cmdSlotsPt':[rect(r['x']-r['w']*.04,r['y']-r['h']*.05,r['w']*1.08,r['h']*1.12) for r in commands],**controls}
 return {'basePt':{'w':w_dp,'h':h_dp},'layout':layout,'spriteRectsPt':sprites}

def render(face,outdir,samples=128,scale=1.0):
 import bpy,bmesh
 from mathutils import Vector
 bpy.ops.wm.read_factory_settings(use_empty=True)
 scene=bpy.context.scene
 parent=Path(__file__).with_name('deck_scene.py');source=parent.read_text()
 # Reuse the original helpers/material nodes verbatim; never execute its scene,
 # factory reset, moving parts, render mode, or output-writing module body.
 ns=globals()|{'bpy':bpy,'bmesh':bmesh,'Vector':Vector}
 exec(compile(source[source.index('def lin('):source.index('# ---------------------------------------------------------------- layout')],str(parent),'exec'),ns)
 exec(compile(source[source.index('# ---------------------------------------------------------------- materials'):source.index('# ---------------------------------------------------------------- chassis with wells')],str(parent),'exec'),ns)
 rbox,cyl,smooth=ns['rbox'],ns['cyl'],ns['smooth'];g=geometry(face);W,H=g['basePt'].values();layout=g['layout']
 def center(r):return ((r['x']+r['w']/2-W/2)/100,(H/2-r['y']-r['h']/2)/100)
 chassis=rbox('chassis',(W+100)/100,(H+100)/100,.5,.05,0,(0,0,-.25),ns['m_chassis'])
 cutters=[];well_records=[]
 def well(name,r,radius,reference=(110,104),floor=-.12):
  x,y=center(r);rw,rh=reference
  c=rbox(name,rw/100,rh/100,.4,radius/100,0,(x,y,floor+.2))
  c.scale.x=r['w']/rw;c.scale.y=r['h']/rh;cutters.append(c);well_records.append({'name':name,'rect':r})
 status=layout['status'];well('well-lcd',status,14,(366,140),-.07)
 for i,r in enumerate(layout['agentSlotsPt']):well(f'well-agent-{i}',r,20)
 for i,r in enumerate(layout['cmdSlotsPt']):well(f'well-command-{i}',r,18,(110,84))
 p=layout['ptt'];cx,cy=p['x']+p['w']/2,p['y']+p['h']/2
 # Source phone PTT well is 114x118dp within its 355x366px crop.
 pwell=rect(cx-p['w']*342/355/2,cy-p['h']*354/366/2,p['w']*342/355,p['h']*354/366)
 well('well-ptt',pwell,24,(114,118))
 for name in ['stick','dial']:
  r=layout[name];x,y=center(r);u=r['w']/(337/3)
  bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.54*u,depth=.4,location=(x,y,.08));c=bpy.context.active_object;c.name='well-'+name;cutters.append(c)
  well_records.append({'name':'well-'+name,'rect':r})
 bpy.ops.object.select_all(action='DESELECT')
 for c in cutters:c.select_set(True)
 bpy.context.view_layer.objects.active=cutters[0];bpy.ops.object.join();cut=bpy.context.active_object
 md=chassis.modifiers.new('wells','BOOLEAN');md.operation='DIFFERENCE';md.object=cut;md.solver='EXACT';md.use_self=True
 bpy.context.view_layer.objects.active=chassis;bpy.ops.object.modifier_apply(modifier=md.name);bpy.data.objects.remove(cut,do_unlink=True)
 bv=chassis.modifiers.new('rim','BEVEL');bv.width=.018;bv.segments=3;bv.limit_method='ANGLE';bv.angle_limit=math.radians(30)
 bpy.context.view_layer.objects.active=chassis;bpy.ops.object.modifier_apply(modifier=bv.name)
 # Original bezel/glass proportions within the approved outer LCD rectangle.
 x,y=center(status)
 for name,w,h,depth,z,mat,rv,re in [('lcd_bezel_floor',364,138,.02,-.06,ns['m_bezel'],.13,0),('lcd_glass',354,128,.05,-.02,ns['m_glass'],.11,.012)]:
  ob=rbox(name,w/100,h/100,depth,rv,re,(x,y,z),mat);ob.scale.x=status['w']/366;ob.scale.y=status['h']/140
 # Static ring and dial ticks only. Moving dome/knob/PTT/caps come exclusively
 # from the unchanged existing phone sprites at spriteRectsPt destinations.
 r=layout['stick'];x,y=center(r);u=r['w']/(337/3)
 bpy.ops.mesh.primitive_torus_add(major_radius=.47*u,minor_radius=.045*u,location=(x,y,-.045),major_segments=96,minor_segments=24)
 ring=bpy.context.active_object;ring.name='stick_ring';ring.data.materials.append(ns['m_alu']);smooth(ring)
 cyl('stick_base',.40*u,.06,(x,y,-.09),ns['m_well'])
 r=layout['dial'];x,y=center(r);u=r['w']/(337/3)
 for i in range(32):
  a=2*math.pi*i/32;length=(.10 if i%4==0 else .06)*u
  tick=rbox(f'dial_tick_{i}',.028*u,length,.02,.012*u,0,(x+.455*u*math.cos(a),y+.455*u*math.sin(a),-.075),ns['m_tick']);tick.rotation_euler=(0,0,a+math.pi/2)
 world=bpy.data.worlds.new('W');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.010,.012,.016,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=1;scene.world=world
 aim=bpy.data.objects.new('aim',None);bpy.context.collection.objects.link(aim)
 for name,loc,size,energy,color in [('key',(-4.5,6,9),7,2200,(1,.97,.94)),('fill',(5,-2.5,8),9,420,(.85,.92,1)),('rim',(0,-7,3),5,260,(.9,.95,1))]:
  ld=bpy.data.lights.new(name,'AREA');ld.energy=energy;ld.size=size;ld.color=color;ob=bpy.data.objects.new(name,ld);bpy.context.collection.objects.link(ob);ob.location=loc
  tr=ob.constraints.new('TRACK_TO');tr.target=aim;tr.track_axis='TRACK_NEGATIVE_Z';tr.up_axis='UP_Y'
 cam=bpy.data.cameras.new('cam');cam.lens=100;cam.sensor_fit='HORIZONTAL';cam.sensor_width=36;cam.clip_end=100
 camob=bpy.data.objects.new('cam',cam);bpy.context.collection.objects.link(camob);camob.location=(0,0,(W/100)*100/36);scene.camera=camob
 scene.render.engine='CYCLES';cy=scene.cycles;cy.samples=samples;cy.use_denoising=True;cy.max_bounces=8;cy.transmission_bounces=8;cy.glossy_bounces=6
 try:cy.denoiser='OPENIMAGEDENOISE'
 except Exception:pass
 try:
  prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
  for device in prefs.devices:device.use=True
  cy.device='GPU'
 except Exception:cy.device='CPU'
 scene.render.resolution_x=round(W*3*scale);scene.render.resolution_y=round(H*3*scale);scene.render.resolution_percentage=100
 scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8';scene.render.image_settings.color_mode='RGBA'
 scene.view_settings.view_transform='Khronos PBR Neutral';scene.view_settings.exposure=-.1
 outdir=Path(outdir);outdir.mkdir(parents=True,exist_ok=True);path=outdir/'base.png';scene.render.filepath=str(path)
 bpy.context.view_layer.update()
 metadata={'format':1,'face':face,**g,'pxPerPt':3,'scale':scale,'px':{'w':scene.render.resolution_x,'h':scene.render.resolution_y},'blender':bpy.app.version_string,'engine':'CYCLES','device':cy.device,'samples':samples,'denoising':True,'viewTransform':scene.view_settings.view_transform,'exposure':scene.view_settings.exposure,'wellCount':len(well_records),'wells':well_records,'staticControls':{'stickRings':1,'dialTicks':32},'movingPartObjects':0,'additionalScrews':0,'wordmarks':0,'sourceComposeSha256':APPROVED_COMPOSE_SHA256,'approvedPreviewSha256':APPROVED_PREVIEWS[face],'sourceSceneSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'parentSceneSha256':hashlib.sha256(parent.read_bytes()).hexdigest()}
 bpy.ops.render.render(write_still=True)
 metadata['baseSha256']=hashlib.sha256(path.read_bytes()).hexdigest();metadata['baseBytes']=path.stat().st_size
 (outdir/'render-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
 print('APPROVED_BACKGROUND_DONE',face,str(path),metadata['px'])
 return metadata

if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
 if args and args[0]=='--geometry':print(json.dumps({name:geometry(name) for name in CANONICAL},indent=2))
 else:render(args[0],args[1],int(args[2]) if len(args)>2 else 128,float(args[3]) if len(args)>3 else 1)
