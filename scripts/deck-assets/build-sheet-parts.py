#!/usr/bin/env python3
"""D30 original PNG crops only. Distribution images are ordinary Git PNGs."""
from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json,re,subprocess,tempfile
root=Path(__file__).resolve().parents[2];out=root/'apps/mobile/assets/deck/sheets';out.mkdir(exist_ok=True)
sources={};files={}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for state in ['up','pressed']:
 src=root/f'apps/mobile/assets/deck/sprites/cmd_{state}.png';im=Image.open(src);sources[str(src.relative_to(root))]=digest(src)
 xs=[0,54,im.width-54,im.width];ys=[0,54,im.height-54,im.height]
 for r in range(3):
  for c in range(3):
   p=out/f'cmd_{state}-{r}{c}.png';im.crop((xs[c],ys[r],xs[c+1],ys[r+1])).save(p,optimize=True);files[p.name]=digest(p)
src=root/'docs/deck-design/renders/sprites_raw/dial.png';sources[str(src.relative_to(root))]=digest(src);im=Image.open(src).convert('RGBA').crop((91,90,246,245));mask=Image.new('L',(620,620));ImageDraw.Draw(mask).ellipse((0,0,620,620),fill=255);im.putalpha(mask.resize(im.size,Image.Resampling.LANCZOS));p=out/'knob.png';im.save(p,optimize=True);files[p.name]=digest(p)
src=root/'docs/deck-design/renders/responsive-primitives/metal-raw.png';sources[str(src.relative_to(root))]=digest(src);p=out/'metal.png';p.write_bytes(src.read_bytes());files[p.name]=digest(p)
# Same 38px microphone vector as approved DeckRecording; recolor only, rasterize at3x.
src=root/'docs/deck-design/canvas-source/DeckRecording.dc.html';sources[str(src.relative_to(root))]=digest(src)
svg=re.search(r'<svg width="38" height="38".*?</svg>',src.read_text()).group(0).replace('#D6243A','#7A8594').replace('width="38" height="38"','width="114" height="114"').replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ')
with tempfile.TemporaryDirectory() as scratch:
 v=Path(scratch)/'mic.svg';v.write_text(svg);png=Path(scratch)/'mic.png';subprocess.run(['sips','-s','format','png',str(v),'--out',str(png)],capture_output=True,check=True);p=out/'mic.png';Image.open(png).convert('RGBA').save(p,optimize=True);files[p.name]=digest(p)
(out/'sources.json').write_text(json.dumps({'recipe':'D30 v3 command nine-slice54px, dial circle crop91,90,246,245, original DeckRecording microphone vector recolored gray and sips rasterized3x','sources':sources,'files':files},indent=2)+'\n')
p=root/'apps/mobile/src/ui/deck/sheet-assets.ts';p.write_text('// Original crops. Regenerate with scripts/deck-assets/build-sheet-parts.py.\nexport const sheetParts={\n'+''.join(" '%s':require('../../../assets/deck/sheets/%s'),\n"%(n,n) for n in files)+'};\n')
print('Wrote',len(files),'distribution PNGs; originals unchanged')
