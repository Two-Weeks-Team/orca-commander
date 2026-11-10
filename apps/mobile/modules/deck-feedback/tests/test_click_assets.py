"""Artifact checks; no audio playback, build, or device access."""
import pathlib
import struct
import subprocess
import sys
import unittest
import wave

ROOT = pathlib.Path(__file__).resolve().parents[5]
MODULE = ROOT / 'apps/mobile/modules/deck-feedback'


class ClickAssets(unittest.TestCase):
    def test_generator_reproduces_both_native_assets(self):
        result = subprocess.run([sys.executable, '-I', str(ROOT / 'scripts/deck-assets/build-click.py'), '--check'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_resources_are_identical_short_mono_pcm(self):
        paths = [MODULE / 'ios/Resources/deck_click.wav', MODULE / 'android/src/main/res/raw/deck_click.wav']
        self.assertTrue(all(path.exists() for path in paths), "Both native click resources must exist")
        self.assertEqual(paths[0].read_bytes(), paths[1].read_bytes())
        with wave.open(str(paths[0]), 'rb') as source:
            self.assertEqual((source.getnchannels(), source.getsampwidth(), source.getframerate()), (1, 2, 48000))
            self.assertGreater(source.getnframes(), 0)
            self.assertLessEqual(source.getnframes() / source.getframerate(), .050)
            samples = struct.unpack('<' + 'h' * source.getnframes(), source.readframes(source.getnframes()))
        self.assertEqual((samples[0], samples[-1]), (0, 0))
        self.assertGreater(max(abs(sample) for sample in samples), 100)
        self.assertLess(max(abs(sample) for sample in samples), 12000)


if __name__ == '__main__':
    unittest.main()
