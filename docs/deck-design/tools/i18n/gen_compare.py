import sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from strings import ROWS, LANGS
from fit import width, CHECKS, IDX, BY

OUT = sys.argv[1]

FONT = {'en': "'Noto Sans KR'", 'ko': "'Noto Sans KR'", 'ja': "'Noto Sans JP','Noto Sans KR'", 'zh': "'Noto Sans SC','Noto Sans KR'"}
TAG = {'en': ('내장', '#8BE8AE', '#10301F', '#2F6B49'), 'ko': ('내장', '#8BE8AE', '#10301F', '#2F6B49'),
       'ja': ('샘플 팩 · 검수 전', '#FFD27A', '#2B1F08', '#7A5A1A'), 'zh': ('샘플 팩 · 검수 전', '#FFD27A', '#2B1F08', '#7A5A1A')}


def s(key, lang, **kw):
    t = BY[key][IDX[lang]]
    for k, v in kw.items():
        t = t.replace('{' + k + '}', str(v))
    return t


def over(key, lang, size, use):
    return width(BY[key][IDX[lang]], size) > use


ICON = {
 'allow': '<polyline points="5 12.5 10 17.5 19 7.5"/>',
 'reject': '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
 'content': '<path d="M7 3.5h7l4 4V20.5H7z"/><line x1="9.5" y1="12" x2="15.5" y2="12"/><line x1="9.5" y1="15.5" x2="15.5" y2="15.5"/>',
 'input': '<rect x="3.5" y="6.5" width="17" height="11" rx="2.5"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="7" y1="10.5" x2="7.8" y2="10.5"/><line x1="10.5" y1="10.5" x2="11.3" y2="10.5"/><line x1="14" y1="10.5" x2="14.8" y2="10.5"/>',
 'next': '<polyline points="6 7 11 12 6 17"/><polyline points="13 7 18 12 13 17"/>',
 'list': '<line x1="8" y1="7" x2="20" y2="7"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="17" x2="20" y2="17"/><circle cx="4.5" cy="7" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17" r="1"/>',
 'session': '<polyline points="4 12.5 8 16.5 15 8.5"/><polyline points="10 16.5 11 17.5 20 7.5"/>',
 'stop': '<rect x="6" y="6" width="12" height="12" rx="2"/>',
 'send': '<line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
 'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><line x1="12" y1="18" x2="12" y2="21.5"/>',
}


def svg(name, size=24, sw=2.4):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[name]}</svg>')


def flag(is_over):
    return '<span class="ov" title="폭 초과 추정 → 줄바꿈">↵</span>' if is_over else ''


def column(lang, name, tagcode):
    t = TAG[lang]
    L = lambda k, **kw: s(k, lang, **kw)
    O = lambda k, size, use: over(k, lang, size, use)

    def key(icon, k, color='#F4F7FB', badge=''):
        return (f'<div class="ck" style="color:{color}">{badge}{svg(icon, 26, 2.4)}<span class="lbl">{L(k)}</span>{flag(O(k, 15, 100))}</div>')

    keys = ''.join([
        key('allow', 'cmd.allow'), key('reject', 'cmd.reject'), key('content', 'cmd.content'),
        key('input', 'cmd.input'),
        key('next', 'cmd.next', '#FFB020', '<span class="cb">3</span>'),
        key('list', 'cmd.list', '#F4F7FB', '<span class="cb" style="color:#C9D2DE">22</span>'),
    ])
    states = ''.join(
        f'<span class="sc"><i style="background:{c}"></i>{L(k)}</span>'
        for k, c in [('state.permission', '#FFB020'), ('state.question', '#FFB020'), ('state.review', '#C9B6FF'),
                     ('state.working', '#7CC0FF'), ('state.done', '#74E0A0'), ('state.failed', '#FF7A8A'),
                     ('state.idle', '#8794A6'), ('state.unknown', '#8794A6')])
    return f'''
<section class="col" lang="{tagcode}" style="font-family:{FONT[lang]},system-ui,sans-serif">
<header><span class="en">{name}</span><span class="code">{tagcode}</span><span class="tg" style="color:{t[1]};background:{t[2]};border-color:{t[3]}">{t[0]}</span></header>

<div class="sl">명령 키 (110 × 84)</div>
<div class="keys">{keys}</div>

<div class="sl">푸시투토크 키 (102 × 106)</div>
<div class="ptt">{svg('mic', 34, 2.3)}<span class="lbl" style="font-size:13px">{L('ptt.hold')}</span>{flag(O('ptt.hold', 13, 90))}</div>

<div class="sl">내용 시트 버튼</div>
<div class="g2">
<div class="cap lt">{svg('allow', 26, 2.8)}<span class="lbl">{L('cmd.allow')}</span></div>
<div class="cap">{svg('reject', 26, 2.8)}<span class="lbl">{L('cmd.reject')}</span></div>
<div class="cap am"><span class="warn">{L('req.wideScope')}</span>{svg('session', 26)}<span class="lbl">{L('req.allowSession')}</span>{flag(O('req.allowSession', 15, 138))}</div>
<div class="cap rd">{svg('stop', 26)}<span class="lbl">{L('req.stop')}</span></div>
</div>

<div class="sl">전송 확인 (취소 / 꾹 눌러 전송)</div>
<div class="cf">
<div class="cap" style="flex:1"><span class="lbl" style="font-size:17px">{L('send.cancel')}</span>{flag(O('send.cancel', 17, 71))}</div>
<div class="cap lt" style="flex:2.3">{svg('send', 26)}<span class="lbl" style="font-size:17px">{L('send.hold')}</span><b>0.8s</b></div>
</div>

<div class="sl">상태 이름 · 시트 라벨</div>
<div class="sts">{states}</div>
<div class="fl">
<span>{L('field.host')}</span><span>{L('field.worktree')}</span><span>{L('field.terminal')}</span><span>{L('field.handle')}</span><span>{L('count.chars.other', n=47)}</span><span>{L('req.confirmWindow', s=30)}</span>
</div>
</section>'''


