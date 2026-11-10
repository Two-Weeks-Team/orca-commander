# Deck numeral fonts

Unmodified Barlow Condensed static TrueType fonts, Version 1.408. Only normal
weights 600 (SemiBold) and 700 (Bold) are included; the verified Google Fonts
family directory has no variable font. No subsetting, renaming, or conversion
was performed. Use these faces for deck numerals and counter punctuation only;
localized text, including Korean and other CJK text, keeps the system face.

The copyright and complete SIL Open Font License 1.1 are preserved verbatim in
[OFL.txt](./OFL.txt). Keep this notice and license with redistributed fonts.
The font license is independent of the application license.

Source: [Google Fonts](https://github.com/google/fonts/tree/2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc/ofl/barlowcondensed).
Verified repository commit: `2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc` (main, 2026-11-02).
Latest binary-changing commit for both weights: `89f5431ff0db41bd2fe3f7ba21a723a01622428b`.
The official METADATA.pb identifies upstream source commit
`b4726ddf91525818e85e5fce111c285b9273d764` in https://github.com/jpt/barlow.

| File | Weight | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| [BarlowCondensed-SemiBold.ttf](https://raw.githubusercontent.com/google/fonts/2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc/ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf) | 600 | 109428 | `7b619d14bc2327509a9ef32b0890f709626f7ecc9ff61191c2a4314c5499d2d9` |
| [BarlowCondensed-Bold.ttf](https://raw.githubusercontent.com/google/fonts/2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc/ofl/barlowcondensed/BarlowCondensed-Bold.ttf) | 700 | 109912 | `e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65` |
| [OFL.txt](https://raw.githubusercontent.com/google/fonts/2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc/ofl/barlowcondensed/OFL.txt) | License | 4377 | `186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f` |

`provenance.json` records immutable download URLs, Git blob hashes, font
identity/version, weights, and coverage checks. Downloaded bytes matched the
official GitHub content API blob hashes. Both fonts parse with fontTools and
contain `0123456789:!.+-/`; neither contains the tested Hangul/Han glyphs.

Runtime use: the expo-font config plugin in `apps/mobile/app.json` embeds the
700 face at build time, and `apps/mobile/src/ui/deck-fonts.ts` exports its name
(`BarlowCondensed-Bold`, which is both the Android asset name and the iOS
PostScript name). Render it at the normal weight: Android falls back to a system
face when a bold variant of a single-file family is requested. The 600 face is
kept for reference and is not embedded. Do not use this face for CJK text. Native loading, physical
device typography and overlay measurements remain separate integration checks.
