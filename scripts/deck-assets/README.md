# Shipping deck skin

The product skin uses `apps/mobile/assets/deck/base.png` (1170 × 2532, the
390 × 844 point design plane at 3 pixels per point) and 32 individual RGBA
sprites. Labels, numbers and icons are native UI overlays. Reference composites
and font files are not bundled by this pipeline.

Build with Python 3 and Pillow (current verified encoder: Python 3.12.4,
Pillow 12.1.1; exact local versions are recorded in the manifest):

```sh
python3 -I scripts/deck-assets/build.py
python3 -I scripts/deck-assets/build.py --check
```

`--check` regenerates in memory and compares every byte; `--out DIR` writes an
independent pack. The base is copied without reencoding. Sprites use the exact
4× supersampled rounded-rectangle/circle masks from the reviewed design
compositor, then Lanczos downsampling and PNG encoding. Their RGB pixels remain
unchanged, including RGB under fully transparent pixels. The source manifest's
`radiusPx` is preserved; `bakedMask` records the actual alpha mask (in particular,
PTT uses the compositor's 72 px radius rather than the source crop's 66 px hint).

`manifest.json` links each source image SHA-256 to its shipping image SHA-256 and
byte count, and records the compositor, scene script, generator and source
manifest hashes. `sprites.*.x/y/w/h/px` preserve the source crop geometry.
`placementsPx` records the compositor's exact integer pixel destinations for
all six agent slots, six command slots, PTT, joystick and dial. Use these
placements divided by `pxPerPt` rather than deriving a destination from crop
coordinates: centered integer crops differ from the original crop origin by a
pixel for some families. Scale the entire design plane consistently in the UI;
these assets do not prescribe the safe-area or aspect-ratio policy.

The runtime API is `apps/mobile/src/ui/deck/deck-assets.ts`: `deckBase`,
`deckSprites`, `DeckSpriteName`, and `deckManifest`. Every PNG has a static Metro
`require`; no dynamic filenames, runtime masking, or whole-screen state images
are needed.

Independent compositor verification requires numpy in addition to Pillow:

```sh
python3 -I scripts/deck-assets/verify.py --out /tmp/deck-assets-check
```

This executes only the reviewed compositor's constants and pure functions, not
its output-writing module body. It checks all 32 masks and pixels, alpha corners
and antialiasing, SHA-256 values, exact placement, and the assembled reference
state. Comparison PNGs and measurements go only to the specified output folder.
A visual reference comparison is not physical-device acceptance.

For Blender reproduction, use an isolated background scene. The original `docs/deck-design/blender/deck_scene.py` resets
factory state; execute it only in an isolated background process. Do not run it
in the existing UI scene. Use 1.0 scale and 128 samples for base and sprite modes;
the 32-sprite run may take several minutes. Keep
reproduction renders/logs outside this repository. Shipping keeps the reviewed
source PNGs until render differences have been assessed.

## Wide portrait face

`build-wide.py` creates the624×784pt twelve-key pack at `assets/deck/wide`, reusing this alpha pipeline. Use `python3 -I scripts/deck-assets/build-wide.py --check` and `node apps/mobile/tests/wide-assets.test.mjs` to verify source/output hashes and native control centers. Render source and provenance: `docs/deck-design/blender/WIDE-PORTRAIT.md`. The phone pack remains byte-identical.
