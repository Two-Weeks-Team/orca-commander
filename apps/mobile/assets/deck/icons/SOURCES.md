# Deck icons

Rasterized at 72 px from vector sources for the deck face (no SVG runtime):

- `claude.png`, `openai.png`: the desktop status-bar paths that Orca 1.4.246 ships in
  `mobile/src/components/AgentIcons.tsx` (stablyai/orca, MIT). The marks belong to their owners and identify the
  provider whose usage or agent is shown.
- `refresh.png`, `monitor.png`, `terminal.png`: Lucide `refresh-cw`, `monitor`, `terminal` (ISC).
- `activity.png`, `circle-check.png`, `circle-dashed.png`, `message-circle-question.png`: the exact Lucide 0.577.0 icons
  (ISC, `lucide-static`) that Orca 1.4.246's `src/renderer/src/components/AgentStateDot.tsx` draws for monitoring,
  done, an unproven state, and questions/permission. The working spinner and the fault/stop dots are drawn natively.

The complete Lucide 0.577.0 ISC and Feather-derived MIT notices are preserved
verbatim in [LUCIDE-LICENSE](LUCIDE-LICENSE). Keep this file with redistributed
PNG icons. Provider paths are derived from Orca and retain its
[MIT notice](../../../src/upstream/orca-1.4.245/LICENSE). Provider names and marks
remain their owners' trademarks; their identification here does not imply
affiliation, sponsorship, approval, or a trademark license.
