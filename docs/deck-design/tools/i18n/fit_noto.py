"""Width check with the real Noto Sans fonts the boards load (variable fonts, weight 800 for labels).

Usage: python3 -I fit_noto.py FONT_DIR
Each language is measured with its own Noto face; English and Latin text use Noto Sans KR's Latin (as the boards do).
"""
import sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from PIL import ImageFont
from strings import ROWS
from fit import CHECKS, BY, IDX

FD = sys.argv[1]
FACE = {'en': 'NotoSansKR.ttf', 'ko': 'NotoSansKR.ttf', 'ja': 'NotoSansJP.ttf', 'zh': 'NotoSansSC.ttf'}
_c = {}


def font(lang, size, wght):
    k = (lang, size, wght)
    if k not in _c:
        f = ImageFont.truetype(f'{FD}/{FACE[lang]}', size)
        f.set_variation_by_axes([wght])
        _c[k] = f
    return _c[k]


def width(text, lang, size, wght=800):
    return font(lang, size, wght).getlength(text)


if __name__ == '__main__':
    # sanity: the variation axis really changes the width
    a, b = width('Allow this session', 'en', 15, 400), width('Allow this session', 'en', 15, 800)
    print(f'axis check: wght400={a:.1f}px wght800={b:.1f}px (must differ)')
    print(f"{'box':22} {'key':18} {'px/use':>8} " + ' '.join(f'{l:>12}' for l in ('en', 'ko', 'ja', 'zh')))
    bad = {}
    for label, key, size, use in CHECKS:
        cells = []
        for l in ('en', 'ko', 'ja', 'zh'):
            w = width(BY[key][IDX[l]], l, size)
            tag = 'OVER' if w > use else ('tight' if w > 0.85 * use else 'ok')
            cells.append(f'{w:6.0f} {tag:>5}')
            if tag != 'ok':
                bad.setdefault(l, []).append((label, key, round(w), use, tag))
        print(f'{label:22} {key:18} {size:>3}/{use:<4} ' + ' '.join(cells))
    print()
    for l, v in bad.items():
        print(l, v)
