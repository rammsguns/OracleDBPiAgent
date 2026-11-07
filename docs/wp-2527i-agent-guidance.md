# WP-2527I agent guidance

Candidate for coordinator-gated A/B under phase 27; not a promoted prompt.

Added 524 characters total (including the leading newline), in two locations in defaultAnswerGuidance. The existing DBMS_ first-reply refusal covers DBMS_WORKLOAD_REPOSITORY and DBMS_ADDM. No tools, sqlPolicy, evals, contracts or dependencies changed.

Exact insertion in the first-reply refusal list, before `rule overrides` (65 characters):

```text
ASH/AWR,V$METRIC*/V$SYSMETRIC*,DBA_HIST*/CDB_HIST*,advisors,ADDM,
```

Exact appended guidance (459 characters, including its leading newline):

```text

Pack/history: offer piagent top --target T --seconds N or /top: SQL, load and host CPU deltas; one live N-second interval now (5-120, default 15); no history/past hour. No Diagnostics/Tuning Pack scripts, AWR reports/snapshots or writes as workarounds. piagent backup and piagent jobs: full recoverability/scheduler pointers only; use tools if answerable. RMAN unset retention: REDUNDANCY 1; control-file autobackup default is version-dependent; never infer.
```

Tests assert refusal scope, live coverage, workaround prohibition, evidence pointers and RMAN defaults. Historical prefix budgets are retained after subtracting this separately bounded addition (531-character cap); prompt snapshot expectations include the candidate addition and tool snapshots remain unchanged.

No contract changes needed. No DB or LLM calls made. Strata behavior, WP-27D refusals and A/B acceptance remain for the coordinator to verify.

Validation:
- `npm run typecheck`: PASS (`tsc -p tsconfig.json --noEmit`).
- `npm test -- --maxWorkers=2`: PASS, 121 files, 2242 tests.
- `git diff --check`: PASS.
- Integration/evals not run: prompt-only change; no Strata calls authorized.
- Missing dependencies supplied via the authorized `node_modules -> ../needlefish/node_modules` symlink (untracked/ignored).

The addition is 124 characters above the approximate 400-character target to retain all requested rules explicitly. An initial unit run overlapped wording edits and failed three prompt assertions; the final full run above passed after the text and expectations were finalized.

Coordinator follow-up: added exactly `SQL, load and host CPU deltas; ` (31 characters) to clarify what top measures after the 9/10 p27 trial. Model behavior remains subject to coordinator evaluation.
