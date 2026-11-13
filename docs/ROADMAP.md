# Roadmap

[Documentation](README.md) / Roadmap

This is a direction and acceptance checklist, not a release promise. Items implemented in source, tested synthetically and observed on a device have different evidence. The [support matrix](../SUPPORT.md) and [verification record](VERIFICATION.md) are the current boundaries.

## Present in the source

- [x] Paired direct E2EE read/transport integration using selected pinned contracts.
- [x] Controller and list presentations, project/tab selection and attention navigation.
- [x] Full-content reading sheets, status/usage presentation and English/Korean UI.
- [x] Guarded text preparation, explicit confirmation and bounded response paths.
- [x] Recovery journals that preserve uncertain results and block unsafe repeats.
- [x] Voice-draft, reply/narration and language-pack source with explicit limits.
- [x] Public license/notices, CI, source-driven UI gallery and editable design diagrams.

A checked item means its source/documentation exists. It does **not** mark all device, provider, recovery, voice or release tests complete.

## Priority: harden the alpha

| Work | Completion evidence sought |
|---|---|
| Resolve dependency findings | Reviewed compatible graph/migration, audit results retained, affected source/native/contract checks rerun |
| Explain compatibility precisely | Per-host/provider support and refusals tied to reproducible contracts; no generic approval claims |
| Close original H1 disk/restart failures | Reproduce the original 68/71 harness result, fix the embedded-NUL/key-read boundary and rerun that original harness |
| Expand recovery coverage | Disk/key loss, multiple devices, process/background interruptions and unknown outcomes reconciled independently |
| Validate native layouts | Actual target-platform builds and bounded phone/tablet/Fold orientation/retention checks, beyond browser and source assertions |
| Improve accessibility evidence | Complete intended flows with VoiceOver/TalkBack, large text, focus and permission dialogs |
| Validate voice and narration | Real host-selected end-to-end capture/transcription/edit/reply flows, interruption and uncertainty handling, language accuracy |

The 2026-11-11 audit has unresolved high-severity entries. Documentation quality and green CI do not waive those findings. [Security status →](DEPENDENCY_SECURITY.md)

## Before a stable mobile release

- [ ] Record intended iPhone/Android behavior against real supported hosts, including refusal and reconnect cases.
- [ ] Reconcile broader compatibility and release gates with concrete evidence.
- [ ] Define supported versions and a repeatable native build/signing/distribution process.
- [ ] Complete relevant privacy, permissions, bundled third-party notices and store/beta requirements.
- [ ] Publish versioned release notes and artifacts only when those artifacts are actually built and checked.

No public beta service, operated Relay, production binary or store acceptance is currently delivered.

## Later: a dedicated desk controller

The product direction includes a small physical control surface for Orca. The selected connection is USB-C directly to the host computer, with a desktop bridge. Hardware starts after the app demonstrates its intended behavior and value on the target platforms.

The peripheral should emit semantic intent, not host credentials, terminal bytes or unreviewed mutations. Its form factor, key count and output capabilities must preserve complete target/content review and the same uncertainty boundaries.

- [ ] Establish the app-to-hardware entry evidence and user value.
- [ ] Define the concrete capability profile and independent confirmation surface.
- [ ] Design the desktop bridge and USB transport without bypassing guarded action clients.
- [ ] Only then choose electronics, firmware, enclosure and physical prototypes.

There is no PCB, enclosure CAD, firmware, BOM, manufacturing plan or working USB controller in this repository. The mobile screenshots are UI previews, not hardware renders.

## Suggest a direction

Bring a concrete user moment, a proposed result and relevant sources. Explain whether it changes reading, navigation, drafting or a write boundary, and what evidence would show it helps. Discuss ideas publicly; implement/evaluate privately; return a verified change or accurate status publicly.

[Contributing](../CONTRIBUTING.md) · [Design](DESIGN.md)
