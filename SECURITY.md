# Security policy

Orca Commander is an experimental source preview. It has no stable supported
release channel and no claim of complete security certification.

Do not put credentials, pairing QR data, device tokens, host keys, personal
paths, live owner content or raw audio/transcripts in public issues. If private
vulnerability reporting is enabled for this repository, use its Security tab to
submit a private report. If that channel is unavailable, ask for a private
contact without including the sensitive details in public.

Pair only with a host you control. Long-lived API keys belong on a trusted host,
not in the app bundle, pairing links, RPC logs or notifications. Protected
pairing custody and recovery journals are separate boundaries. Review the exact
target/content before any write; an uncertain result requires independent host
reconciliation and must not be replayed automatically.

Voice creates a draft, never an approval or automatic send. The host owner
selects local/cloud speech and holds any cloud key. This source implements no
Deck analytics collector or enabled external-advisor API call. Adding a new
external data flow requires a reviewed contract and explicit consent.

Deleting app data, uninstalling or restoring an old backup may remove local
uncertainty fences. Reconcile unknown host outcomes before those operations.
Source publication does not authorize resets of accounts, pairing or existing
app data.

Known dependency findings are recorded in [DEPENDENCY_SECURITY.md](docs/DEPENDENCY_SECURITY.md). Passing source checks does not clear that audit.
