#!/usr/bin/env python3
"""Copy approved Fold background renders and bind the unchanged phone sprites."""
import argparse,hashlib,importlib.util,io,json,platform
from pathlib import Path
from PIL import Image,__version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2]
SCENE=ROOT/'docs/deck-design/blender/deck_approved_faces.py'
spec=importlib.util.spec_from_file_location('approved_geometry',SCENE)
approved=importlib.util.module_from_spec(spec);spec.loader.exec_module(approved)
def sha(data):return hashlib.sha256(data).hexdigest()
def build(face):
 source=ROOT/f'docs/deck-design/renders/fold-approved-{face}'
 raw_metadata=(source/'render-metadata.json').read_bytes();metadata=json.loads(raw_metadata)
 geometry=approved.geometry(face);W,H=geometry['basePt'].values()
 assert metadata['basePt']==geometry['basePt'] and metadata['layout']==geometry['layout'] and metadata['spriteRectsPt']==geometry['spriteRectsPt']
 assert metadata['pxPerPt']==3 and metadata['scale']==1 and metadata['samples']==128 and metadata['engine']=='CYCLES'
 assert metadata['sourceSceneSha256']==sha(SCENE.read_bytes())
 assert metadata['parentSceneSha256']==sha(SCENE.with_name('deck_scene.py').read_bytes())
 assert metadata['sourceComposeSha256']==approved.APPROVED_COMPOSE_SHA256 and metadata['approvedPreviewSha256']==approved.APPROVED_PREVIEWS[face]
 assert metadata['movingPartObjects']==metadata['additionalScrews']==metadata['wordmarks']==0
 assert metadata['wellCount']==len(geometry['layout']['agentSlotsPt'])+len(geometry['layout']['cmdSlotsPt'])+4
 assert metadata['staticControls']=={'stickRings':1,'dialTicks':32}
 base=(source/'base.png').read_bytes();image=Image.open(io.BytesIO(base))
 assert image.mode=='RGBA' and image.size==(round(W*3),round(H*3)) and image.getchannel('A').getextrema()==(255,255)
 assert sha(base)==metadata['baseSha256'] and len(base)==metadata['baseBytes']
 raw_phone=(ROOT/'apps/mobile/assets/deck/manifest.json').read_bytes();phone=json.loads(raw_phone)
 assert phone['alphaBaked'] is True and len(phone['sprites'])==32
 sprites={}
 for name,entry in phone['sprites'].items():
  data=(ROOT/'apps/mobile/assets/deck'/entry['file']).read_bytes();assert sha(data)==entry['sha256']
  sprites[name]={'file':'../'+entry['file'],'sha256':entry['sha256'],'sourceSha256':entry['sourceSha256'],'bytes':len(data),'bakedMask':entry['bakedMask'],'sourcePx':entry['px']}
 manifest={'format':1,'face':face,'basePt':geometry['basePt'],'pxPerPt':3,'alphaBaked':True,
  'base':{'file':'base.png','px':{'w':image.width,'h':image.height},'bytes':len(base),'sha256':sha(base),'sourceSha256':sha(base)},
  'layout':geometry['layout'],'spriteRectsPt':geometry['spriteRectsPt'],
  'source':f'docs/deck-design/renders/fold-approved-{face}','sourceRenderMetadataSha256':sha(raw_metadata),
  'sourceComposeSha256':approved.APPROVED_COMPOSE_SHA256,'approvedPreviewSha256':approved.APPROVED_PREVIEWS[face],
  'sourceBlenderScriptSha256':metadata['sourceSceneSha256'],'parentBlenderScriptSha256':metadata['parentSceneSha256'],
  'sourcePhoneManifestSha256':sha(raw_phone),'reusedPhoneSprites':sprites,
  'renderer':{key:metadata[key] for key in ['blender','engine','device','samples','denoising','viewTransform','exposure','wellCount','staticControls','movingPartObjects','additionalScrews','wordmarks']},
  'generator':{'file':'scripts/deck-assets/build-approved-faces.py','sha256':sha(Path(__file__).read_bytes()),'python':platform.python_version(),'pillow':pillow_version}}
 return {'base.png':base,'manifest.json':(json.dumps(manifest,indent=2)+'\n').encode()}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');p.add_argument('--out',type=Path,default=ROOT/'apps/mobile/assets/deck');args=p.parse_args()
 packs={face:build(face) for face in approved.CANONICAL}
 for face,files in packs.items():
  for name,data in files.items():
   path=args.out/f'fold-{face}'/name
   if args.check:assert path.read_bytes()==data,f'Stale approved background: {path}'
   else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
  print(json.dumps({'face':face,'mode':'checked' if args.check else 'built','files':len(files),'newSprites':0,'reusedPhoneSprites':32,'baseBytes':len(files['base.png'])}))
