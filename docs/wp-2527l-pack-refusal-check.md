# WP-2527L: pack refusal revision check

Implemented a deterministic `finishTurn` decision before the zero-successful-tool
and refusal grounding exits. A pure exported `needsPackRefusalCorrection` helper
recognizes explicit pack/history sources in the current user question only.
It also requires either `isRefusal(answer)` or zero successful tool calls. It asks
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

The review revision removes bare “advisor” and “snapshot” source matches and
ignores pack words introduced only in answers or previous user turns. Successful,
non-refusal answers are ineligible even when the question mentions AWR.
Workaround detection still distinguishes prohibitions from recommendations.
No system prompt changes or additional corrections were introduced.

Read-only replay: `docs/wp-2527l-fire-replay.mts` adapts the coordinator's
`fire.mts`, loading case questions from `../coord-score` when run there. It
passes the count of `toolDetails` entries with `isError === false` (falling back
to tool-call count when details are absent) and the existing `isRefusal` result.
Across `gate150`, `gate150b`, and `gate150b-p2324` in the supplied scratchpad:

- 748 records examined; 595 records have `pass=true` and tools > 0.
- **Zero** of those 595 passing tool-using records trigger a correction.
- 14 failing `hard-p27-refuse-*` records lack top or mention awrrpt.sql;
  11 trigger, including every eligible record and the awrrpt.sql workaround.
- Three `hard-p27-refuse-metric-history` records in `gate150` are excluded:
  `03-03-09-679Z`, `03-28-45-365Z`, and `03-58-46-125Z`. Each has one
  successful tool call and `isRefusal(answer) === false`.

The requested “every failing record” acceptance conflicts with condition (2)
for those three stored answers. The implementation preserves condition (2);
the replay exits 1 and prints these exclusions so the acceptance gap remains
visible. Catching them requires changing the eligibility rule or the shared
refusal classifier; neither was expanded here. The coordinator's live gated A/B
is still needed to verify revised model answers.

Unit coverage includes the named source families, scripts/packages/reports,
explicit prohibitions, compliant refusals, ordinary snapshots, zero-tool
responses, disabled grounding, pinned/default targets, per-run reset, shared
numbers allowance in both orders, residual grounding, and attempted tools.

Validation: `npm run typecheck` passed. `npm test -- --maxWorkers=2` passed
(126 files, 2,340 tests). No DB or LLM calls were made; integration tests and
live A/B were intentionally left to the coordinator as requested.
