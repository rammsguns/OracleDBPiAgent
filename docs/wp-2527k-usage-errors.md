# WP-2527K-USAGE-ERRORS

Implemented early CLI argument validation for `report`, `triage`, `drift`,
`ask` and `chat`. Unknown targets now produce exit 2 with:

```text
Unknown target lab-nope; configured targets: lab-d1, lab-p1 (see piagent targets)
```

Both drift target options are checked. Requested names are echoed only when
matching the target-name regex used by the configuration loader. Unsafe input
is omitted; configured lists contain target names only. No endpoint, username,
path or credential is included in these messages.

Report section validation now runs before session-provider creation. An unknown
section produces exit 2, names the first unknown section when it is a bounded
simple identifier, and lists every valid section. Paths and control characters
are suppressed. The report generator uses the same validator, preserving its
existing section selection and grouping behavior.

Existing evidence-command wording and jobs/alertlog pinned-target behavior are
unchanged. Unexpected failures still use the generic message and exit 1.

Changed files:

- `src/cli/index.ts`: validate targets and report sections before command work;
  render the two structured usage-error types with exit 2.
- `src/config/targets.ts`: expose and reuse the existing target-name regex.
- `src/config/targetUsage.ts`: safe unknown-target guidance and shared validator.
- `src/report/arguments.ts`: report section names and safe argument validator.
- `src/report/index.ts`: reuse the section validator and re-export section names.
- `tests/unit/usage-errors.test.ts`: 31 unit cases covering all five commands,
  both drift sides, unsafe inputs, section errors, valid inputs and generic errors.
- `docs/wp-2527k-usage-errors.md`: this report.

Validation:

- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: 125 test files passed, 2,290 tests passed.
- Focused CLI/report rerun after final edits: 2 files, 40 tests passed.
- `git diff --check`: passed.

Tests mock configuration and service entry points and assert invalid arguments
never reach session creation, LLM health checks, or delegated triage/drift work.
No database or LLM connections were made. Integration tests and live package
smokes were not run, as requested. No contract changes or dependencies are needed.
