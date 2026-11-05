# WP-17A grounding precision

Baseline: `6a5fb624bedcbef48cbeba6186e9173b4460e0e4` (master base). No LLM, eval runner, or database calls were made.

## Changes and evidence boundaries

SQL/PLSQL syntax, including EACH and ROW, is treated as constants. Exact opposite-sign numeric literals with identical units and decimal exponents are accepted; this adds no rounding tolerance. A truly invented 20206 is still rejected against -20205. Existing precision, ratio, unit, and unsupported-number tests remain passing.

Qualified identifiers require all components in the **same** tool result (previously components from unrelated results could be combined). `HR | SECURE_DML` supports HR.SECURE_DML. A bare `PROCEDURE secure_dml` does not establish its owner. The eight gate-16g records contain the latter, with no HR token in their tool results: HR.SECURE_DML and HR.EMPLOYEES therefore remain flagged in a standalone check. This is an evidence omission, not grounds to assume every unqualified object belongs to HR. At runtime user-supplied identifiers remain exempt through the existing question argument.

NLS_DATE_LANGUAGE is absent from all eight records' evidence; the source shows TO_CHAR(..., 'DY'), not that parameter. It remains flagged. No RAISE_APPLICATION_ERROR documentation or 20000/20999 range appears in these tool results: those flags also remain. When range endpoints actually occur in evidence (including -20000 and -20999), they are accepted, covered by a unit test. No external documentation was added as conversation evidence.

The correction instruction now explicitly requests the **complete revised answer**, which replaces the previous answer, while retaining the instruction to only fix/remove listed numbers and keep refusals. System prompt and tool definitions are unchanged.

## gate-16g reproduction

Fixtures were extracted with jq, selecting only `.records[] | select(.id == "hard-p16-security-trigger") | {id,answer,unverified,groundingCorrections,toolResultTexts}`. No whole JSON was displayed. Fixture order follows the eight p16 rows chronologically in files.tsv. Archived answers are final answers after any correction; the original pre-correction answer is unavailable, so replay cannot reconstruct it or repair lost explanations.

All eight source results show `PROCEDURE | 6 | RAISE_APPLICATION_ERROR (-20205,`. One final answer incorrectly quotes line 7; this lexical checker does not validate line associations. EACH/ROW flags are syntax false positives. Unsigned 20205 is supported by that signed literal. HR ownership and NLS parameter flags are evidence gaps as described above.

Standalone checkFacts(answer, toolResultTexts), without a question (archives do not store question text):

| p16 row | Old unsupported | New unsupported |
|---|---|---|
| 1 A | HR.SECURE_EMPLOYEES, EACH, ROW, HR.EMPLOYEES, HR.SECURE_DML, NLS, NLS_DATE_LANGUAGE | HR.SECURE_EMPLOYEES, HR.EMPLOYEES, HR.SECURE_DML, NLS, NLS_DATE_LANGUAGE |
| 1 B | HR.SECURE_EMPLOYEES, HR.EMPLOYEES, EACH, HR.SECURE_DML, NLS_DATE_LANGUAGE, weekend, 20205, 20000, 20999 | HR.SECURE_EMPLOYEES, HR.EMPLOYEES, HR.SECURE_DML, NLS_DATE_LANGUAGE, weekend, 20000, 20999 |
| 2 B | HR.SECURE_EMPLOYEES, EACH, ROW, HR.EMPLOYEES, HR.SECURE_DML | HR.SECURE_EMPLOYEES, HR.EMPLOYEES, HR.SECURE_DML |
| 2 A | HR.SECURE_EMPLOYEES, EACH, ROW, HR.EMPLOYEES, HR.SECURE_DML, 20000, 20999, 20205 | HR.SECURE_EMPLOYEES, HR.EMPLOYEES, HR.SECURE_DML, 20000, 20999 |
| 3 A | HR.SECURE_EMPLOYEES, HR.EMPLOYEES, EACH, ROW, HR.SECURE_DML, NLS | HR.SECURE_EMPLOYEES, HR.EMPLOYEES, HR.SECURE_DML, NLS |
| 3 B | HR.SECURE_DML, 20205 | HR.SECURE_DML |
| 4 B | HR.SECURE_DML, 20205 | HR.SECURE_DML |
| 4 A | HR.SECURE_DML, 20205 | HR.SECURE_DML |

## All-archive replay