html = '''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>언어별 글자 길이 확인</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&amp;family=Noto+Sans+JP:wght@500;700;800&amp;family=Noto+Sans+KR:wght@400;500;700;800&amp;family=Noto+Sans+SC:wght@500;700;800&amp;display=swap" rel="stylesheet">
<style>
body{margin:0}
.root{position:relative;width:1640px;height:1010px;overflow:hidden;background:#0A0D12;color:#F4F7FB;display:flex;gap:20px;padding:20px 15px;box-sizing:border-box}
.col{width:380px;flex:none;box-sizing:border-box;border-radius:24px;background:#0B1310;border:1px solid #1F3A31;padding:16px 11px 14px;display:flex;flex-direction:column;gap:8px}
header{display:flex;align-items:center;gap:8px;padding:0 4px 4px}
.en{font-size:28px;font-weight:800;color:#E6FFF6;line-height:32px}
.code{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:20px;color:#6FA897}
.tg{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:0.04em;border:1px solid;border-radius:12px;height:24px;padding:0 10px;display:inline-flex;align-items:center;font-family:'Noto Sans KR',sans-serif}
.sl{font-size:11px;font-weight:800;color:#6FA897;letter-spacing:0.06em;margin-top:6px;padding:0 4px;font-family:'Noto Sans KR',sans-serif}
.keys{display:grid;grid-template-columns:repeat(3,110px);gap:8px;justify-content:center}
.ck{position:relative;width:110px;height:84px;box-sizing:border-box;border-radius:16px;background:linear-gradient(#2A323D,#1C222B);border:1px solid #3A4656;box-shadow:inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -5px 0 rgba(0,0,0,0.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-size:15px;font-weight:800;text-align:center;padding:0 5px}
.cb{position:absolute;right:9px;top:5px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:23px;line-height:23px;color:#FFD27A}
.ptt{position:relative;width:102px;height:106px;margin:0 auto;box-sizing:border-box;border-radius:22px;background:linear-gradient(#FBFCFE,#DDE4EE);color:#0D1117;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font-weight:800;text-align:center;padding:0 5px}
.g2{display:grid;grid-template-columns:174px 174px;gap:14px 10px;justify-content:center}
.cap{position:relative;min-height:68px;box-sizing:border-box;border-radius:18px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:15px;font-weight:800;color:#F4F7FB;background:linear-gradient(#2A323D,#1C222B);border:1px solid #3A4656;box-shadow:inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -6px 0 rgba(0,0,0,0.35);padding:6px 12px;text-align:center}
.cap.lt{background:linear-gradient(#FBFCFE,#DDE4EE);color:#0D1117;border-color:transparent}
.cap.am{border-color:#7A5A1A;color:#FFD27A}
.cap.rd{border-color:#FF7A8A;color:#FF9AA6}
.cap b{font-family:'Barlow Condensed',sans-serif;font-size:22px}
.warn{position:absolute;left:8px;top:-9px;height:20px;padding:0 8px;border-radius:10px;background:#FFB020;color:#2B1800;font-size:11px;font-weight:800;display:inline-flex;align-items:center}
.cf{display:flex;gap:10px;width:358px;margin:0 auto}
.lbl{line-height:1.25}
.ov{position:absolute;right:4px;bottom:3px;width:16px;height:16px;border-radius:8px;background:#FF4D6A;color:#fff;font-size:11px;font-weight:800;line-height:16px;text-align:center;font-family:'Noto Sans KR',sans-serif}
.sts{display:flex;flex-wrap:wrap;gap:6px}
.sc{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:15px;background:#0F1A16;border:1px solid #24443A;font-size:13px;font-weight:700}
.sc i{display:inline-block;width:9px;height:9px;border-radius:5px}
.fl{display:flex;flex-wrap:wrap;gap:6px;font-size:12px;font-weight:800;color:#86CDB4}
.fl span{height:24px;padding:0 9px;border-radius:12px;border:1px solid #2E5A4C;display:inline-flex;align-items:center}
.note{position:absolute;right:20px;bottom:6px;font-size:11px;font-weight:700;color:#6FA897;font-family:'Noto Sans KR',sans-serif}
</style>
</helmet>
<div class="root">
''' + ''.join(column(l, n, c) for l, n, c in LANGS) + '''
<div class="note"><span class="ov" style="position:static;display:inline-block;vertical-align:middle">↵</span> 폭 초과 추정 → 안전 문구는 줄바꿈 (자르지 않음) · 글자 폭은 시스템 폰트로 추정한 값, 렌더 확인 아님</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1640,"height":1010}}'>
class Component extends DCLogic {
renderVals() { return {}; }
}
</script>
</body>
</html>
'''
open(OUT, 'w', encoding='utf-8').write(html)
print('wrote', OUT, len(html))
