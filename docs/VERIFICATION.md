# Verification record

Public snapshot checks were run on 2026-11-11 with Node.js 24.15.0. Results
are recorded below. Historical device records are
summarized separately and are not represented as new tests of this public tree.

## Current public-tree checks

Local execution used Node.js 24.15.0 and Ruby 3.1.0 on macOS. These checks were
run against the selected public files, not inherited from a private CI badge.

| Check | Actual result | Scope |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` in `apps/mobile` | exit 0; 668 packages installed | Locked dependency installation; lifecycle scripts disabled |
| `node scripts/verify-upstream.mjs` | exit 0; 13 + 60 source hashes and notices match | Selected pinned sources, not full installed host attestation |
| `node scripts/test-vendor-tools.mjs` | exit 0; 63 assertions | Temporary Git repository, no live host |
| `npm test` with supported Ruby | exit 0 | Complete configured domain/source/JSX/asset regression command, synthetic boundaries as named by each test |
| `npm run typecheck` | exit 0 | Whole application TypeScript |
| `npm --prefix apps/mobile run test:prebuild` | exit 0 | Generated iOS/Android configuration only; no native compile/install/device |
| Branding generator `--check` | exit 0 | Canonical logo/platform icon bytes and generated manifest reproduce exactly |
| Dependency audit | **exit 1; 17 affected package entries, including 5 high** | Known findings remain; see [dependency security status](DEPENDENCY_SECURITY.md) |
| Credential-pattern scan | exit 1; one manually confirmed function-name false positive | The vendored `deriveV2KeySchedule` function reference is not a credential; the original finding is retained |
| Selected image coverage | 217 PNGs match exact hashes of previously scanned images | Earlier OCR/barcode/metadata checks were pattern-limited; no new device or visual acceptance is inferred |

The first domain run failed because PATH selected macOS system Ruby 2.6.10.
That original failure is retained. After selecting the existing Ruby 3.1.0,
the full same domain command completed with exit 0; no product code or test
assertion was changed to bypass the Ruby guard.

Full original upstream Mobile builds/tests, fresh native iOS/Android builds,
real-device flows, complete security certification and an app-store distribution
review were **not** rerun for this public export. No private screenshot, token,
conversation, PR history or raw device ledger is included as public proof.

Independent source review identified inherited LFS rules, a real private-network
address in one fixture and outdated support/license UI text. The selected files
were corrected and restaged: PNGs are ordinary Git blobs, the fixture uses a
synthetic CGNAT address, and the two locale strings point to this project and MIT.
The configured domain command and application TypeScript were rerun after these
corrections. Native IDs, runtime control behavior, dependency versions and image
bytes were preserved.

The public history starts independently from a fresh root snapshot. Private
commits, branches and PR refs are not imported. Local command logs and the
source-to-public mapping remain private; the public results above are
maintainer-reported execution summaries.

## Historical observations and remaining limits

Developer records include iPhone, S23 and Fold observations on selected normal
builds/hosts, including live reads, guarded terminal input, supported Codex paths
and bounded Claude question replies. The latest 1.4.253 record covers S23 LIVE,
typed input, guarded launcher checks and a bounded Claude question reply only. These records do not prove
all current platforms, permission dialogs or failure modes.

Original raw records, screenshots, sessions and internal PR history remain
private. This public summary is a maintainer-reported history; readers cannot
independently reproduce those past physical observations from private logs.
The included source tests provide a separate reproducible form of evidence.

Known gaps remain: full voice roundtrip/narration, comprehensive VoiceOver and
TalkBack, real permission dialogs in the recorded bypass-mode fixture, Fold
orientation/retention coverage, disk/key-loss/multi-device recovery and stable
release/distribution acceptance. A separate original H1 Node24 SQLite harness
recorded 68/71 passes and 3 failures; separate installed-runtime/physical results
do not erase those failures. See [support](../SUPPORT.md).
