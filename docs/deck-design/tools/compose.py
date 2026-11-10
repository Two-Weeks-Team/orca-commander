"""Compose deck state images from the empty plate and the masked sprite crops.

Design tooling only. Reads ../renders/base.png and ../renders/sprites_raw, writes ../renders/states/*.png
(780 x 1688, 2x) and ../renders/states_check/ (comparison with the reference hero). Run with a Python that has Pillow
and numpy:  python3 -I tools/compose.py
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(HERE, '..', 'renders'))
RAW = os.path.join(R, 'sprites_raw')
OUT = os.path.join(R, 'states')
CHECK = os.path.join(R, 'states_check')
os.makedirs(OUT, exist_ok=True)
os.makedirs(CHECK, exist_ok=True)

manifest = json.load(open(os.path.join(RAW, 'manifest.json')))['sprites']
PX = 300  # pixels per scene unit at 1170 x 2532

CX = [-1.2267, 0.0, 1.2267]
AGENT_Y = [1.68, 0.48]
CMD_Y = [-0.94, -1.94]
BOT_Y = -3.20


def center(x, y):
    return int(round((x + 1.95) * PX)), int(round((4.22 - y) * PX))


AGENT_CENTERS = [center(x, y) for y in AGENT_Y for x in CX]
CMD_CENTERS = [center(x, y) for y in CMD_Y for x in CX]
PTT_C, STICK_C, DIAL_C = center(0, BOT_Y), center(-1.25, BOT_Y), center(1.25, BOT_Y)

# mask shape of each sprite family: (width, height, corner radius) of the pit in pixels, or a circle
MASK = {'agent': ('rrect', 358, 340, 60), 'cmd': ('rrect', 358, 280, 54), 'ptt': ('rrect', 340, 352, 72),
        'stick': ('circle', 322, 322, 0), 'dial': ('circle', 322, 322, 0)}
_cache = {}


def masked(name):
    if name in _cache:
        return _cache[name]
    img = Image.open(os.path.join(RAW, name + '.png')).convert('RGBA')
    fam = name.split('_')[0]
    shape, w, h, r = MASK[fam]
    ss = 4
    m = Image.new('L', (img.width * ss, img.height * ss), 0)
    d = ImageDraw.Draw(m)
    cx, cy = img.width * ss / 2, img.height * ss / 2
    box = (cx - w * ss / 2, cy - h * ss / 2, cx + w * ss / 2, cy + h * ss / 2)
    if shape == 'circle':
        d.ellipse(box, fill=255)
    else:
        d.rounded_rectangle(box, radius=r * ss, fill=255)
    img.putalpha(m.resize(img.size, Image.LANCZOS))
    _cache[name] = img
    return img


def paste(canvas, name, c):
    s = masked(name)
    canvas.alpha_composite(s, (c[0] - s.width // 2, c[1] - s.height // 2))


def compose(agents, cmd='cmd_up', ptt='ptt_up', stick='stick_center'):
    """agents: six sprite names (or None for an unassigned key shown as off)."""
    canvas = Image.open(os.path.join(R, 'base.png')).convert('RGBA')
    for c, name in zip(AGENT_CENTERS, agents):
        paste(canvas, name or 'agent_off_up', c)
    for c in CMD_CENTERS:
        paste(canvas, cmd, c)
    paste(canvas, ptt, PTT_C)
    paste(canvas, stick, STICK_C)
    paste(canvas, 'dial', DIAL_C)
    return canvas


A = lambda tone, st='up': f'agent_{tone}_{st}'
STATES = {
    # reference look of the hero: question, review (selected), question, working, working, done
    'normal': [A('amber'), A('violet', 'selected'), A('amber'), A('blue'), A('blue'), A('green')],
    'request': [A('amber', 'selected'), A('violet'), A('amber'), A('blue'), A('blue'), A('green')],
    'question': [A('amber'), A('violet'), A('amber', 'selected'), A('blue'), A('blue'), A('green')],
    # an unknown or offline key keeps its slot but is dim, never lit as if current
    'offline': [A('off')] * 6,
    'unpaired': [None] * 6,
}
EXTRA = {'recording': dict(base='normal', ptt='ptt_active')}

built = {}
for name, agents in STATES.items():
    built[name] = compose(agents)
for name, spec in EXTRA.items():
    built[name] = compose(STATES[spec['base']], ptt=spec['ptt'])

for name, img in built.items():
    img.convert('RGB').resize((780, 1688), Image.LANCZOS).save(os.path.join(OUT, f'deck_{name}.png'), optimize=True)

# ---- check: the composed reference state against the single-pass hero render
hero = np.asarray(Image.open(os.path.join(R, 'deck_hero2.png')).convert('RGB'), dtype=np.int16)
comp = np.asarray(built['normal'].convert('RGB'), dtype=np.int16)
diff = np.abs(hero - comp)
H, W = diff.shape[:2]


def region(name, c, w, h):
    x0, y0 = max(0, c[0] - w // 2), max(0, c[1] - h // 2)
    d = diff[y0:y0 + h, x0:x0 + w]
    return name, float(d.mean()), float(np.percentile(d, 99))


regions = [region(f'agent{i + 1}', c, 372, 354) for i, c in enumerate(AGENT_CENTERS)]
regions += [region(f'cmd{i + 1}', c, 372, 294) for i, c in enumerate(CMD_CENTERS)]
regions += [region('ptt', PTT_C, 354, 366), region('stick', STICK_C, 336, 336), region('dial', DIAL_C, 336, 336)]
mask_all = np.zeros((H, W), dtype=bool)
for c, w, h in [(c, 372, 354) for c in AGENT_CENTERS] + [(c, 372, 294) for c in CMD_CENTERS] + [(PTT_C, 354, 366), (STICK_C, 336, 336), (DIAL_C, 336, 336)]:
    mask_all[max(0, c[1] - h // 2):c[1] + h // 2, max(0, c[0] - w // 2):c[0] + w // 2] = True
print('overall mean abs diff (0-255): %.2f | outside the sprite areas: %.2f | inside: %.2f' % (diff.mean(), diff[~mask_all].mean(), diff[mask_all].mean()))
for name, mean, p99 in regions:
    print('  %-7s mean %.2f  p99 %.0f' % (name, mean, p99))
heat = np.clip(diff.sum(axis=2) * 2, 0, 255).astype(np.uint8)
Image.fromarray(heat).resize((390, 844), Image.LANCZOS).save(os.path.join(CHECK, 'diff_heat.png'))
side = Image.new('RGB', (780, 844))
side.paste(Image.open(os.path.join(R, 'deck_hero2.png')).convert('RGB').resize((390, 844), Image.LANCZOS), (0, 0))
side.paste(built['normal'].convert('RGB').resize((390, 844), Image.LANCZOS), (390, 0))
side.save(os.path.join(CHECK, 'hero_vs_composite.png'))
print('wrote', sorted(os.listdir(OUT)))
