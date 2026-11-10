#!/usr/bin/env python3
"""Bake original responsive art alpha and identical all-platform nine-patch PNGs.

  python3 -I scripts/deck-assets/build-responsive-primitives.py [--check]

Source rendering is separate. No Blender, device, existing asset or approval input is modified.
"""
import argparse,hashlib,io,json,platform,sys
from pathlib import Path
from PIL import Image,ImageDraw,__version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2]
SCENE=ROOT/'docs/deck-design/blender/deck_responsive_primitives.py'
SOURCE=ROOT/'docs/deck-design/renders/responsive-primitives'
OUT=ROOT/'apps/mobile/assets/deck/responsive'
def sha(data):return hashlib.sha256(data).hexdigest()
def encode(image):
 stream=io.BytesIO();image.save(stream,format='PNG',optimize=True);return stream.getvalue()
def sides(value):return{key:value for key in ['top','right','bottom','left']}
def mask_for(p,size):
 ss=4;k=3*ss;pad=p['paddingPt'];w,h=p['contentPt'].values();outset=3
 mask=Image.new('L',(size[0]*ss,size[1]*ss),0);draw=ImageDraw.Draw(mask)
 box=((pad-outset)*k,(pad-outset)*k,(pad+w+outset)*k,(pad+h+outset)*k)
 if p['shape']=='circle':draw.ellipse(box,fill=255)
 else:draw.rounded_rectangle(box,radius=(p['radiusPt']+outset)*k,fill=255)
 return mask.resize(size,Image.Resampling.LANCZOS)
