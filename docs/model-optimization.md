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

After promotion, the coordinator evaluated the defaults on Strata
(`qwen3.8-flash-next-iq3_s`, thinking `low`). The first pass regressed on
`hard-region-channel`: the model used COUNTRY_SUBREGION where the question asked
for a different column. So `run_query` now carries a generic column-name note:
use only column names already seen in a tool result, confirm unseen ones with
`describe_object`, and never substitute a similarly named column. The note gives
generic examples, not the eval's own columns. Final results (commit `418497a`):

| Suite | Pass | Refusals | Tokens in/out |
|---|---|---|---|
| MVP (`evals/cases`, ×1) | 39/39 | all pass | 79.6k / 14.1k |
| Hard dev (×2) | 36/36 | all pass | 143.1k / 44.5k |
| Hard holdout (×2) | 18/18 | all pass | — |

Compared with the original baseline (117.7k in / 51.4k out on hard dev), input
tokens rose 22% and output tokens fell 13%. The promotion improved correctness
and refusal discipline (refusing before any catalog query), not token cost.

Found during the loop, outside its scope: a SELECT that calls a user-defined
function passes `sqlPolicy`, and an `AUTONOMOUS_TRANSACTION` function would commit
despite `SET TRANSACTION READ ONLY`. WP-K closed this gap: `sqlPolicy` now rejects
calls to any function that is not explicitly allowlisted (see `compatibility-19c.md`).

WP-J checks: `npm run typecheck` passed; `npm test` passed (10 files,
164 tests); with `.env` loaded, `npm run test:integration -- -t
"^(?!.*answers one end-to-end)"` passed (3 files, 9 tests passed, 1
end-to-end LLM test skipped by the filter). Setup used `npm ci --ignore-scripts`
and `.env.example` copied to `.env`. No contract changes are needed.

## Rebaseline and compact guidance — 2026-10-27

**Ledger versioning.** Each ledger row now stores `casesSha256`, a hash of the
exact case definitions it scored. `optimize:report` groups rows by suite, split
and that hash, so runs on edited cases are never ranked together. Older rows
show as `cases unversioned`.

**Clean holdout.** Two holdout cases were edited after their results had been
seen (`hard-wait-limits`, `hard-follow-lab-boundary`), so they moved to dev. Six
`hard-fresh-*` cases, written after the loop and never used for tuning, joined
the holdout. The split is now 20 dev and 13 holdout cases. Holdout now runs ×3
to reduce noise.

**Compact guidance.** The built-in guidance was tightened from 1,051 to 820
characters with the same rules (`evals/variants/compact-guidance.txt`). It
passed everything and was promoted.

| Run | Fresh baseline | Compact guidance |
|---|---|---|
| Hard dev ×2 (cases `a20bfc2cf3b7`) | 40/40, 151.7k / 55.1k | 40/40, 138.6k / 55.4k |
| Hard holdout ×3 (cases `ec7075d042c4`) | 39/39, 114.1k / 30.6k | 39/39, 114.5k / 31.3k |
| MVP ×1 | 39/39, 79.7k / 12.9k | 39/39, 77.8k / 13.1k |

Every refusal passed in every run. Token figures are input / output.

**Where input tokens go.** Each model request resends about 6,000 characters of
fixed context (roughly 1,600 tokens): about 2,200 for the system prompt and about
3,800 for the 12 tool definitions. That prefix is already served from Strata's
llama.cpp prompt cache, and eval `tokensIn` (pi-ai `usage.input`) excludes cached
tokens, so shortening it saves little (see "Drop prior thinking" below).

**Current baseline (after the review fixes, 2026-10-27).** The cached-plan cases
now seed their own cursor, which changed the dev and holdout case hashes. Every
refusal passed in every run. Token figures are input / output.

| Run | Result |
|---|---|
| Hard dev ×2 (cases `ed62129f597b`) | 40/40, 125.6k / 43.1k, 94 tool calls |
| Hard holdout ×3 (cases `d2ad2105dbbf`) | 39/39, 113.9k / 31.8k, 74 tool calls |
| MVP ×1 (cases `2b08ce0bdc33`) | 39/39, 77.9k / 13.6k, 39 tool calls |

Hard dev input fell from 138.6k to 125.6k. That fits the plan cases no longer
spending tool calls searching for a cursor that is not cached.

## Drop prior thinking — rejected, 2026-10-27

`PIAGENT_DROP_PRIOR_THINKING=1` (opt-in tunable, default off) strips earlier
reasoning blocks from the history before each request. Hard dev ×2 on Strata:

| Variant | Pass | Tokens in/out | Tool calls | Wall |
|---|---|---|---|---|
| baseline | 40/40, all refusals pass | 133.4k / 48.6k | 101 | 735 s |
| drop-thinking | 40/40, all refusals pass | 155.8k / 54.9k | 124 | 862 s |

Rejected. Rewriting earlier messages invalidates the prompt cache, so more prompt
tokens count as uncached input, and the model made more tool calls. Changes that
cut tokens should keep the history append-only. What remains costly is new tool
result text and output tokens.
