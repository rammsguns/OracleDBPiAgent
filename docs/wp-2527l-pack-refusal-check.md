# WP-2527L: pack refusal revision check

Implemented a deterministic `finishTurn` decision before the zero-successful-tool
and refusal grounding exits. A pure exported `needsPackRefusalCorrection` helper
recognizes pack/history sources in user questions or the final answer. It asks
for one complete replacement when the live alternative is missing or the answer
suggests pack scripts, packages, reports or snapshot creation.

The fixed correction preserves the refusal, removes host-side workarounds, and
names `piagent top --target <pinned/default target> --seconds N` (or `/top` in
chat), SQL/load/host CPU deltas, one live 5–120 second interval now, default 15,
and no history. Tools are removed from revision requests and blocked defensively
in the hook. An attempted tool call ends the pack revision rather than looping.
The existing numbers correction and this correction share `correctionScheduled`:
whichever runs first consumes the single follow-up allowance for that run.
Grounding still checks subsequent eligible answers, including residual numbers.
The pack check also operates when optional factual grounding is disabled.

No system prompt text changed. No contracts, dependencies or eval files changed.
The coordinator must run the gated A/B before promotion.

Detection intentionally accepts incidental AWR mentions as source context: an
extra live-alternative suggestion is acceptable under the requested scope.
Ordinary application snapshots do not trigger it. Workaround detection uses
clause-level prohibition matching to distinguish an explicit ban from a
recommendation, including contrast clauses such as “cannot query AWR, but run
awrrpt.sql”. This is a bounded lexical check, not a guarantee of understanding
all paraphrases or of model compliance after the single revision.

Unit coverage includes the named source families, scripts/packages/reports,
explicit prohibitions, compliant refusals, ordinary snapshots, zero-tool
responses, disabled grounding, pinned/default targets, per-run reset, shared
numbers allowance in both orders, residual grounding, and attempted tools.

Validation: `npm run typecheck` passed. `npm test -- --maxWorkers=2` passed
(126 files, 2,323 tests). No DB or LLM calls were made; integration tests and
live A/B were intentionally left to the coordinator as requested.
