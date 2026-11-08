# WP-31C health_check summary

The agent tool now labels every emitted non-OK check (including UNKNOWN,
SKIPPED and policy-mapped UNKNOWN) with `measures:` and retains its existing
`piagent ... --target ...` drill-down command, scope and evidence limitations.
Maintenance explicitly counts invalid objects plus unusable index, partition
and subpartition units belonging to non-Oracle-maintained owners. Every other
check family has its own measure, including placeholder space checks. Archived-log
gaps are labelled as sequence ranges because the existing check counts gap
ranges rather than summing all missing sequence numbers.

Only the agent tool adapter changes. CLI Markdown/JSON, check thresholds,
collectors, shared contracts and the existing agent guidance stay unchanged.
The original adapter issued no additional queries; the gate follow-up below
adds one bounded invalid-object detail query. No dependencies were added.

The adapter reuses existing failed scheduler run names and unusable index unit
names, filtering maintenance owners with the same user metadata as the check.
Default-password account names are also capped at five in the tool summary.
Names are deduplicated, validated as simple Oracle identifier components and
passed through existing credential redactors. The original version could not
name invalid objects because their collector aggregates by owner/type; the gate
follow-up below closes that gap with a detail query. `Names (up to 5)` describes
examples, not complete evidence.

## Size measurement

Sequential live captures on 2026-11-08, with default thresholds, using
`checkedHealth` and the complete serialized `boundedHealthResult` envelope.
The baseline was captured before editing. The after capture used the new adapter
at `ad018f9`, before the label-only review follow-up below.
No result was truncated. Windows and snapshots naturally differ between captures.

Counts use offline **cl100k_base** tokenization as a reproducible size proxy,
not the Strata model tokenizer or actual billed/input usage. The tokenizer was
installed into a temporary Python environment outside this repository; Strata
was not contacted for measurement. The coordinator's A/B gate must measure
actual model input tokens and answer quality.

| Target | Text tokens before → after | Serialized result tokens before → after | Result bytes before → after |
| --- | --- | --- | --- |
| d1-19c-lab | 308 → 379 (+71) | 331 → 402 (+71) | 1112 → 1467 |
| p1-19c-prod | 209 → 245 (+36) | 231 → 267 (+36) | 805 → 997 |
| c1-19c-pdb | 183 → 263 (+80) | 205 → 285 (+80) | 601 → 926 |

The absolute increase is 36–80 proxy tokens per result; OK rows remain omitted.
C1 includes existing failed-job and unusable partition names.

## Validation

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 141 files, 2694 tests passed (104.28s).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/health-summary.test.ts tests/integration/check.test.ts tests/integration/c1-pdb-live.test.ts --no-file-parallelism`: 3 files, 5 tests passed (79.74s).
- Focused health summary unit suite: 24 tests passed (1.16s).
- Summary unit fakes cover every measure, all emitted statuses, drill-downs,
  preserved limitations, safe/deduplicated/capped names, excluded Oracle owners,
  no extra queries and the existing serialized-result bounds.

The full integration npm script selects all integrations (including LLM tests),
so its initial invocation was stopped and the relevant DB-only files were run
explicitly. No contract changes requested. Agent answer quality
and actual Strata tokens remain for the coordinator's A/B gate.

## Antigravity minor follow-up

The review of `ad018f9` found that the credential-assignment redactor interpreted
`defaultPasswords: CRIT` as a password key/value pair and masked `CRIT`.
The tool now renders that fixed label as `defaultPasswords CRIT 5 accounts`
(without the colon). Other check labels retain their existing formatting.
The entire assembled result still passes through both existing credential
redactors; no redaction patterns or dynamic-field protections were weakened.

Two regression tests verify that the bounded tool result retains per-check CRIT
and that credential-looking names, target names and evidence values remain
redacted while the status stays visible. No shared contract, CLI output,
collector, agent guidance or dependency changes were needed.

Follow-up validation:

- `npm run typecheck`: passed (exit 0).
- `npm test -- --maxWorkers=2`: 141 files, 2696 tests passed (103.15s).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/health-summary.test.ts tests/integration/check.test.ts tests/integration/c1-pdb-live.test.ts --no-file-parallelism`: 3 files, 5 tests passed (77.38s).

No LLM calls, pushes or merges. No contract changes requested. Model-level A/B
verification remains with the coordinator.


## Gate follow-up: complete maintenance name sources

Merged `master` first with `git merge master` (merge commit `b59e1d6`); no
conflicts. The merged tree includes WP-31A/31B.

Maintenance names now combine invalid objects (`OWNER.OBJECT_NAME (TYPE)`),
unusable indexes, partitions and subpartitions. Invalid-object names come from
one extra read-only `DBA_OBJECTS`/`DBA_USERS` query when grouped invalid counts
are positive and maintenance is enabled. It excludes Oracle-maintained owners,
orders by owner/name/type, uses the configured row cap, and runs through the
existing audited session inside the jobs probe's remaining statement budget.
The original grouped measurements and CLI contracts remain unchanged.

All existing name-bearing checks (maintenance, failed jobs, default passwords)
now sort their full source set deterministically, deduplicate, cap at five and
append `+N more` when names are omitted. Failed jobs still use every FAILED run
that contributes to its count; recurring failures of the same job share one
name. Default-password names still use all findings. No other existing names
list draws from a subset of its counted categories.

Unavailable or capped invalid-name evidence is explicitly labelled incomplete;
the numeric maintenance verdict is retained when the count evidence is complete.
For maintenance, the omitted-unit tail also accounts for counted units absent
from the bounded name evidence. Names remain validated and credential-redacted.
Queries are separate snapshots; names and grouped counts can change between them.

Live C1 verification: `npm run piagent -- check --target c1-19c-pdb` returns WARN
(exit 1), including maintenance `2 objects/index units`. The agent adapter's
same check-style Markdown renderer (`renderCheckMarkdown(checkedHealth(...))`)
shows both names in that row; the CLI itself continues using the original
collector notes, as required by this agent-path package's scope:

```text
| c1-19c-pdb | maintenance | WARN | 2 objects/index units | 1 / 20 | This PDB (PIPDB1) | piagent jobs --target c1-19c-pdb | Index, partition and subpartition units counted separately. Names (up to 5): SHOPAPP.HISTORY_ORDER_IX.P_202601, SHOPAPP.INVALID_CUSTOMER_VIEW (VIEW). |
```

Tests cover mixed invalid-view/partition names, every maintenance unit category,
reversed input ordering, five-name caps and omitted tails for all name lists,
capped/unavailable invalid-object details, owner filtering and query row bounds.
The live health-summary test now asserts both C1 defect names on the maintenance
line.

Gate follow-up validation:

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 142 files, 2793 tests passed (101.90s).
- `PIAGENT_SECRET_DIR=/home/kiwi/OracleDBHarness/databases/secrets npx vitest run tests/integration/health-summary.test.ts tests/integration/c1-pdb-live.test.ts tests/integration/c1-review.test.ts --no-file-parallelism`: 3 files, 5 tests passed (76.70s).
- Live CLI check: WARN, exit 1 as expected. Live adapter text and check-style
  Markdown both contain the invalid view and unusable partition names.

No shared contract changes requested. Actual model answer quality remains for
the coordinator's A/B gate. No LLM calls or pushes.
