"""Approximate text-width check of the four languages against the design's real boxes.

Latin letters are measured with Helvetica Bold; Hangul, kana and Han are counted as 1 em each (full width), which is
the conservative case for Noto Sans CJK. This is an estimate (+/- ~10 %), not a render.
"""
import sys
from PIL import ImageFont
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from strings import ROWS

HB = '/System/Library/Fonts/Helvetica.ttc'
_cache = {}


def lat(size):
    if size not in _cache:
        _cache[size] = ImageFont.truetype(HB, size, index=1)
    return _cache[size]


def is_wide(ch):
    o = ord(ch)
    return (0x1100 <= o <= 0x11FF or 0x2E80 <= o <= 0x9FFF or 0xAC00 <= o <= 0xD7AF or 0xFF00 <= o <= 0xFFEF
            or o in (0x00B7, 0x30FB) and False)


def width(text, size):
    w = 0.0
    for ch in text:
        if is_wide(ch):
            w += size
        else:
            w += lat(size).getlength(ch)
    return w


IDX = {'en': 1, 'ko': 2, 'ja': 3, 'zh': 4}
BY = {r[0]: r for r in ROWS}

# (label, key, font px, usable px) -- usable px is read off the boards' real boxes
CHECKS = [
 ('command key', 'cmd.allow', 15, 100), ('command key', 'cmd.reject', 15, 100), ('command key', 'cmd.content', 15, 100),
 ('command key', 'cmd.input', 15, 100), ('command key', 'cmd.next', 15, 100), ('command key', 'cmd.list', 15, 100),
 ('push-to-talk key', 'ptt.hold', 13, 90),
 ('content-sheet button', 'cmd.allow', 15, 138), ('content-sheet button', 'cmd.reject', 15, 138),
 ('content-sheet button', 'req.allowSession', 15, 138), ('content-sheet button', 'req.stop', 15, 138),
 ('confirm: send', 'send.hold', 17, 152), ('confirm: cancel', 'send.cancel', 17, 71),
 ('LCD state name', 'state.permission', 15, 130), ('LCD state name', 'state.question', 15, 130),
 ('LCD state name', 'state.review', 15, 130), ('LCD state name', 'state.working', 15, 130),
 ('LCD state name', 'state.done', 15, 130), ('LCD state name', 'state.failed', 15, 130),
 ('LCD state name', 'state.idle', 15, 130), ('LCD state name', 'state.unknown', 15, 130),
 ('warning chip', 'req.wideScope', 11, 90), ('dialog button', 'key.clear', 16, 110),
]

if __name__ == '__main__':
    worst = {}
    print(f"{'box':22} {'key':18} {'px':>3}/{'use':<4} " + ' '.join(f'{l:>12}' for l in ('en', 'ko', 'ja', 'zh')))
    rows = []
    for label, key, size, use in CHECKS:
        r = BY[key]
        cells = []
        for l in ('en', 'ko', 'ja', 'zh'):
            w = width(r[IDX[l]], size)
            ratio = w / use
            tag = 'OVER' if ratio > 1.0 else ('tight' if ratio > 0.85 else 'ok')
            cells.append((w, ratio, tag))
            if tag != 'ok':
                worst.setdefault(l, []).append((label, key, round(w), use, tag))
        rows.append((label, key, size, use, cells))
        print(f"{label:22} {key:18} {size:>3}/{use:<4} " + ' '.join(f'{c[0]:6.0f} {c[2]:>5}' for c in cells))
    print()
    for l, items in worst.items():
        print(l, items)
