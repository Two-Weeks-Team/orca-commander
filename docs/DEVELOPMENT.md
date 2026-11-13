# Development guide

[Documentation](README.md) / Development

Start with the [getting-started guide](GETTING_STARTED.md), [architecture](ARCHITECTURE.md) and [support matrix](../SUPPORT.md). Native signing, production binaries and store distribution are separate work; this guide is for the source alpha.

## Repository map

```text
apps/mobile/
  app/                   Expo Router entry and composition
  src/
    core/                Pure selection, freshness, policy, gestures, recovery models
    adapters/            Host/platform effects and guarded clients
    ui/                  Screens, readers, confirmation and controller surface
    i18n/                Catalogs, preferences and language-pack contracts
    upstream/            Exact vendored source selections with licenses
  modules/               Local native speech and feedback modules
  plugins/               Generated native-project configuration
  assets/                Shipping artwork, fonts and retained notices
  tests/                 Domain, JSX/source, asset and recovery regressions
scripts/
  verify-upstream.mjs    Check selected source hashes and notice bytes
  test-vendor-tools.mjs  Exercise vendoring/verification in temporary repositories
  deck-assets/           Source-render-to-shipping-asset tooling
  showcase/              Isolated documentation preview tooling
```

## Working environment

Use Node.js 24. The configured domain command also checks native-project Ruby requirements, so Ruby 2.7+ must be on `PATH` even when you are not compiling iOS. The recorded local environment was Node 24.15.0 / Ruby 3.1.0.

```sh
npm --prefix apps/mobile ci --ignore-scripts --no-audit --no-fund
node scripts/verify-upstream.mjs
node scripts/test-vendor-tools.mjs
npm test
npm run typecheck
npm --prefix apps/mobile run test:prebuild
```

The mobile lockfile is the installation contract. Do not fold an unrelated major Expo/Router upgrade into a UI/documentation change; known advisories require a reviewed migration and appropriate revalidation.

## What each check proves

| Check | Scope | Does not prove |
|---|---|---|
| Upstream integrity | The 13/60 selected source files and MIT notices match their pins | Every installed host feature or a full upstream build |
| Vendor tool regressions | Vendoring and verification behavior in a temporary Git repository | Real-host transport or device behavior |
| `npm test` | Configured domain, source/JSX, asset, policy and recovery regressions | Native UI layout, speech accuracy or all interruption paths |
| `npm run typecheck` | Whole app TypeScript | Runtime permissions or successful native linking |
| `test:prebuild` | Generated iOS/Android configuration and native-project guards | Pods, native compilation, launch or physical acceptance |
| Pinned upstream CI | Original Mobile TypeScript and selected protocol/E2EE/mock/host contracts | Universal compatibility with newer hosts/providers |
| Public documentation check | Relative links, media/source hashes and expected image metadata | Translation quality, native screenshot fidelity or accessibility acceptance |
| Showcase build | Selected UI components compile in the separate browser adapter | A functional web app or mobile native build |

Actual outcomes and retained failures belong in [VERIFICATION.md](VERIFICATION.md), not in an inferred overall PASS.

## Making a focused change

1. Identify whether the change belongs to pure policy, a host/platform adapter, presentation or assets.
2. Read the existing contract and relevant tests before editing.
3. Keep source identities, native IDs, protected-store keys and action ownership explicit.
4. Exercise the meaningful boundary for the change, including refusal/unknown behavior when it affects writes.
5. Report what ran, its environment and what remains unverified. Use synthetic fixtures in public evidence.

For a visual-only change, inspect the actual affected views and large-text/space conditions. Do not infer a native layout from a source string assertion or a browser image alone. For a transport change, a good-looking screen is not the acceptance criterion.

## Working with artwork

The UI uses static bundled asset references; the material is decoration around native labels and controls. The asset tests check dimensions, source/output hashes, geometry and alpha. Start with [asset source notes](deck-design/README.md) and the [pipeline README](../scripts/deck-assets/README.md).

Do not manually add rights fields to generated provenance or reencode PNGs to make a doc edit. Preserve the generator's byte contract and put attribution in the appropriate README/license notice. Some original Blender scenes require private approval-board inputs; the public shipping-asset checks and full scene reproduction are distinct claims.

## Working with public images and docs

Use the [showcase tool](../scripts/showcase/README.md) for synthetic source-component previews. Update the source/image provenance if a rendered input changes. Keep diagrams editable and image alt text descriptive. Run:

```sh
node scripts/check-public-docs.mjs
```

A demo `LIVE` label is not live-host proof. Do not capture owner work, pairing QR material, personal paths, provider accounts or raw conversations for a public gallery.

## Upstream changes

See [UPSTREAM.md](UPSTREAM.md). Preserve upstream notice bytes and review the selected-file manifests deliberately. Run integrity/tool checks and the relevant original contracts. A version bump or copied type definition alone does not establish runtime compatibility.

## Public/private publication model

Implementation and experiments are developed privately; the public repository receives coherent, reviewed snapshots with independent history. Public issues, external references and pull requests are useful input. Acceptance means the change has been evaluated and the appropriate checks/evidence recorded, not merely that a suggestion exists.

Maintainers must not mirror private branches, PR refs, raw evidence or conversations. Source-to-public mapping stays private. Public commits describe the final behavior or documentation change without internal discussion history.

[Contributing](../CONTRIBUTING.md) · [Roadmap](ROADMAP.md)
