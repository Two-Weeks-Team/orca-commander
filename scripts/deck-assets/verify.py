#!/usr/bin/env python3
"""Check shipping masks/placement against the design compositor without running its writes.

python3 -I scripts/deck-assets/verify.py --out /tmp/deck-ui-private/p3-assets-reproduction/checks
Requires Pillow and numpy. Only --out receives comparison images and measurements.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/deck-design'
SHIP = ROOT / 'apps/mobile/assets/deck'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    compose = SOURCE / 'tools/compose.py'
    # Execute only reviewed pure constants/functions; the source module itself writes reference files.
    tree = ast.parse(compose.read_text())
    constants = {'PX', 'CX', 'AGENT_Y', 'CMD_Y', 'BOT_Y', 'AGENT_CENTERS', 'CMD_CENTERS',
                 'PTT_C', 'STICK_C', 'DIAL_C', 'MASK', '_cache'}
    functions = {'center', 'masked', 'paste', 'compose'}
    nodes = [node for node in tree.body if
             isinstance(node, ast.FunctionDef) and node.name in functions or
             isinstance(node, ast.Assign) and any(isinstance(item, ast.Name) and item.id in constants
                                                 for target in node.targets for item in ast.walk(target))]
    ns = {'Image': Image, 'ImageDraw': ImageDraw, 'os': os,
          'R': str(SOURCE / 'renders'), 'RAW': str(SOURCE / 'renders/sprites_raw')}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(compose), 'exec'), ns)
    manifest = json.loads((SHIP / 'manifest.json').read_text())
    alpha_pixels = 0
    sprite_results = {}
    for name, entry in manifest['sprites'].items():
        shipping_file = SHIP / entry['file']
        payload = shipping_file.read_bytes()
        image = Image.open(shipping_file).convert('RGBA')
        reference = ns['masked'](name)
        assert image.size == reference.size
        assert np.array_equal(np.asarray(image), np.asarray(reference)), name
        assert hashlib.sha256(payload).hexdigest() == entry['sha256']
        alpha = np.asarray(image.getchannel('A'))
        assert alpha[0, 0] == alpha[-1, -1] == alpha[0, -1] == alpha[-1, 0] == 0
        assert np.any((alpha > 0) & (alpha < 255)), 'Expected antialiased mask'
        alpha_pixels += int(np.count_nonzero(alpha < 255))
        sprite_results[name] = dict(bytes=len(payload), width=image.width, height=image.height,
                                    transparentPixels=int(np.count_nonzero(alpha == 0)),
                                    fractionalAlphaPixels=int(np.count_nonzero((alpha > 0) & (alpha < 255))))
    names = ['agent_amber_up', 'agent_violet_selected', 'agent_amber_up',
             'agent_blue_up', 'agent_blue_up', 'agent_green_up']
    canvas = Image.open(SHIP / 'base.png').convert('RGBA')
    entries = [(name, p) for name, p in zip(names, manifest['placementsPx']['agentSlots'])]
    entries += [('cmd_up', p) for p in manifest['placementsPx']['cmdSlots']]
    entries += [(name, manifest['placementsPx'][part]) for name, part in
                [('ptt_up', 'ptt'), ('stick_center', 'stick'), ('dial', 'dial')]]
    coverage = np.zeros((2532, 1170), dtype=bool)
    feather = np.zeros_like(coverage)
    for name, rect in entries:
        sprite = Image.open(SHIP / manifest['sprites'][name]['file']).convert('RGBA')
        assert sprite.size == (rect['w'], rect['h'])
        x, y, w, h = (rect[k] for k in ('x', 'y', 'w', 'h'))
        canvas.alpha_composite(sprite, (x, y))
        alpha = np.asarray(sprite.getchannel('A'))
        coverage[y:y+h, x:x+w] |= alpha > 0
        feather[y:y+h, x:x+w] |= (alpha > 0) & (alpha < 255)
    expected = ns['compose'](names)
    assert np.array_equal(np.asarray(canvas), np.asarray(expected)), 'Shipping placement diverges from compositor'
    hero = np.asarray(Image.open(SOURCE / 'renders/deck_hero2.png').convert('RGB'), dtype=np.int16)
    normal = np.asarray(canvas.convert('RGB'), dtype=np.int16)
    diff = np.abs(hero - normal)
    report = {'sprites': sprite_results, 'allShippingPixelsEqualReviewedCompositor': True,
              'all32MasksEqualReviewedCompositor': True, 'nonOpaqueSpritePixels': alpha_pixels,
              'heroDiff': {'meanAbs': float(diff.mean()), 'alphaEdgeMeanAbs': float(diff[feather].mean()),
                           'outsideMasksMeanAbs': float(diff[~coverage].mean()),
                           'maxAbs': int(diff.max())},
              'limits': 'Hero comparison is reference art only; phone fractional-scale alignment is separately unverified.'}
    canvas.save(args.out / 'shipping-normal.png')
    heat = np.clip(diff.sum(axis=2) * 2, 0, 255).astype(np.uint8)
    Image.fromarray(heat).resize((390, 844), Image.Resampling.LANCZOS).save(args.out / 'hero-diff-heat.png')
    side = Image.new('RGB', (780, 844))
    side.paste(Image.fromarray(hero.astype('uint8')).resize((390, 844), Image.Resampling.LANCZOS), (0, 0))
    side.paste(canvas.convert('RGB').resize((390, 844), Image.Resampling.LANCZOS), (390, 0))
    side.save(args.out / 'hero-vs-shipping.png')
    (args.out / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'sprites'}))


if __name__ == '__main__':
    main()