def build(source):
 raw_metadata=(source/'render-metadata.json').read_bytes();meta=json.loads(raw_metadata)
 assert meta['format']==1 and meta['kind']=='responsive-primitives' and meta['pxPerPt']==3
 assert meta['sourceSceneSha256']==sha(SCENE.read_bytes())
 assert meta['parentSceneSha256']==sha((SCENE.parent/'deck_scene.py').read_bytes())
 for approved in meta['approval'].values():
  local=ROOT/approved['file']
  if local.exists():assert sha(local.read_bytes())==approved['sha256'],'Approval input changed after render'
 render=meta['renderer'];assert render['samples']==128 and render['pxPerPt']==3 and render['engine']=='CYCLES' and render['denoising'] is True
 assert render['viewTransform']=='Khronos PBR Neutral' and abs(render['exposure']+.1)<1e-6 and render['movingPartObjects']==0 and render['dialTicks']==32
 images={}
 for name,entry in meta['files'].items():
  data=(source/name).read_bytes();assert sha(data)==entry['sha256'] and len(data)==entry['bytes'];im=Image.open(io.BytesIO(data));assert im.mode=='RGBA' and im.size==(1170,2532) and im.getchannel('A').getextrema()==(255,255);images[name]=im
 phone_bytes=(ROOT/'apps/mobile/assets/deck/manifest.json').read_bytes();phone=json.loads(phone_bytes);assert phone['alphaBaked'] is True and len(phone['sprites'])==32
 reused={}
 for name,p in phone['sprites'].items():
  data=(ROOT/'apps/mobile/assets/deck'/p['file']).read_bytes();assert sha(data)==p['sha256'];reused[name]={'file':'../'+p['file'],'sha256':p['sha256'],'sourceSha256':p['sourceSha256']}
 # Approved compose.Face repeats the upper plain-metal strip; a full chassis falloff is not its skin.
 metal=Image.new('RGBA',(1170,2532));strip=images['metal-raw.png'].crop((0,30,1170,130))
 for y in range(0,2532,100):metal.paste(strip,(0,y))
 files={'metalPlate.png':encode(metal)};sources={};primitives={}
 def entry(image,reference,content,padding):return{'referencePt':reference,'actualPx':{'w':image.width,'h':image.height},'contentRectPt':content,'paddingPt':sides(padding),'capInsetsPt':None}
 primitives['metalPlate']={**entry(metal,{'w':390,'h':844},{'x':0,'y':0,'w':390,'h':844},0),'file':'metalPlate.png','sha256':sha(files['metalPlate.png']),'bytes':len(files['metalPlate.png']),'alphaMode':'opaque','preserveAspect':False,'plateRecipe':{'kind':'approved-metal-strip-repeat','source':'metal-raw.png','sourceRectPx':{'x':0,'y':30,'w':1170,'h':100},'repeatStepPx':100}}
 for name,p in meta['primitives'].items():
  w,h=p['contentPt'].values();pad=p['paddingPt'];reference={'w':w+2*pad,'h':h+2*pad};size=tuple(round(reference[key]*3) for key in ['w','h'])
  cx,cy=p['centerPt'].values();x,y=round((cx-reference['w']/2)*3),round((cy-reference['h']/2)*3)
  image=images['atlas-raw.png'].crop((x,y,x+size[0],y+size[1]));image.putalpha(mask_for(p,size));payload=encode(image)
  source_name=f'{name}-rgba.png';sources[source_name]=payload
  e=entry(image,reference,{'x':pad,'y':pad,'w':w,'h':h},pad)
  e.update(alphaMode='baked-shape',bakedMask={'shape':p['shape'],'radiusPt':p['radiusPt'],'outsetPt':3,'supersample':4,'resample':'LANCZOS'},sourceImage={'file':'docs/deck-design/renders/responsive-primitives/'+source_name,'sha256':sha(payload),'bytes':len(payload)},placement={'reference':'logical-well-rect','padding':'fixed-pt'})
  if p['shape']=='circle':
   filename=name+'.png';files[filename]=payload;e.update(file=filename,sha256=sha(payload),bytes=len(payload),preserveAspect=True,placement={'reference':'control-shortside','contentSidePt':337/3,'paddingScale':'control-shortside / contentSidePt','alignment':'center'})
  else:
   cap=p['capPt'];e['capInsetsPt']=sides(cap);e['patches']=[]
   xs=[0,round((pad+cap)*3),size[0]-round((pad+cap)*3),size[0]];ys=[0,round((pad+cap)*3),size[1]-round((pad+cap)*3),size[1]]
   for row in range(3):
    for col in range(3):
     x0,x1=xs[col:col+2];y0,y1=ys[row:row+2];assert x1>x0 and y1>y0
     patch=image.crop((x0,y0,x1,y1));data=encode(patch);filename=f'{name}.r{row}c{col}.png';files[filename]=data
     e['patches'].append({'row':row,'col':col,'file':filename,'sourceRectPx':{'x':x0,'y':y0,'w':x1-x0,'h':y1-y0},'referencePt':{'w':(x1-x0)/3,'h':(y1-y0)/3},'actualPx':{'w':x1-x0,'h':y1-y0},'sha256':sha(data),'bytes':len(data)})
   if name=='lcdWell':e['placement'].update(outsetPt=sides(0),referenceMeaning='adaptive-outer-well; not the untouched phone nominal LCD')
   if name=='pttWell':e['placement'].update(reference='voice-sprite-rect',contentWidthRatio=342/355,contentHeightRatio=354/366,alignment='center')
  primitives[name]=e
 assert len(files)==39
 provenance={'docs/deck-design/blender/deck_responsive_primitives.py':sha(SCENE.read_bytes()),'docs/deck-design/blender/deck_scene.py':meta['parentSceneSha256'],'scripts/deck-assets/build-responsive-primitives.py':sha(Path(__file__).read_bytes()),'docs/deck-design/renders/responsive-primitives/render-metadata.json':sha(raw_metadata)}
 for name,data in sources.items():provenance['docs/deck-design/renders/responsive-primitives/'+name]=sha(data)
 for name,p in meta['files'].items():provenance['docs/deck-design/renders/responsive-primitives/'+name]=p['sha256']
 manifest={'format':1,'kind':'responsive-primitives','pxPerPt':3,'alphaBaked':True,'approval':meta['approval'],'sourcePhoneManifestSha256':sha(phone_bytes),'reusedPhoneSprites':reused,'primitives':primitives,'renderer':render,'provenance':{'files':provenance},'generator':{'file':'scripts/deck-assets/build-responsive-primitives.py','sha256':sha(Path(__file__).read_bytes()),'python':platform.python_version(),'pillow':pillow_version},'shippingPngCount':39,'ninePatchContract':'capInsetsPt is inside contentRectPt; paddingPt is outside. Outer fixed edge = paddingPt + capInsetsPt. Stretch only middle row/column; compose nine images identically on every OS.'}
 files['manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode();return files,sources
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');p.add_argument('--source',type=Path,default=SOURCE);p.add_argument('--out',type=Path,default=OUT);args=p.parse_args();files,sources=build(args.source)
 for directory,payloads in [(args.source,sources),(args.out,files)]:
  for name,data in payloads.items():
   target=directory/name
   if args.check:assert target.read_bytes()==data,'Stale responsive asset: '+name
   else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 print(json.dumps({'mode':'checked' if args.check else 'built','pngs':39,'primitiveFamilies':7,'reusedPhoneSprites':32}))
