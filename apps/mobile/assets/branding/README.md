# Orca Deck branding

`orca-deck-logo.png` is the adopted original, preserved byte for byte: 1254 ×
1254 RGBA PNG, 1,264,767 bytes, SHA-256
`e7b8e60b3bba4ec2baa2f3e4e94158d2794d327769fb11c5cd5c46bfe614cb49`.
It has not been redrawn, cropped, cleaned, recolored or stripped of metadata.
These are required product assets in ordinary Git; the local `.gitattributes`
explicitly disables content filters for their PNGs.

Platform derivatives preserve the complete original design:

- `icon-ios.png`: 1024 × 1024 RGB PNG. Expo image-utils resizes with containment
  and composites the supplied transparent exterior over solid black. This
  avoids the SDK 55 iOS icon generator's default white transparency fill. There
  is no alpha channel in this intermediate icon.
- `icon-android-foreground.png`: 1080 × 1080 RGBA PNG. The entire original is
  resized to 466 × 466 and centered on a transparent canvas at (307, 307). Its
  complete square fits inside the 660px safe circle (66dp of the 108dp layer),
  so system adaptive masks need not cut the supplied artwork. Android supplies
  the black background through `android.adaptiveIcon.backgroundColor`.

`provenance.json` records dimensions, operations, engine and output hashes.
Regenerate or verify with the project's installed Expo image-utils 0.8.17:

```sh
node apps/mobile/assets/branding/generate-platform-icons.mjs
node apps/mobile/assets/branding/generate-platform-icons.mjs --check
```

The generator uses Expo's JS image engine with optional host-global sharp
disabled for reproducibility. It refuses a different canonical image or tool
version and never writes the canonical original.

The Expo config references the original for the general icon and contained
black-background splash; iOS overrides the icon with its opaque derivative.
The existing SDK 55 default splash-generation fallback supports these legacy
config fields without adding a native dependency. The app-info screen displays
the unchanged original as decoration beside its existing text. Native asset
generation checks do not prove installed launch-screen appearance, launcher
masking, accessibility or store acceptance; those require a new native build
and physical-device verification.

Contract references: [SDK 55 app config](https://docs.expo.dev/versions/v55.0.0/config/app/)
and [SDK 55 splash configuration](https://docs.expo.dev/versions/v55.0.0/sdk/splash-screen/).
The latter recommends its native plugin for future changes; this package keeps
the currently installed SDK's supported fallback and introduces no dependency.

## Artwork origin and licensing

The maintainer states that the adopted image combines Orca artwork with an
original Deck-shaped foreground. The original image bytes and platform-derived
icons remain unchanged by publication preparation.

The corresponding Orca app artwork is published in the upstream MIT repository;
see [Orca v1.4.246 resources/build/icon.png](https://github.com/stablyai/orca/blob/v1.4.246/resources/build/icon.png).
This is a visual source reference, not a claim that the compositing input was
byte-identical to that particular upstream file. The retained upstream copyright
and full MIT permission notice are in [ORCA-LICENSE](ORCA-LICENSE). The directly
created Deck additions use the project's root MIT license. Orca's name and mark
remain their owner's trademarks; this adaptation is an independent project and
is not an official Orca icon or endorsement. Neither MIT notice grants trademark
rights. Resolve any separate trademark permission required for public branding
before representing this as an approved collaboration or distributing store art.
