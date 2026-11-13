# Getting started

[Documentation](README.md) / Getting started

Choose between inspecting the interface locally and building a native development app. Neither path includes a production binary or a managed relay service.

## 1. Check the status first

This is an alpha source snapshot. Read the [support matrix](../SUPPORT.md), [security policy](../SECURITY.md) and [known dependency findings](DEPENDENCY_SECURITY.md). Some supported response paths depend on the current host/provider contract; this is not a generic remote terminal or universal approval client.

The public source pins identify Orca 1.4.214 and 1.4.245. Later developer observations are recorded separately. A pin or a newer version number alone does not guarantee that every action is available.

## 2. Prepare the tools

| Task | Tools |
|---|---|
| Install and inspect source | Git, Node.js 24, npm |
| Run the source test suite | Node.js 24; Ruby 2.7+ on `PATH` |
| Build iOS | macOS, Xcode and its iOS toolchain; supported Ruby/CocoaPods environment |
| Build Android | Android SDK/emulator or a development device, JDK 17, platform tooling |
| View documentation UI previews | Node.js 24, Python 3 and a browser; no native build, pairing or platform credentials |

Recorded local checks used Node.js 24.15.0 and Ruby 3.1.0. On macOS, system Ruby 2.6 can still be first on `PATH`. Check `node --version` and `ruby --version` in the shell where you run the tests; select a supported installed Ruby rather than bypassing the guard.

The source uses Expo SDK 55 and React Native 0.83.10, with local native speech and feedback modules and vendored audio code. **Use a development build; Expo Go does not include these modules.**

## 3. Clone and install

```sh
git clone https://github.com/Two-Weeks-Team/orca-commander.git
cd orca-commander
npm --prefix apps/mobile ci --ignore-scripts --no-audit --no-fund
```

This installs the locked mobile dependency graph without lifecycle scripts. Disabling install-time audit output does not resolve the documented advisories. Do not use an unreviewed major dependency upgrade as an installation workaround.

No Git LFS client, private repository, private conversation archive or private asset server is required for the public checkout. Some original Blender scene rerenders have separately documented private approval-board inputs; the retained shipping asset inputs and checks are a different scope.

## 4. Inspect the UI without connecting

The separate [visual preview tool](../scripts/showcase/README.md) builds the actual controller and reading-sheet components for a local browser. Its tasks, identities, usage values and voice transcript are fixtures; no host action client is loaded.

```sh
npm --prefix scripts/showcase ci --ignore-scripts --no-audit --no-fund
node scripts/showcase/generate.mjs --out /tmp/orca-commander-preview
python3 scripts/showcase/serve.py --directory /tmp/orca-commander-preview
```

Open `http://127.0.0.1:53719/`. This is a documentation viewer, not a functional web version of the mobile app. Its own tooling lockfile does not replace the mobile lockfile.

## 5. Build a native development app

From the repository root, with the appropriate platform tools installed:

```sh
npm --prefix apps/mobile run ios
# or
npm --prefix apps/mobile run android
```

These are the project's Expo native development commands. They may generate local native projects and require platform setup or signing choices. Use your own development identity. The repository supplies no Apple team, provisioning profile, store registration, release signing key or production build.

For an already installed compatible development client, start Metro with:

```sh
npm start
```

The public project's name is Commander, but the development app still uses Orca Deck's legacy display name, bundle/application IDs, deep-link scheme and protected-store namespaces. Avoid replacing or clearing an existing personal app installation just to inspect this source; use a separate development environment when appropriate.

## 6. Make a first connection carefully

1. Start an Orca host you control and use its supported mobile-pairing flow.
2. In the app's connection controls, scan that host's pairing QR. Grant the camera permission for scanning. On iOS, local-network permission may also be relevant for a LAN host.
3. Confirm the expected host and connection state. Unpaired, unknown, offline or retained context is not fresh write authority.
4. Start with reads: check the project/worktree/session identity, open the selected session's full content and compare it with the host.
5. If you choose to test input, use a harmless development session, review the complete target and body, and independently inspect the host result.

Never publish a QR, pairing code, token, host key, live session transcript or identifying screenshot. A recording preview in the gallery is not a reason to grant microphone access; native voice is a separate, host-selected flow with incomplete end-to-end acceptance.

## 7. Run checks

```sh
node scripts/verify-upstream.mjs
node scripts/test-vendor-tools.mjs
npm test
npm run typecheck
npm --prefix apps/mobile run test:prebuild
```

Prebuild checks generated platform configuration; they do not compile, install or launch a native app. The source/domain suites include synthetic boundaries. See the [verification record](VERIFICATION.md) for actual results and the original retained failures.

## Troubleshooting

| What you see | What to check |
|---|---|
| Native module missing in Expo Go | Build/install a compatible native development client |
| Ruby version guard fails | Check the effective `ruby --version` and select Ruby 2.7+ on the same shell's `PATH` |
| The host cannot be reached | Check host availability, endpoint/network and relevant platform permission; do not paste the pairing payload into an issue |
| A control stays disabled | Check live/fresh state, selected identity, host capability and recovery state; unsupported requests are intentionally blocked |
| Context appears retained/stale | Wait for a current host read; the old display does not grant authority |
| A send result is unknown | Inspect the actual host result before acknowledging or preparing another send; do not reset storage to dismiss uncertainty |
| UI preview has no microphone or haptic effect | Expected: the documentation renderer has no native bridge or live speech |

For a bug, report versions, platform, connection state and minimal reproduction with synthetic or redacted data. [Reporting guide →](../CONTRIBUTING.md)
