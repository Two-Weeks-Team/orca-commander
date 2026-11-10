# Orca Commander

A phone and tablet control console for [Orca](https://github.com/stablyai/orca):
find the agent that needs attention, inspect its context, and send a deliberate
response from one surface.

**Development preview / alpha source.** This is an independent project, not an
official Orca product. It is not a stable cross-platform release or an app-store
build. **The current dependency audit has known findings, including high-severity
entries; read [dependency security status](docs/DEPENDENCY_SECURITY.md) before running it.**
Supported behavior and known gaps are listed in [SUPPORT.md](SUPPORT.md);
checks and the limits of the evidence are recorded in [VERIFICATION.md](docs/VERIFICATION.md).

## What is here

- Paired direct E2EE access to Orca host/worktree/session state.
- A rendered virtual controller and list views with session selection, full
  received context and host-reported usage information.
- Guarded text input: review the target and body, hold to confirm, revalidate the
  current target, send once, and distinguish acceptance from an unknown outcome.
- Bounded supported Codex native responses and Claude terminal question choices;
  support depends on the actual host/provider/request contract.
- Recovery journals that preserve uncertain results and block unsafe repeats.
- English/Korean UI, reviewed language-pack handling and voice-draft source.
  Voice end-to-end acceptance and complete accessibility remain unfinished.

This source contains implemented behavior, tests and explicit refusals for
unsupported paths. A feature's presence in code does not mean every device,
provider, permission dialog or failure mode has been accepted.

## Build the source preview

Tested source toolchain: Node.js 24.15.0. Native development uses Expo SDK 55
and React Native 0.83.10. The source tests also require Ruby 2.7+ on PATH
(tested here with Ruby 3.1.0), even when not compiling an iOS app.
Install the platform tools appropriate to your target:
Xcode and Ruby 2.7+ for iOS; Android SDK and JDK 17 for Android. Native builds
need a development client because this app includes custom native modules.

```sh
git clone https://github.com/Two-Weeks-Team/orca-commander.git
cd orca-commander/apps/mobile
npm ci
npm run start
# With the platform toolchain installed:
npm run ios
# or: npm run android
```

The source retains the legacy **Orca Deck** application name, bundle/application
IDs, deep-link scheme and protected-store namespaces to preserve continuity with
the tested implementation. The public project name is Orca Commander. No new
signing identity, store registration or production binary is supplied here.

Before pairing, the demo uses fixed examples. Pairing to your own host opens the
actual host view. Never post a pairing QR, token, host key or live owner content
in an issue or screenshot. See the [security policy](SECURITY.md).

## Run checks

```sh
node scripts/verify-upstream.mjs
node scripts/test-vendor-tools.mjs
npm --prefix apps/mobile ci --ignore-scripts --no-audit --no-fund
npm test
npm run typecheck
npm --prefix apps/mobile run test:prebuild
```

[Upstream manifests](docs/UPSTREAM.md) identify the exact vendored source pins.
Asset sources required by the integrity tests remain in `docs/deck-design/`;
see the [asset source notes](docs/deck-design/README.md). No Git LFS history or
private repository access is required to check out this public snapshot.

## Feedback and development

Use [Issues](https://github.com/Two-Weeks-Team/orca-commander/issues) for public
bugs, feature ideas and relevant external references. Include reproducible steps,
platform/app/host versions and the result you observed. Remove identifying and
secret material first. Keep suggestions and external reports distinct from
verified behavior.

Implementation and experiments happen privately. This repository receives
reviewed snapshots with an independent public Git history; it is not a mirror of
internal branches, conversations or PRs. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Original code and directly created assets are [MIT licensed](LICENSE).
Vendored code, fonts, icons and provider marks keep their separate terms in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The MIT license does not grant
trademark rights, sponsorship or endorsement.
