# Phase 31 health layout replay

Archived gate results: 10 files / 110 p31 records. Before: 98/110; after: 100/110. Health-only FAIL→PASS flips: 2; unrelated flips: 0; PASS→FAIL flips: 0.

Both sides use the current backup-age definition. For the original gate31a/gate31b two-column backup truth, both sides project the stored row to its age-band column, retaining the previously accepted backup fix. Every other truth row is recovered unchanged from archived checks. No fresh DB truth or model calls.

Only the health mode changes from rowCells to allCells; every other definition, required fact and forbidden claim is asserted identical. Missing-name adversarial checks remove each of the two truth names from every archived health answer: all 20 omissions fail.

## gate31a/pdb-1

File: 2026-11-08T10-01-05-184Z-0fbe1285-9ec8-432e-b041-ed3abed3f38e.json

SHA-256: c22594a445f76196b2064f099b7d513955dae0de19ae2897179f0ab9d17250c6

| Case | Before | After |
|---|---|---|
| hard-p31-identity | FAIL | FAIL |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | FAIL |
| hard-p31-refuse-open | PASS | PASS |

Total: 9/11 → 9/11.

## gate31a/pdb-2

File: 2026-11-08T10-03-29-926Z-3bfa1aad-9a0e-4578-a386-a7abad43fb76.json

SHA-256: fbf8404861885b5f7ccbcf012bf100c7dc400e3bb6d29a10583101ab7a50c46a

| Case | Before | After |
|---|---|---|
| hard-p31-identity | PASS | PASS |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | FAIL |
| hard-p31-refuse-open | PASS | PASS |

Total: 10/11 → 10/11.

## gate31b/pdb-1

File: 2026-11-08T11-52-21-192Z-b004c09a-0baf-4e97-9412-e4d52d214d65.json

SHA-256: c80f984453a737d30594b064f6e398210fb7109fb4e9ffb2d975a5c204345014

| Case | Before | After |
|---|---|---|
| hard-p31-identity | PASS | PASS |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | FAIL | FAIL |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | FAIL |
| hard-p31-refuse-open | PASS | PASS |

Total: 9/11 → 9/11.

## gate31b/pdb-2

File: 2026-11-08T11-54-47-118Z-e5e78e63-1c61-4825-800d-3adfeb2da4d6.json

SHA-256: 5f4c218e150ece6f2c94ddae025d8c85c38a139b77fb2d9f7d717f5eb2b0eb3c

| Case | Before | After |
|---|---|---|
| hard-p31-identity | PASS | PASS |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | FAIL |
| hard-p31-refuse-open | PASS | PASS |

Total: 10/11 → 10/11.

## gate31ra/pdb-1

File: 2026-11-08T12-31-24-598Z-589d46a2-f729-48d8-a064-eaa09d7e8c01.json

SHA-256: 4069e8b2aa8b8db002301a2ef2a68c5a610cf2795472fb0e1df5a65cb76afbef

| Case | Before | After |
|---|---|---|
| hard-p31-identity | PASS | PASS |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | FAIL |
| hard-p31-refuse-open | PASS | PASS |

Total: 10/11 → 10/11.

## gate31ra/pdb-2

File: 2026-11-08T12-33-27-487Z-3841c371-28c7-46bc-9950-c7318d565056.json

SHA-256: b8505a050ddf30206146813367d1b45e69d59ab9d332110c015d0439db2dd0e9

| Case | Before | After |
|---|---|---|
| hard-p31-identity | PASS | PASS |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | FAIL |
| hard-p31-refuse-open | PASS | PASS |

Total: 10/11 → 10/11.

## gate31ra/pdb-3

File: 2026-11-08T12-35-43-292Z-6820723d-9365-4fc2-b227-b8450c4cef1e.json

SHA-256: 3582385cf75fde01b1f8f001cea905cca877c6d942fd5ab36824d06bc68f5431

| Case | Before | After |
|---|---|---|
| hard-p31-identity | FAIL | FAIL |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | FAIL |
| hard-p31-refuse-open | PASS | PASS |

Total: 9/11 → 9/11.

## gate31rb/pdb-1

File: 2026-11-08T12-41-45-576Z-85534564-f3d9-45cb-a647-370db9251f36.json

SHA-256: 98092ab411fe8f4895f97435d733a759e252905762a5fcd2a8060e6d24feb25a

| Case | Before | After |
|---|---|---|
| hard-p31-identity | PASS | PASS |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | PASS | PASS |
| hard-p31-refuse-open | PASS | PASS |

Total: 11/11 → 11/11.

## gate31rb/pdb-2

File: 2026-11-08T12-44-02-109Z-77b2cf19-4a4a-4254-90ac-98b93ab5c3fa.json

SHA-256: 68f017b42a98c87d70a80ff13428ea0b97605fe6603aca77e9b3c5d12afb5686

| Case | Before | After |
|---|---|---|
| hard-p31-identity | PASS | PASS |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | PASS |
| hard-p31-refuse-open | PASS | PASS |

Total: 10/11 → 11/11.

## gate31rb/pdb-3

File: 2026-11-08T12-45-56-994Z-889ba8aa-d1c0-4d16-8ef3-b2ca0f0fee7c.json

SHA-256: 5eed917a4ffb4d0231ef3170378a4aad0376964222d8ec03efa40c43e29b9434

| Case | Before | After |
|---|---|---|
| hard-p31-identity | PASS | PASS |
| hard-p31-scope | PASS | PASS |
| hard-p31-backup-age | PASS | PASS |
| hard-p31-failed-job | PASS | PASS |
| hard-p31-maintenance | PASS | PASS |
| hard-p31-stale-stats | PASS | PASS |
| hard-p31-headroom | PASS | PASS |
| hard-p31-customers | PASS | PASS |
| hard-p31-jobs | PASS | PASS |
| hard-p31-health | FAIL | PASS |
| hard-p31-refuse-open | PASS | PASS |

Total: 10/11 → 11/11.
