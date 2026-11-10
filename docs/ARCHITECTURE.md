# Architecture

The Expo/React Native app reads a paired Orca host and renders either a virtual
controller or a list. The host remains the source of truth for worktrees,
sessions, capabilities and provider state.

1. Vendored pinned transport/contracts provide direct paired E2EE and supported
   schemas. Pairing material lives in the platform protected store.
2. Read normalization, connection generations and bounded native-request scans
   feed the UI. Unknown/partial state stays visibly distinct from verified state.
3. Action clients prepare exact target/body context, require deliberate human
   confirmation, refresh authority at send time and validate the host response.
4. Separate bounded journals reserve a write before dispatch and retain uncertain
   outcomes across ordinary restart. They do not persist prompt/audio bodies or
   grant permission to replay a mutation.
5. UI catalogs, rendered assets and language packs remain separate from owner
   data and action authority. Voice results are editable drafts; an optional
   external-advisor boundary stays disabled.

See [SUPPORT.md](../SUPPORT.md) for unfinished paths. The frozen broader gate,
hardware phase and store distribution are not completed by this architecture.
