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
