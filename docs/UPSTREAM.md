# Upstream source

Selected unchanged sources are vendored from [Orca](https://github.com/stablyai/orca).

| Contract profile | Exact source | Manifest |
|---|---|---|
| Initial 1.4.214 | `7e935c596129ff9bed35a4eaebd1b0a5668a2b98` | [upstream-lock.json](upstream-lock.json) |
| Installed-release 1.4.245 | `1c6ac8c3c4d2c3dec2cb5966d225ca2a0e0471d3` | [upstream-installed-lock.json](upstream-installed-lock.json) |

Run `node scripts/verify-upstream.mjs` to check all listed source hashes and MIT
notices. The two profiles contain 13 and 60 selected source files respectively.
Do not edit those copies or silently change a pin to make a failing check pass.
The full original upstream builds/contracts can be checked through the included
pinned-upstream workflow; local source hash verification is a narrower check.

Runtime support depends on advertised capabilities and the actual request/host
contract, not on a blanket list of version strings. Later used-contract audits
and selected device observations are described in [support](../SUPPORT.md) and
[verification](VERIFICATION.md). A source pin is not complete installed-binary
attestation or operated-Relay authorization.

Upstream Orca copyright belongs to Lovecast Inc.; the vendored audio package
retains its Cantab Research notice. This is an independent project. See the
[root notices](../THIRD_PARTY_NOTICES.md).
