import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),require=createRequire(import.meta.url);
const index=process.argv.indexOf('--out');
if(index<0||!process.argv[index+1])throw Error('Use --out /absolute/path/outside-the-repository');
const out=path.resolve(process.argv[index+1]);if(out===root||out.startsWith(root+path.sep))throw Error('Output must be outside the repository');
mkdirSync(out,{recursive:true});
const aliasPlugin={name:'documentation-only-platform',setup(b){
 b.onResolve({filter:/^react-native$/},()=>({path:path.join(here,'native.jsx')}));
 b.onResolve({filter:/^expo-image$/},()=>({path:path.join(here,'image.jsx')}));
 b.onResolve({filter:/^react-native-safe-area-context$/},()=>({path:path.join(here,'safe-area.jsx')}));
 b.onResolve({filter:/\/i18n\/provider$/},()=>({path:path.join(here,'messages.jsx')}));
 b.onResolve({filter:/\/adapters\/deck-feedback$/},()=>({path:path.join(here,'feedback.mjs')}));
 b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:require.resolve(args.path)}));
 b.onResolve({filter:/^react-dom(?:\/.*)?$/},args=>({path:require.resolve(args.path)}));
}};
const result=await build({absWorkingDir:root,entryPoints:[path.join(here,'viewer.jsx')],outdir:out,entryNames:'viewer',assetNames:'assets/[name]-[hash]',bundle:true,format:'esm',minify:true,metafile:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"',global:'globalThis'},loader:{'.png':'file','.ttf':'file'},plugins:[aliasPlugin]});
const entries=[['controller','en',390,844,'controller','Controller'],['controller-ko','ko',390,844,'controller','Controller'],['agents','en',390,844,'list','Agent list'],['content','en',390,844,'content','Full content'],['status','en',390,844,'status','Connection & usage'],['voice','en',390,844,'recording','Voice draft'],['tablet','en',821,1088,'controller','Wide controller']];
const screens=entries.map(([name,locale,width,height,kind,label])=>({name,file:name+'.html',locale,viewport:{width,height},kind,label}));
for(const s of screens){
 const css='*{box-sizing:border-box}html,body{margin:0;background:#0a0d12;color:#acbbb5;font-family:system-ui,sans-serif}.chrome{height:42px;padding:12px 16px;font:11px/18px ui-monospace,monospace;display:flex;justify-content:space-between;gap:10px}.stamp{padding:12px 16px;border-top:1px solid #24362d;font:10px/15px ui-monospace,monospace}.viewport{position:relative;overflow:hidden;isolation:isolate}.raw .chrome,.raw .stamp{display:none}';
 writeFileSync(path.join(out,s.file),'<!doctype html><html lang="'+s.locale+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orca Commander — '+s.label+'</title><style>'+css+'</style></head><body><script>window.__PREVIEW_ERRORS__=[];addEventListener("error",e=>window.__PREVIEW_ERRORS__.push(String(e.error?.stack||e.message)));addEventListener("unhandledrejection",e=>window.__PREVIEW_ERRORS__.push(String(e.reason)));if(location.search.includes("raw"))document.body.className="raw"</script><header class="chrome"><span>ORCA COMMANDER</span><span>'+s.label+' / '+s.locale.toUpperCase()+'</span></header><main id="preview-root" class="viewport" style="width:'+s.viewport.width+'px;height:'+s.viewport.height+'px;display:flex"></main><footer class="stamp">SOURCE UI PREVIEW · SYNTHETIC DATA<br>React Native Web · no host · not a native capture</footer><script id="preview-config" type="application/json">'+JSON.stringify(s)+'</script><script type="module" src="viewer.js"></script></body></html>');
}
writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Orca Commander source previews</title><style>body{background:#101a15;color:#eee;font:18px system-ui;padding:40px}a{display:block;color:#a7edaa;margin:20px 0}</style><h1>Orca Commander</h1><p>Real source components on React Native Web. Synthetic data; no host connection.</p>'+screens.map(s=>'<a href="'+s.file+'">'+s.label+' / '+s.locale.toUpperCase()+' / '+s.viewport.width+'×'+s.viewport.height+'</a>').join(''));
// The hero is editorial composition around the same actual source previews.
const hero=readFileSync(path.join(here,'hero.html'),'utf8');
writeFileSync(path.join(out,'hero.html'),hero);
const socialCss='.social .hero{height:640px}.social .copy{top:36px}.social .rule{margin:20px 0}.social .name{font-size:52px}.social .tag{font-size:24px;margin:18px 0}.social .detail{font-size:15px}.social .pills{margin-top:24px}.social .one{top:38px;transform:scale(.63)}.social .two{left:958px;top:143px;transform:scale(.49)}.social .marker{top:604px}.social .bottom{bottom:24px}';
writeFileSync(path.join(out,'social.html'),hero.replace('<body>','<body class="social">').replace('</style>',socialCss+'</style>'));
writeFileSync(path.join(out,'anatomy.html'),readFileSync(path.join(here,'anatomy.html'),'utf8'));
const sourceInputs=Object.keys(result.metafile.inputs).filter(p=>!p.includes('node_modules/')).map(p=>{const file=path.resolve(root,p),rel=path.relative(root,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Unexpected external source');return {file:rel.split(path.sep).join('/'),sha256:createHash('sha256').update(readFileSync(file)).digest('hex')};}).sort((a,b)=>a.file.localeCompare(b.file));
const editorFiles=['generate.mjs','capture.py','serve.py','hero.html','anatomy.html','package.json','package-lock.json'].map(name=>({file:'scripts/showcase/'+name,sha256:createHash('sha256').update(readFileSync(path.join(here,name))).digest('hex')}));
for(const input of sourceInputs)if(input.file.startsWith('apps/mobile/src/adapters/')&&input.file!=='apps/mobile/src/adapters/usage.ts')throw Error('Unexpected live adapter in preview: '+input.file);
const provenance={schema:1,kind:'source-components-on-react-native-web',runtimeSourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),fixtureClock:'2026-11-11T09:00:00.000Z',data:'synthetic tasks, identities, percentages, voice text and connection labels; no host connected',limitations:['React Native Web preview, not an iOS/Android capture or device acceptance','Native storage, transport, speech and haptics are replaced or not imported','No action client; host-action callbacks are inert; local layout/scroll runs; voice transcript and usage are fixtures'],tooling:JSON.parse(readFileSync(path.join(here,'package.json'),'utf8')).dependencies,screens,sourceInputs,editorFiles};
writeFileSync(path.join(out,'preview-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log('Built '+screens.length+' React Native Web source previews, '+sourceInputs.length+' source/artwork inputs and hero.');
