#!/usr/bin/env python3
"""Generate the identical, original 40ms click in both native resource bundles.

Integer-only synthesis + standard-library WAV encoding; no external source audio.
Run python3 -I scripts/deck-assets/build-click.py [--check]. No playback occurs.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import wave

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'apps/mobile/modules/deck-feedback'
RATE = 48000
FRAMES = 1920


def click():
    state = 0x4445434B
    filtered = 0
    samples = []
    for index in range(FRAMES):
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        noise = ((state >> 16) & 0xFFFF) - 32768
        filtered = (3 * filtered + noise) // 4
        # Two-millisecond attack, then a squared decay; both endpoints are exactly zero.
        attack = min(index, 96)
        decay = FRAMES - 1 - index
        sample = filtered * attack * decay * decay // (96 * (FRAMES - 1) ** 2 * 4)
        samples.append(max(-32768, min(32767, sample)))
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(RATE)
        stream.writeframes(struct.pack('<' + 'h' * FRAMES, *samples))
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = click()
    paths = ['ios/Resources/deck_click.wav', 'android/src/main/res/raw/deck_click.wav']
    manifest = {'format': 1, 'origin': 'Original integer noise synthesis; no sampled third-party audio',
                'generator': 'scripts/deck-assets/build-click.py', 'sampleRate': RATE, 'channels': 1,
                'bitsPerSample': 16, 'frames': FRAMES, 'durationMs': 40, 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest(), 'nativeResources': paths}
    payloads = {path: data for path in paths}
    payloads['click-manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    for path, payload in payloads.items():
        destination = MODULE / path
        if args.check:
            assert destination.read_bytes() == payload, 'Stale click resource: ' + path
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(payload)
    print(json.dumps({'mode': 'checked' if args.check else 'built', **manifest}))


if __name__ == '__main__':
    main()
