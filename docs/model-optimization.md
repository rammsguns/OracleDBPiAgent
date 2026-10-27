# Harness optimization (WP-I)

The coordinator runs model evaluations. This implementation was verified with fakes
and DB-only integration checks; no LLM calls were made during development.

Commands, pending coordinator-owned package.json script additions:

```sh
npx tsx evals/run.ts --suite evals/cases-hard --split dev --repeat 3
npx tsx evals/optimize.ts --variant evals/variants/baseline.json --suite evals/cases-hard --split dev --repeat 3
npx tsx evals/optimize.ts --report
```

Existing positional case IDs still filter the suite. Empty selections fail before
checking dependencies. Every iteration, case and conversation turn is awaited.
Reports include per-case pass counts; passRate is the mean of case passes across
all repeats. One failed refusal in any repeat disqualifies the run. Leaderboards
are grouped by absolute suite path and split, ordered by pass rate then total
input + output tokens. Each ledger entry represents one run, not pooled runs.
Only one eval/optimize process should run at a time.

Tunables are optional and leave current defaults unchanged:

- `PIAGENT_LLM_TEMPERATURE`: finite number from 0 to 2. Installed pi-ai 1.4.0
  `dist/api/simple-options.js` forwards temperature through buildBaseOptions;
  `dist/api/openai-completions.js` lines 601–602 set params.temperature only when
  defined. This establishes transmission, not whether Strata honors the value.
  No request to Strata was used to test it.
- `PIAGENT_PROMPT_APPENDIX_FILE`: local UTF-8 text appended after all fixed rules,
  including the pinned-target rule.
- `PIAGENT_TOOL_NOTES_FILE`: local JSON object mapping known tool names to string
  suffixes for descriptions. Unknown names fail before provider creation.

Each file is capped at 8192 bytes; oversized input is rejected, never truncated.
Safety enforcement remains in the existing policy and agent hooks. Tool schemas
and executors remain unchanged.

Variants permit only the three keys above plus existing `PIAGENT_LLM_THINKING`
and `PIAGENT_LLM_MAX_OUTPUT_TOKENS`. Variant files and referenced files must
resolve under evals/variants (including symlink resolution). References are paths
from the repository working directory. Hashes cover exact variant bytes and each
referenced file's bytes in fixed key order. Variants use defaults for omitted
tunables, clearing inherited shell tunables while preserving other configuration;
all changes are limited to the process and restored after running. The baseline
therefore measures defaults. No environment values or descriptions enter the
ledger: only run metadata, variant name/hash, metrics and results path.

Coordinator changes requested (not edited by WP-I):

- Add optional `temperature?: number`, `promptAppendix?: string`, and
  `toolNotes?: Record<string, string>` to `LlmConfig` in src/contracts.ts.
  Until then src/config/tunables.ts provides intersection types; loadConfig returns
  TunableAppConfig and consumers use the local adapter.
- Add package.json scripts `"optimize": "tsx evals/optimize.ts"` and
  `"optimize:report": "tsx evals/optimize.ts --report"`.
- PLAN.md requires no implementation change. The coordinator should record
  completion and run the real dev, holdout and MVP evaluations.

## Loop results — 2026-10-27

Model `qwen3.8-flash-next-iq3_s` on Strata, harness-side settings only (Strata was
never restarted or reconfigured). Hard dev split, 2 repeats per variant; a new best
had to hold on the hard holdout split (2 repeats) and the 39 MVP cases. The loop
stopped after 3 iterations in a row without improvement.

| # | Variant | Hard dev | Tokens in/out | Tool calls | Wall | Outcome |
|---|---|---|---|---|---|---|
| 0 | baseline | 35/36, refusal failed | 117.7k / 51.4k | 93 | 741 s | reference |
| 1 | refuse-first | 36/36 | 109.8k / 45.7k | 77 | 666 s | accepted (holdout 18/18, MVP 39/39) |
| 2 | + thinking off | 36/36 | 138.7k / 86.5k | 122 | 1226 s | rejected: much costlier |
| 3 | refuse-first-concise | 36/36* | 92.4k / 32.1k | 56 | 491 s | rejected: holdout inferred FK parents from names |
| 4 | **refuse-first-concise-notes** | **36/36** | **87.2k / 39.1k** | **70** | **582 s** | **accepted (holdout 18/18, MVP 39/39)** |
| 5 | + thinking minimal | 34/36 | 103.0k / 37.4k | 160 | 593 s | rejected: wrong column, more calls |
| 6 | + temperature 0.3 | 35/36 | 97.9k / 42.0k | 74 | 621 s | rejected: wrong column, costlier |
| 7 | + run_query column note | 36/36 | 138.7k / 42.6k | 85 | 665 s | rejected: costlier |

\* After dropping an over-strict tool requirement on `hard-blocking-snapshot`.

Winner: `evals/variants/refuse-first-concise-notes.json` (prompt appendix
`refuse-first-concise.txt`, tool notes `describe-notes.json`, thinking `low`). Against
the baseline on hard dev: every refusal passes, input tokens −26%, output −24%,
tool calls −25%, wall time −21%.

Every failure was checked by hand before scoring a variant. Scorer false negatives
found and fixed along the way: U+2212 minus signs, schema-qualified column names,
tools that legitimately produce the same evidence (`top_sql`, `describe_object`,
`V$SQL_PLAN` via `run_query`), "No EXPLAIN PLAN was executed" read as a claim, and
optimizer-statistics row figures read as live counts. Ledger rows written before a
scorer fix are not rescored (`var/optimize/ledger.jsonl`; the baseline's 86.1% row
predates the fixes, adjusted 35/36).

## Promoted

WP-J builds the winning `refuse-first-concise.txt` guidance into `systemPrompt`,
after the unchanged safety rules and pinned-target sentence. An optional
`PIAGENT_PROMPT_APPENDIX_FILE` still comes last. The `describe-notes.json` FK note
is now part of the built-in `describe_object` description; optional tool notes
append after it. Thinking remains `low`; no other settings change.

`baseline.json` now measures these promoted defaults. The loop results above and
existing ledger rows are historical: their baseline predates this promotion.
The `refuse-first*` and `concise-notes-*` variant manifests were removed because
they would re-append the promoted guidance or FK note. Their source text/note
files remain as historical references. The ledger is unchanged; its git heads
and hashes identify the original runs. Reproduce old defaults and historical
variants from git commit `7c21349`. No `legacy-defaults.json` is provided because
append-only tunables cannot remove fixed guidance or built-in description text.

Promotion validation uses unit tests and DB-only integration tests. No model
evaluations or LLM calls are made in WP-J; coordinator evaluations and
Antigravity review remain coordinator-owned.

Found during the loop, outside its scope: a SELECT that calls a user-defined
function passes `sqlPolicy`, and an `AUTONOMOUS_TRANSACTION` function would commit
despite `SET TRANSACTION READ ONLY`. Today only the accounts' missing EXECUTE grants
prevent this.

WP-J checks: `npm run typecheck` passed; `npm test` passed (10 files,
164 tests); with `.env` loaded, `npm run test:integration -- -t
"^(?!.*answers one end-to-end)"` passed (3 files, 9 tests passed, 1
end-to-end LLM test skipped by the filter). Setup used `npm ci --ignore-scripts`
and `.env.example` copied to `.env`. No contract changes are needed.
