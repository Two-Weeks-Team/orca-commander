# Public media and provenance

All screenshots in this directory are **source-component previews on React Native Web with synthetic data**, not native-device captures or a connected host. The hero and anatomy images are editorial compositions of those same previews. The two SVG diagrams are editable descriptions of the source's architecture and guarded-response flow.

| Files | Origin |
|---|---|
| `controller.png`, `controller-ko.png` | Included `DeckScreen`, actual domain view and bundled assets; fixed English/Korean synthetic inventory |
| `agents.png`, `content.png`, `status.png` | Included list/content/status components in the source sheet frame; synthetic identity/body/usage |
| `voice.png` | Included recording presentation with synthetic elapsed time, level and transcript; no audio/model |
| `tablet.png` | Included wide geometry and nine synthetic visible sessions; no named device claim |
| `hero.png`, `anatomy.png` | Editable HTML compositions in `scripts/showcase/`; same source previews |
| `architecture.svg`, `write-flow.svg` | Hand-authored SVG; no external images, script, font service or private input |

[preview-provenance.json](preview-provenance.json) records the public runtime source revision, imported source/artwork hashes, editorial/tool inputs, exact tooling versions, viewport fixtures and limitations. [images.json](images.json) records each published image's bytes/hash/dimensions. These establish what was used and published; they do not certify security, mobile layout or physical-device acceptance.

The build and capture path is in [scripts/showcase](../../scripts/showcase/README.md). The recorded capture used a 2× browser device pixel ratio. Font rasterization/browser versions can change PNG bytes even when source inputs are unchanged.

Original new documentation/compositions follow the root MIT license. Included Orca-derived artwork, provider marks, Lucide/Feather icons and Barlow font retain the notices in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). No trademark permission or endorsement is inferred.
