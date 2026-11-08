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
No additional database queries are issued. No dependencies were added.

The adapter reuses existing failed scheduler run names and unusable index unit
names, filtering maintenance owners with the same user metadata as the check.
Default-password account names are also capped at five in the tool summary.
Names are deduplicated, validated as simple Oracle identifier components and
passed through existing credential redactors. Invalid objects are already
aggregated by owner/type in the collector: individual object names are not
available, and the adapter does not invent them or issue another query.
`Names (up to 5)` describes examples, not complete evidence.

## Size measurement

Sequential live captures on 2026-11-08, with default thresholds, using
`checkedHealth` and the complete serialized `boundedHealthResult` envelope.
The baseline was captured before editing. The after capture used the new adapter.
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
