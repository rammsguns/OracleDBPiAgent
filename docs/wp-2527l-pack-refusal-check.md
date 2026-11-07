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

## Antigravity findings fixed before merge

Findings 1, 2, 3 and 5 are addressed:

- Shared view matching covers `AWR_CDB_*`, `AWR_PDB_*`, `AWR_ROOT_*`,
  `V$`/`GV$` views containing `METRIC`, and `GV$ACTIVE_SESSION_HISTORY` in
  both question sources and forbidden workaround suggestions.
- Semicolons, `, so`, `so you can` and `therefore` separate clauses, preventing
  an earlier negation from hiding a subsequent recommendation.
- `DBMS_SQLTUNE` procedures and named SQL Tuning/Access Advisors are recognized
  in questions and workaround suggestions. Bare “advisor” remains excluded.
- Bracketed `[/top]` is accepted; `/topic` remains excluded. The replay oracle
  uses the same bracket allowance.

New table-driven tests cover each source as a question, suggestion and explicit
prohibition, preserve the successful non-refusal exclusion, and exercise every
new clause separator and bracket handling.

Replayed the supplied `gate150`, `gate150b` and `gate150b-p2324` directories
from `../coord-score`: 748 records; **0 incorrect fires among 595 passing
records with tools**. All 11 eligible failing pack refusals still trigger.
The same three metric-history records are excluded by condition (2), so the
script continues to exit 1 intentionally. Newly recognized forbidden view
suggestions also trigger in three additional passing, zero-tool records;
none are passing tool-using answers.

No system prompt, contracts, agent control flow or correction allowance changed.
No DB or LLM calls were made. The coordinator still owns the live A/B gate.

Validation after review fixes: `npm run typecheck` passed (exit 0);
`npm test -- --maxWorkers=2` passed (126 files, 2,362 tests, exit 0).
