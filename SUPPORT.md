# Support and limitations

This first public snapshot is an experimental source preview. It has no stable
release binary, public beta service or app-store acceptance. Historical
observations below are bounded developer records, not a fresh device run on
this public tree.

| Area | Implemented / observed | Limit |
|---|---|---|
| Direct connection and reads | Paired E2EE transport, live inventory, target identity and reconnect guards; selected iPhone/Android real-host observations exist | Operated Relay, arbitrary networks and all multi-host/device combinations are not accepted |
| Text input | Full target/body review, 0.8-second deliberate hold, fresh target check, one-shot write and unknown-result recovery | Source tests and selected physical sends do not prove every interruption/concurrent-writer case; host fences are not atomic CAS |
| Claude terminal questions | Bounded supported question parsing, selection, confirmation and observed numeric-answer flows | Actual permission allow/deny dialogs and every viewport/provider format are not accepted; do not infer universal approval support |
| Codex native responses | Narrow command approval and original async-question contracts | Unsupported providers, remote/native paths and orchestration gates remain contract-specific or unavailable |
| Default-agent instruction (H1) | Supported Codex launch/replay contract, explicit worktree/prompt confirmation, uncertainty fence and selected physical acceptance | Claude fallback/reuse is not a generic new-session capability; original Node24 disk/restart harness has unresolved failures |
| Virtual controller UI | Phone/tablet/Fold geometry, rendered assets, full-content sheets, settings and large-font corrections | Complete Fold rotation/retention, all large-text layouts and complete VoiceOver/TalkBack acceptance remain open |
| Voice | Host-selected transcription, editable drafts, navigation and reply/narration source | Voice roundtrip, narration, interruption/unknown recovery and broad recognition accuracy are not accepted end to end |
| Languages | English/Korean catalogs and bounded import/review/file handling | Translation quality, every picker/storage roundtrip, pronunciation and all accessibility combinations are not accepted |
| Physical controller | Semantic-action/UI groundwork | No controller hardware, firmware, USB desktop bridge or manufacturing readiness is delivered |

The private project's broader compatibility gate remains NO-GO. That record
includes operated-Relay and release requirements beyond this source preview;
source publication does not close it. Store distribution, signing rights,
privacy/export declarations and a stable release require separate evidence.

## Reported host observations

Frozen upstream source pins are 1.4.214 and 1.4.245. They are integrity and
contract-test inputs, not promises that every current host feature exists on
those releases. Runtime capability, connection generation and current target
checks determine availability.

The latest retained developer record compares used contracts through Orca
1.4.253 and reports S23 LIVE, one typed send, one H1 launch and one bounded
Claude question answer with independent result checks. It does not establish
new 1.4.253 physical acceptance for iPhone or Fold. Earlier device observations
belong to their respective builds and host versions.

## Known verification gap

A separate original H1 SQLite disk/restart harness recorded 68 passing and 3
failing cases on Node24.15.0 involving an embedded-NUL key read. Standalone
installed-runtime checks and a physical H1 result were recorded separately;
they do not turn that original harness into an overall pass. See the
[evidence summary](docs/VERIFICATION.md).

## Dependency advisories

The 2026-11-11 audit reports known dependency findings, including high-severity
entries. They are not waived by the source-preview label or CI results. Read
[dependency security status](docs/DEPENDENCY_SECURITY.md) for the original result,
primary sources and the unverified runtime-reachability limits.
