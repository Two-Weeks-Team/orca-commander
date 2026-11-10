# Dependency security status — 2026-11-11

The frozen source-preview dependency graph has known advisories. It is not a
clean security audit and is not presented as a production-safe dependency set.

`npm audit --json` returned exit 1 with 17 affected package entries: 5 high,
11 moderate, 1 low, 0 critical. Parent packages inherit findings, so this is not
17 independent vulnerabilities. The complete original audit is retained privately;
this summary and primary advisory links are public.

| Finding | Relevant path and limit |
|---|---|
| URL decoding denial of service | `expo-router` → `query-string` → `decode-uri-component`; malformed percent-encoded input can consume excessive CPU. The current public app's complete link/route reachability and exploitability have not been proven or ruled out. [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f), [earlier advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) |
| Zod resource exhaustion | The application's direct Zod is 4.6.7; a separate nested copy under Expo is affected according to the audit. A direct safe version does not clear the nested finding. [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |
| Forge verification/TLS/HTTP issues | `node-forge` is present in the Expo development dependency chain. This app does not directly import it for paired E2EE; that observation is not proof that every transitive use is unreachable. [signature advisory](https://github.com/advisories/GHSA-6889-vf6x-f3g5), [TLS advisory](https://github.com/advisories/GHSA-w4xr-hqv8-ch44), [HTTP advisory](https://github.com/advisories/GHSA-6cv4-p8m7-4r25), [session-state advisory](https://github.com/advisories/GHSA-j8rw-jp99-435v) |
| Glob/minimatch resource consumption | Build/development dependencies retain affected versions. [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| Prototype poisoning | Affected `deepmerge` is also present. [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) |

Do not expose development servers to untrusted networks or treat malformed
external input as trusted. These precautions do not fix the advisories. Source
and CI checks establish their stated contracts, not absence of vulnerabilities.

The audit's proposed top-level fixes include major Expo/router upgrades. The
publication cleanup does not silently change those versions or reuse old physical
acceptance evidence for a different dependency graph. Fixes must be implemented
privately, checked for the actual dependency paths, tested, and published as a
new verified snapshot. Do not run `npm audit fix --force` as a publication shortcut.
