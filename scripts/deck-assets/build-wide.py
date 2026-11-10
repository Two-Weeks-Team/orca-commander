#!/usr/bin/env python3
"""Bake the wide portrait Cycles crops with the original phone skin's 4x alpha pipeline."""
import argparse,hashlib,importlib.util,io,json,platform
from pathlib import Path
from PIL import Image,__version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'docs/deck-design/renders/wide-portrait'
OUT=ROOT/'apps/mobile/assets/deck/wide'
spec=importlib.util.spec_from_file_location('phone_skin',Path(__file__).with_name('build.py'))
phone=importlib.util.module_from_spec(spec);spec.loader.exec_module(phone)
phone.MASKS={**phone.MASKS,'agent':('rrect',328,340,60),'cmd':('rrect',208,340,54)}
def sha(b):return hashlib.sha256(b).hexdigest()
def build():
 raw_manifest=(SOURCE/'sprites_raw/manifest.json').read_bytes();m=json.loads(raw_manifest)
 assert m['pxPerPt']==3 and m['basePt']=={'w':624,'h':784}
 assert list(m['sprites'])==phone.EXPECTED_NAMES
 base=(SOURCE/'base.png').read_bytes();im=Image.open(io.BytesIO(base)).convert('RGBA')
 assert im.size==(1872,2352) and im.getchannel('A').getextrema()==(255,255)
 files={'base.png':base};sprites={}
 for name,entry in m['sprites'].items():
  raw=(SOURCE/'sprites_raw'/entry['file']).read_bytes();image=Image.open(io.BytesIO(raw)).convert('RGBA');px=entry['px']
  assert image.size==(px['w'],px['h']) and image.getchannel('A').getextrema()==(255,255)
  family=name.split('_')[0];mask=phone.mask_for(family,image.size);assert mask.getextrema()==(0,255)
  image.putalpha(mask);buf=io.BytesIO();image.save(buf,format='PNG',optimize=True);data=buf.getvalue();file='sprites/'+entry['file'];files[file]=data
  shape,w,h,r=phone.MASKS[family]
  sprites[name]={**entry,'file':file,'sourceFile':'renders/wide-portrait/sprites_raw/'+entry['file'],'sourceSha256':sha(raw),'sha256':sha(data),'bytes':len(data),'bakedMask':{'shape':shape,'w':w,'h':h,'radiusPx':r,'supersample':4}}
 def place(name,cx,cy):
  p=m['sprites'][name]['px'];return {'x':round(cx*3)-p['w']//2,'y':round(cy*3)-p['h']//2,'w':p['w'],'h':p['h']}
 places={'agentSlots':[place('agent_amber_up',x+50,y+52) for x,y in m['layout']['agentSlotsPt']],
 'cmdSlots':[place('cmd_up',x+30,y+52) for x,y in m['layout']['cmdSlotsPt']],
 'ptt':place('ptt_up',312,682),'stick':place('stick_center',102,682),'dial':place('dial',522,682)}
 for group in places.values():
  for p in group if isinstance(group,list) else [group]:assert 0<=p['x']<p['x']+p['w']<=1872 and 0<=p['y']<p['y']+p['h']<=2352
 assert len(places['agentSlots'])==12 and len(places['cmdSlots'])==6
 m.update(format=1,source='docs/deck-design',alphaBaked=True,sprites=sprites,placementsPx=places,
 base={'file':'base.png','px':{'w':1872,'h':2352},'sha256':sha(base),'sourceSha256':sha(base),'bytes':len(base)},
 sourceManifestSha256=sha(raw_manifest),sourceBlenderScriptSha256=sha((ROOT/'docs/deck-design/blender/deck_wide_scene.py').read_bytes()),
 parentBlenderScriptSha256=sha((ROOT/'docs/deck-design/blender/deck_scene.py').read_bytes()),
 generator={'file':'scripts/deck-assets/build-wide.py','sha256':sha(Path(__file__).read_bytes()),'alphaPipelineSha256':sha(Path(__file__).with_name('build.py').read_bytes()),'python':platform.python_version(),'pillow':pillow_version})
 files['manifest.json']=(json.dumps(m,indent=2)+'\n').encode();return files
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');p.add_argument('--out',type=Path,default=OUT);args=p.parse_args();files=build()
 for name,data in files.items():
  dest=args.out/name
  if args.check:assert dest.read_bytes()==data,f'Stale wide skin {name}'
  else:dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 print(json.dumps({'mode':'checked' if args.check else 'built','files':len(files),'sprites':32,'keys':12,'pngBytes':sum(len(v) for k,v in files.items() if k.endswith('.png'))}))
