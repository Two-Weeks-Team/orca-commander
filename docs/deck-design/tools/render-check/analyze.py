"""Turn the output of audit.js into a touch-target and contrast report.

Usage:  python3 -I analyze.py OUT_DIR      (OUT_DIR is the --out of render_check.py run with --script audit.js)
Needs Pillow and numpy.

Touch targets: every button must be at least 44 x 44 (Apple's default size) and, as the design target, 48 x 48
(Google's recommendation). Disabled controls are listed but not counted.
Contrast (WCAG 2.2): text 4.5:1, or 3:1 for large text (24 px, or 18.66 px at weight 700+); icons 3:1 (non-text
contrast). The background is read from the screenshot with text and icons hidden; the figure reported for each piece is
the 5th percentile of the per-pixel contrast under its box (inset 1 px; the box is the glyphs' own box, one per line), i.e. close to the worst point, not the average. Text inside
disabled controls is exempt (WCAG excludes inactive components) and is counted separately.
"""
import glob, json, os, re, sys
import numpy as np
from PIL import Image

out = sys.argv[1]
raw = open(os.path.join(out, 'last-run.txt'), encoding='utf-8').read()
boards = {}
for line in raw.splitlines():
    m = re.match(r'^AUDIT (\w+) (\{.*\})$', line)
    if m:
        boards[m.group(1)] = json.loads(m.group(2))


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lum(rgb):
    r, g, b = lin(rgb[..., 0]), lin(rgb[..., 1]), lin(rgb[..., 2])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def parse(c):
    m = re.match(r'rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)', c)
    r, g, b = float(m.group(1)), float(m.group(2)), float(m.group(3))
    return np.array([r, g, b]), float(m.group(4)) if m.group(4) else 1.0


tot = dict(targets=0, t44=0, t48=0, texts=0, tfail=0, icons=0, ifail=0, exempt=0)
detail = []
for name, d in boards.items():
    bgp = os.path.join(out, 'shots', name + '.bg.png')
    if not os.path.exists(bgp):
        bgp = os.path.join(out, name + '.bg.png')
    bg = np.asarray(Image.open(bgp).convert('RGB')).astype(float)
    sc = bg.shape[1] / 390.0
    t44 = [t for t in d['targets'] if not t['dis'] and (t['w'] < 44 or t['h'] < 44)]
    t48 = [t for t in d['targets'] if not t['dis'] and (t['w'] < 48 or t['h'] < 48)]
    tot['targets'] += len([t for t in d['targets'] if not t['dis']]); tot['t44'] += len(t44); tot['t48'] += len(t48)

    def worst(e):
        # inset the box by 1 css px: antialiased edges are not a fair background
        ins = 1 if min(e['w'], e['h']) > 6 else 0
        x0, y0 = max(int((e['x'] + ins) * sc), 0), max(int((e['y'] + ins) * sc), 0)
        x1, y1 = min(int((e['x'] + e['w'] - ins) * sc) + 1, bg.shape[1]), min(int((e['y'] + e['h'] - ins) * sc) + 1, bg.shape[0])
        reg = bg[y0:y1, x0:x1]
        if reg.size == 0:
            return None
        col, a = parse(e['c'])
        a *= e['op']
        fg = col * a + reg * (1 - a)
        lf, lb = lum(fg), lum(reg)
        hi, lo = np.maximum(lf, lb), np.minimum(lf, lb)
        cr = (hi + 0.05) / (lo + 0.05)
        return float(np.percentile(cr, 5))

    fails = []
    for e in d['texts']:
        if e['dis']:
            tot['exempt'] += 1
            continue
        w = worst(e)
        if w is None:
            continue
        large = e['fs'] >= 24 or (e['fs'] >= 18.66 and e['fw'] >= 700)
        need = 3.0 if large else 4.5
        tot['texts'] += 1
        if w < need:
            tot['tfail'] += 1
            fails.append((round(w, 2), need, e['t'], e['fs'], (round(e['x']), round(e['y']))))
    ifails = []
    for e in d['icons']:
        if e['dis']:
            continue
        w = worst(e)
        if w is None:
            continue
        tot['icons'] += 1
        if w < 3.0:
            tot['ifail'] += 1
            ifails.append(round(w, 2))
    detail.append((name, t44, t48, sorted(fails)[:6], len(fails), ifails))

for name, t44, t48, fails, nf, ifails in detail:
    print(f'\n## {name}')
    print(f'  targets under 44: {len(t44)}  under 48: {len(t48)}', [(t["label"], t["w"], t["h"]) for t in t48][:6])
    print(f'  text below WCAG: {nf}', fails)
    print(f'  icons below 3:1: {len(ifails)}', ifails[:6])
print('\nTOTAL', tot)
