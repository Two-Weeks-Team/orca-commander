# Contributing to Orca Commander

Useful contributions make a specific user task clearer, safer or reproducible. Start with the [product introduction](README.md), [support matrix](SUPPORT.md) and [development guide](docs/DEVELOPMENT.md).

## Where to start

| Contribution | Include |
|---|---|
| Bug | Public source revision, platform/host versions, minimal steps, expected and actual result |
| Design or feature idea | The user's moment, current limitation, proposed behavior and effect on reading/navigation/confirmation |
| External reference | A primary-source link, what it demonstrates and why it applies; distinguish observation from inference |
| Translation | Locale, original key/context, proposed wording and any placeholder/space/accessibility implications |
| Code patch | One coherent problem/change, meaningful checks and explicit unverified cases |
| Documentation or media | Correct source links, descriptive alt text and reproducible synthetic image provenance |

Use the [issue chooser](https://github.com/Two-Weeks-Team/orca-commander/issues/new/choose). Search for an existing report before opening a duplicate. Do not create a public security issue containing sensitive details; use the [private vulnerability report](https://github.com/Two-Weeks-Team/orca-commander/security/advisories/new) and [security policy](SECURITY.md).

## Reproduction and evidence

Prefer a small synthetic fixture that another contributor can run. State what you actually observed, its environment and the boundary tested. A source assertion, browser image, simulator result and real-host/device observation are different kinds of evidence.

Never attach pairing QR material, credentials, account/device identifiers, personal paths, raw owner logs, audio or unrelated work content. Redact or recreate examples before posting. Report original failures/skips rather than relabeling them as passes.

## Code boundaries to preserve

- Bind writes to exact current target/request identity; labels and model output are not authority.
- Keep explicit full-content review and deliberate human confirmation.
- Preserve durable uncertainty fences and the prohibition on automatic mutation replay.
- Treat unavailable journal/storage and incomplete/unknown evidence as meaningful refusals.
- Keep pure policies in `core/`, effects in `adapters/` and presentation in `ui/`.
- Do not silently change vendor pins, native application IDs, protected-store namespaces or dependency majors.
- Retain original MIT and third-party notices with redistributed material.

Run the [relevant checks](docs/DEVELOPMENT.md#what-each-check-proves) for the change. Desktop CI does not substitute for native/device, voice, accessibility or recovery acceptance. For new public imagery, use synthetic data and the [documentation renderer](scripts/showcase/README.md), not a live owner session.

## Review and publication

Implementation and experiments happen privately. This public repository receives reviewed, coherent snapshots with independent history. Issues and pull requests are welcome as inputs; they are not automatic acceptance of a capability or a promise to support an unverified path.

Maintainers evaluate the problem, implement/adapt privately and return a verified change or an accurate status publicly. Public commits describe the final change without exposing private PRs, conversations or raw evidence. The [roadmap](docs/ROADMAP.md) records direction without promising release dates.

Follow the [community guidelines](CODE_OF_CONDUCT.md). Be precise, curious and respectful when comparing evidence or challenging a design choice.
