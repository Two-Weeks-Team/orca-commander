# Render and asset sources

This folder retains source files used by the included asset integrity tests and
generators: Blender scene scripts, source renders/metadata, composition tools
and the synthetic recording-board reference. It contains no private planning
conversation or session archive.

Shipping assets live in `apps/mobile/assets/deck/`. Fonts, icons and branding
have their own provenance and copyright notes under `apps/mobile/assets/`.
The archived twelve-key skin remains a test/reproducibility input; current
layouts select their supported phone/cover/inner geometry explicitly.

Run the domain tests for PNG/hash/geometry/alpha checks. The included post-render
generators reproduce the shipping packs from the retained source PNGs. Some
original Blender scenes additionally require private approval-board inputs;
those inputs are not included, and their digest references do not make a full
scene rerender independently reproducible. See `scripts/deck-assets/README.md`
for the available commands and recorded tool versions. A render or hash check
is not physical-device accessibility, latency, memory or layout acceptance.
