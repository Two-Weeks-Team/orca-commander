"""Optional screenshot helper for the Aside CLI; the preview itself is browser-agnostic.

Only captures the generated localhost pages. Image bytes are copied out of the
browser's temporary session before it closes; unrelated tabs remain untouched.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:53719")
parser.add_argument("--out", required=True)
parser.add_argument("names", nargs="*", default=[])
args = parser.parse_args()
parts = urlsplit(args.url)
if parts.scheme != "http" or parts.hostname not in ("127.0.0.1", "localhost") or parts.username or parts.password:
    parser.error("Only the generated localhost preview may be captured")
names = args.names or ["controller", "controller-ko", "agents", "content", "status", "voice", "tablet", "hero", "anatomy", "social"]
allowed = {"controller", "controller-ko", "agents", "content", "status", "voice", "tablet", "hero", "anatomy", "social"}
if any(name not in allowed for name in names):
    parser.error("Unknown preview name")
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
settle = r"""
await page.evaluate(async()=>{
 const end=performance.now()+12000;
 const documents=()=>{const frames=[...document.querySelectorAll('iframe')];return frames.length?frames.map(f=>f.contentDocument):[document];};
 while(!documents().every(d=>d?.getElementById('preview-root')?.childElementCount>0)){
  if(documents().some(d=>d?.defaultView?.__PREVIEW_ERRORS__?.length))throw Error('Preview error: '+documents().flatMap(d=>d?.defaultView?.__PREVIEW_ERRORS__||[]).join(';'));
  if(performance.now()>end)throw Error('Source preview did not mount');
  await new Promise(requestAnimationFrame);
 }
 const docs=documents();
 await Promise.all(docs.map(d=>d.fonts.ready));
 let changed=performance.now();
 const observers=docs.map(d=>{const o=new MutationObserver(()=>{changed=performance.now();});o.observe(d.getElementById('preview-root'),{subtree:true,childList:true,attributes:true});return o;});
 try{
  while(true){
   const loaded=docs.every(d=>[...d.images].every(i=>i.complete&&i.naturalWidth>0));
   if(loaded&&performance.now()-changed>160)break;
   if(performance.now()>end)throw Error('Layout/images did not settle: '+JSON.stringify({changedAgo:performance.now()-changed,unloaded:docs.flatMap(d=>[...d.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.getAttribute('src')))}));
   await new Promise(requestAnimationFrame);
  }
 }finally{observers.forEach(o=>o.disconnect());}
});
"""
code = []
for name in names:
    suffix = "jpg" if name == "social" else "png"
    width, height = (1280, 640) if name == "social" else (1280, 760) if name == "hero" else (1280, 1120) if name == "anatomy" else (821, 1200) if name == "tablet" else (390, 960)
    url = args.url.rstrip("/") + "/" + name + ".html"
    code.append("var t=await openTab(" + json.dumps(url) + ");try{"
                "await page.setViewportSize({width:" + str(width) + ",height:" + str(height) + "});"
                "console.log((await snapshot(page)).tree);" + settle +
                "console.log((await snapshot(page)).tree);"
                "console.log('META_" + name + " '+JSON.stringify(await page.evaluate(()=>({devicePixelRatio:devicePixelRatio,fonts:document.fonts.status}))));"
                "await page.screenshot({path:'./" + name + "." + suffix + "',type:'" + ("jpeg" if name == "social" else "png") + "'" + (",quality:86" if name == "social" else "") + "});"
                "console.log('CAPTURE_" + name + " '+(await fs.readFile('./" + name + "." + suffix + "')).toString('base64'));"
                "}finally{await closeTab(t);}")
with tempfile.TemporaryDirectory(prefix="orca-commander-capture-") as temp:
    script = Path(temp) / "capture.js"
    script.write_text("\n".join(code))
    result = subprocess.run(["aside", "repl", "--file", str(script)], capture_output=True, text=True, timeout=115)
if result.returncode:
    cleaned = re.sub(r"(CAPTURE_\S+ )[A-Za-z0-9+/=]+", r"\1[image bytes]", result.stdout)
    raise SystemExit(cleaned[-5000:] + result.stderr)
record = []
for name in names:
    match = re.search(r"CAPTURE_" + re.escape(name) + r" ([A-Za-z0-9+/=]+)", result.stdout)
    if not match:
        raise RuntimeError("No image returned for " + name)
    data = base64.b64decode(match[1])
    if name == "social":
        if not data.startswith(b"\xff\xd8"):
            raise RuntimeError("Invalid JPEG")
        offset = 2
        dimensions = None
        while offset < len(data):
            if data[offset] != 255:
                raise RuntimeError("Invalid JPEG marker")
            marker = data[offset + 1]
            size = int.from_bytes(data[offset + 2:offset + 4], "big")
            if marker in (192, 193, 194):
                height, width = struct.unpack(">HH", data[offset + 5:offset + 9])
                dimensions = (width, height)
                break
            offset += 2 + size
        if dimensions is None:
            raise RuntimeError("No JPEG dimensions")
        suffix = "jpg"
    else:
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise RuntimeError("Invalid PNG returned for " + name)
        dimensions = struct.unpack(">II", data[16:24])
        suffix = "png"
    (out / (name + "." + suffix)).write_bytes(data)
    record.append({"file": name + "." + suffix, "width": dimensions[0], "height": dimensions[1], "bytes": len(data)})
    print(name, dimensions, len(data))
(out / "capture-dimensions.json").write_text(json.dumps(record, indent=2) + "\n")