Recursively scanned every JSON file under `/home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive`, using records with string answer and array toolResultTexts (including empty arrays). **3,703 records across 142 files** qualified. No deduplication: repeated archive records count independently. **13 records changed unsupportedNumbers; 3,690 did not.** Twelve security-trigger records lose 20205; one failed-lab-job record loses -20001. No numeric flags were added; no other numbers were newly unflagged. This is a checker comparison, not an eval pass-rate claim or a prediction of model responses.

Every changed record is listed below. S means hard-p16-security-trigger; J means hard-p16-failed-lab-job. Evidence A is the exact `RAISE_APPLICATION_ERROR (-20205,` source literal, line 6 (in the first record, the row explicitly includes HR and SECURE_DML). Evidence B is scheduler history's `ERROR#` cell `20001`, also corroborated by `ORA-20001: destination unavailable`; the first shown run is Oct 26 2026 00:12:12. Thus every removed flag has the same magnitude explicitly present in that record's evidence.

| Archive path | Case | Old unsupportedNumbers | New unsupportedNumbers | Evidence |
|---|---|---|---|---|
| phase16/2026-11-04T19-12-56-382Z-86c2bdc9-3338-42c4-836f-b75dcd8522f0.json | S | 20000, 20999, 20205 | 20000, 20999 | A |
| phase16/gate-16e/2026-11-04T19-24-20-963Z-cf2f0e3c-bf1e-4133-a43c-48c73941a422.json | S | 20000, 20999, 20205 | 20000, 20999 | A |
| phase16/gate-16e/2026-11-04T19-28-13-586Z-af594331-9916-4706-8f90-8bf778cc76fa.json | S | 20205 | none | A |
| phase16/gate-16e/2026-11-04T19-33-39-771Z-8f9b06b8-b1e6-450f-bcb4-76c2969fad43.json | S | 20205 | none | A |
| phase16/gate-16e/2026-11-04T19-33-39-771Z-8f9b06b8-b1e6-450f-bcb4-76c2969fad43.json | J | -20001 | none | B |
| phase16/gate-16e/2026-11-04T19-42-39-338Z-372e44f3-af57-4b1f-ab7d-479e519a4e65.json | S | 20205 | none | A |
| phase16/gate-16e/2026-11-04T19-47-38-162Z-5bfc7d2b-2549-4e11-91d6-d9bc67a5cb17.json | S | 20205 | none | A |
| phase16/gate-16e/2026-11-04T19-52-30-203Z-4584216a-3d71-4cb1-b043-d975edc0b966.json | S | 20205 | none | A |
| phase16/gate-16g/2026-11-04T21-35-08-159Z-915a1711-04c0-4633-9067-16e8bfd79a7b.json | S | 20205, 20000, 20999 | 20000, 20999 | A |
| phase16/gate-16g/2026-11-04T21-42-49-749Z-adef74fc-d755-4153-9d29-f46fbfde5621.json | S | 20000, 20999, 20205 | 20000, 20999 | A |
| phase16/gate-16g/2026-11-04T21-50-04-288Z-db534099-9cff-44e7-8c86-f7343ed33870.json | S | 20205 | none | A |
| phase16/gate-16g/2026-11-04T21-53-33-624Z-6d2a078f-46ef-44f2-ab33-dfac7edabbfc.json | S | 20205 | none | A |
| phase16/gate-16g/2026-11-04T21-57-37-202Z-401c8fee-c426-4db8-9bd6-cc2ffc036a9f.json | S | 20205 | none | A |

Reproduce (offline, no eval runner):

```sh
git show 6a5fb624bedcbef48cbeba6186e9173b4460e0e4:src/agent/grounding.ts > /tmp/grounding-17a-old.ts
npx tsx tests/helpers/replay-grounding-17a.ts /tmp/grounding-17a-old.ts /home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive /tmp/replay-17a.json
```

The replay output includes every old/new numeric list and supporting tool-result texts for removed numbers. Evidence was manually reviewed for all 13 changes above.

## Validation and handoff

- `npm run typecheck`: passed.
- `npm test`: 65 files passed; **970 tests passed**, including all existing grounding tests and three new regression tests using eight archived fixtures.
- Dependencies were initially absent; `npm ci --ignore-scripts` restored existing lockfile dependencies, with no manifest/lock changes.
- No DB code or LLM transport code changed; integration tests were not required or run. The correction wording is covered with the mocked agent hook test, without LLM calls.
- Contract changes needed: none.
- Coordinator gates remain outstanding: actual model behavior and the combined 17A/17C eval gate were deliberately not run.
