import assert from 'node:assert/strict';
import {renderer} from './helpers/deck-sheet-render.mjs';
for(const locale of ['ko','en']){
 const packs={subscribe(){},getSnapshot:()=>({packs:[],phase:'ready',locales:[],writable:true,busy:false})};
 const h=renderer(locale,411,891,1.1,{'../../i18n/installed-packs':{languagePacks:packs},'./language-packs':{LanguagePacks:()=>null},'./reply-speech-settings':{ReplySpeechSettings:()=>null}});
 const skin=h.load('src/ui/deck/sheet-controls.tsx');skin.SheetSkinContext.current=true;
 const {Customize}=h.load('src/ui/deck/customize.tsx'),nodes=h.walk(h.render(Customize,{}));
 assert.equal(nodes.some(n=>n.type==='Image'&&String(n.props.source).endsWith('knob.png')),true,'click sound uses original metal knob, not flat switch text');
 const groups=nodes.filter(n=>n.props.accessibilityRole==='radiogroup');assert.equal(groups.length,2,'language and mode physical choice rows');
 const radios=nodes.filter(n=>n.props.accessibilityRole==='radio');assert.equal(radios.length,6,'only built-in languages and modes, no fictional installed Japanese pack');
 const english=radios.find(n=>n.props.accessibilityLabel===h.t('set.english'));assert.ok(english);english.props.onPress();assert.deepEqual(JSON.parse(JSON.stringify(h.updates)),[{language:'en'}]);
 for(const n of nodes.filter(n=>n.type==='Text'))assert.equal(n.props.maxFontSizeMultiplier,1.5);
}
console.log('PASS: D30 settings physical selection/toggle and exact preference callback');
