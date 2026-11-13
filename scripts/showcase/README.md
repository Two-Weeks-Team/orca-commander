# Source UI previews

This documentation-only tool renders selected **actual Orca Commander components** on React Native Web. It exists so readers can see the design without installing a native development client or connecting a host.

It is not a web port of the application. Tasks, target identities, link labels, usage values and voice text are synthetic. Host-action callbacks do nothing; there is no pairing, protected-store access, live host, microphone capture, provider key, speech model or action-client construction.

## Build and view

Use Node.js 24. From the repository root:

```sh
npm --prefix apps/mobile ci --ignore-scripts --no-audit --no-fund
npm --prefix scripts/showcase ci --ignore-scripts --no-audit --no-fund
node scripts/showcase/generate.mjs --out /tmp/orca-commander-preview
python3 scripts/showcase/serve.py --directory /tmp/orca-commander-preview
```

Open `http://127.0.0.1:53719/`. Build output must stay outside the repository. Serve it only on localhost; no hosted service is needed.

The first installation provides the app's source dependency environment. The second is a small, separate documentation toolchain; it does not change `apps/mobile/package-lock.json`.

## Pages

| Page | Components/data |
|---|---|
| `controller.html` | Compact English controller, six synthetic sessions |
| `controller-ko.html` | Same source with Korean catalog and synthetic Korean task titles |
| `agents.html` | `AgentKeyList` in `DeckSheetFrame` |
| `content.html` | Full-content reader with synthetic received text |
| `status.html` | Connection/usage component in the source's History sheet |
| `voice.html` | Recording presentation with fixture transcript, level and time |
| `tablet.html` | Wide source geometry with nine visible fixture sessions |
| `hero.html` | Editorial composition around the controller/list previews |
| `anatomy.html` | Annotated controls around the same controller preview |

The renderer composes selected components rather than booting the full native app. Local scrolling/layout is real browser behavior; it does not prove native gestures, permissions, recovery or accessibility.

## Boundaries

- `native.jsx`: documented platform environment, fixed viewport and reduced motion.
- `image.jsx`: bundled image presentation and tint in a browser; no Expo native image bridge.
- `safe-area.jsx`: fixed fixture insets, not actual device measurements.
- `messages.jsx`: included catalogs and in-memory preview preferences.
- `feedback.mjs`: inert feedback; no native module.
- `viewer.jsx`: actual source components plus synthetic inventory and inert host callbacks.
- `generate.mjs`: pinned build, local-only assets, provenance and an import-graph guard.

The build rejects unexpected app-adapter imports. In particular it does not load `app-session.ts`, pairing, live transport or a write client. The runtime source is identified in `preview-provenance.json`; input hashes distinguish it from later documentation edits.

## Capture images

The optional helper needs Python 3 and an **already installed, working Aside CLI/browser**. Follow that tool's own setup instructions; it is not an app dependency. Read the generated pages first.

```sh
python3 scripts/showcase/capture.py \
  --url http://127.0.0.1:53719 \
  --out /tmp/orca-commander-captures
```

The helper opens only its generated localhost pages, waits for mount/layout/fonts/images, captures them and closes only its own tabs. It refuses non-local URLs. The text in the images includes a synthetic-source-preview label.

For a different browser, use the viewport sizes in the provenance. Phone captures include a 390 × 844 component viewport plus the documentation caption; wide captures use 821 × 1088. Capture at the recorded device pixel ratio if comparing pixel dimensions. A different browser/font renderer can produce different PNG bytes.

## Updating public media

Inspect every image before publishing. Keep the app/source/artwork inputs intact and retain third-party notices. Copy only reviewed outputs into `docs/media/`; update the provenance/image hash manifest and run:

```sh
node scripts/check-public-docs.mjs
```

Never capture live host work, account details, pairing QR material or private paths for the gallery. Source previews and diagrams do not create new device acceptance claims.
