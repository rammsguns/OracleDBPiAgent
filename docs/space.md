# Space and capacity

Use `npm run piagent -- space --target d1-19c-lab` (or `p1-19c-prod` / `c1-19c-pdb`). Markdown is the default. Options: `--section tablespaces,segments,temp,undo,redo,recovery`, `--top 1–100` (default 20), `--owner X`, `--all`, and mutually exclusive `--json` / `--markdown`. Owner names are simple unquoted Oracle identifiers, normalized to uppercase. An explicit owner includes Oracle-maintained owners.

JSON carries raw bytes and query evidence. Markdown uses binary units and text bars. Findings do not change exit 0; usage errors exit 2, connection errors or all selected sections unavailable exit 1. Missing grants affect only their section. Catalog reads are bounded to 10,000 rows; truncation makes the report partial. A snapshot is a sequence of reads, so current usage can move between queries.

Headroom means maximum minus used bytes; the pure file helper returns expansion headroom (maximum minus allocated). Each autoextend maximum is clamped to at least its current allocation. Used tablespace bytes use usage-metric blocks multiplied by block size, with allocated minus free as fallback. Undo figures are cumulative over the available last 24 hours of V$UNDOSTAT buckets. Temp usage is current sort-segment allocation. FRA thresholds subtract reclaimable bytes. No log-switch-rate query is made.

Redo JSON adds `sections.redo.logMode` (omitted when redo is skipped). Markdown displays the mode. Missing access to V$DATABASE yields `unavailable` without losing group/member rows; unavailable supporting evidence makes the overall report partial. NOARCHIVELOG produces an informational finding about point-in-time recovery. ARCHIVELOG produces a high finding only when successful, complete reads confirm both no FRA and no nonblank `log_archive_dest_n`. These checks also run for redo-only requests. Unknown configuration never produces that high finding.

Section headings have one blank line before their content. Empty sections with an explanatory note display that note without a redundant “No rows” block.

## Live verification — WP-24E, 2026-11-06

Only the configured HARNESS_LAB and HARNESS_RO accounts were used, via the existing 19c-gated read-only session provider. No Strata calls or database writes. Before implementation, `SELECT log_mode FROM v$database` succeeded on both targets and returned `NOARCHIVELOG`.

Fresh full-report smokes (top 3) returned all six sections `ok` on both targets. Independent SELECTs repeated the mode check and cross-checked redo and recovery configuration:

```sql
SELECT log_mode FROM v$database
SELECT COUNT(*),MIN(bytes),MAX(bytes),SUM(members) FROM v$log
SELECT space_limit,space_used-space_reclaimable,number_of_files FROM v$recovery_file_dest
```

| Target | Captured at UTC | Log mode | Redo groups | Min/max group bytes | Total members | FRA rows |
| --- | --- | --- | --- | --- | --- | --- |
| d1-19c-lab | 2026-11-06T07:32:43.947Z | NOARCHIVELOG | 3 | 209715200 / 209715200 | 3 | 0 |
| p1-19c-prod | 2026-11-06T07:32:44.516Z | NOARCHIVELOG | 3 | 209715200 / 209715200 | 3 | 0 |

Each report includes the NOARCHIVELOG info finding and the single-member info finding. The live Markdown passed checks for one blank line after headings and no redundant empty recovery block. ARCHIVELOG and missing-grant paths are covered by unit fixtures; neither live target was reconfigured.

<details><summary>Fresh d1-19c-lab smoke</summary>

### Space — d1-19c-lab

Captured at 2026-11-06T07:32:43.947Z (UTC). Binary units (KiB, MiB, GiB, TiB).
Snapshot is a short sequence of queries, not one consistent read.

## Findings

- **info: Redo** — Database is in NOARCHIVELOG mode: online redo is not archived, so point-in-time recovery is not possible. Review recovery requirements and backup strategy with the DBA.
- **info: Redo** — A single member per redo group. Review redo multiplexing and storage failure protection.

## Tablespaces

| Name | Allocated | Used | Maximum | Used / allocated | Used / max | Headroom |
| --- | --- | --- | --- | --- | --- | --- |
| SYSAUX | 1.21 GiB | 1.14 GiB | 32 GiB | █████████░ 94.0% | ░░░░░░░░░░ 3.6% | 30.86 GiB |
| SYSTEM | 990 MiB | 986.25 MiB | 32 GiB | ██████████ 99.6% | ░░░░░░░░░░ 3.0% | 31.04 GiB |
| TEMP | 458 MiB | 8 MiB | 32 GiB | ░░░░░░░░░░ 1.7% | ░░░░░░░░░░ 0.0% | 31.99 GiB |
| UNDOTBS1 | 590 MiB | 15.31 MiB | 32 GiB | ░░░░░░░░░░ 2.6% | ░░░░░░░░░░ 0.0% | 31.99 GiB |
| USERS | 365 MiB | 313.25 MiB | 32 GiB | █████████░ 85.8% | ░░░░░░░░░░ 1.0% | 31.69 GiB |

<details><summary>Tablespace configuration and files</summary>

| Name | Contents | Bigfile | File Count | Free |
| --- | --- | --- | --- | --- |
| SYSAUX | PERMANENT | false | 1 | 74.13 MiB |
| SYSTEM | PERMANENT | false | 1 | 3.75 MiB |
| TEMP | TEMPORARY | false | 1 | 450 MiB |
| UNDOTBS1 | UNDO | false | 1 | 574.69 MiB |
| USERS | PERMANENT | false | 1 | 51.75 MiB |

| Tablespace | Path | Bytes | Maximum | Autoextend |
| --- | --- | --- | --- | --- |
| SYSAUX | /opt/oracle/oradata/ORCL/sysaux01.dbf | 1.21 GiB | 32 GiB | true |
| SYSTEM | /opt/oracle/oradata/ORCL/system01.dbf | 990 MiB | 32 GiB | true |
| TEMP | /opt/oracle/oradata/ORCL/temp01.dbf | 458 MiB | 32 GiB | true |
| UNDOTBS1 | /opt/oracle/oradata/ORCL/undotbs01.dbf | 590 MiB | 32 GiB | true |
| USERS | /opt/oracle/oradata/ORCL/users01.dbf | 365 MiB | 32 GiB | true |

</details>

## Top segments

| Owner | Name | Partition | Type | Tablespace | Bytes |
| --- | --- | --- | --- | --- | --- |
| SH | CUSTOMERS |  | TABLE | USERS | 13 MiB |
| SH | COSTS | COSTS_Q1_1998 | TABLE PARTITION | USERS | 8 MiB |
| SH | COSTS | COSTS_Q1_1999 | TABLE PARTITION | USERS | 8 MiB |

## Temp

**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| TEMP | /opt/oracle/oradata/ORCL/temp01.dbf | 458 MiB | 32 GiB |

**Usage**

| Tablespace | Total Bytes | Used | Free | Usage |
| --- | --- | --- | --- | --- |
| TEMP | 457 MiB | 8 MiB | 449 MiB | ░░░░░░░░░░ 1.8% |

**Consumer**

| SID | SQL_ID | Segment Type | Tablespace | Bytes |
| --- | --- | --- | --- | --- |
| 123 | csnp95dz2r8ss | DATA | TEMP | 1 MiB |
| 969 | gjaap3w3qbf8c | LOB_INDEX | TEMP | 1 MiB |
| 969 | gjaap3w3qbf8c | LOB_DATA | TEMP | 1 MiB |
| 969 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 970 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 973 | 5cu0x10yu88sw | DATA | TEMP | 1 MiB |
| 1091 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 1459 | c9umxngkc3byq | DATA | TEMP | 1 MiB |

## Undo (last 24 h)

**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| UNDOTBS1 | /opt/oracle/oradata/ORCL/undotbs01.dbf | 590 MiB | 32 GiB |

**Extent status**

| Tablespace | Status | Bytes |
| --- | --- | --- |
| UNDOTBS1 | EXPIRED | 896 KiB |
| UNDOTBS1 | UNEXPIRED | 13.44 MiB |

**Last 24 h**

| Max Query Seconds | Snapshot Too Old Count | No Space Count | Min Tuned Retention Seconds | Max Tuned Retention Seconds | Retention Seconds |
| --- | --- | --- | --- | --- | --- |
| 1575 | 0 | 0 | 900 | 2294 | 900 |

## Online redo

Log mode: NOARCHIVELOG.

**Group**

| Group | Thread | Bytes | Members | Status | Archived |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 200 MiB | 1 | CURRENT | NO |
| 2 | 1 | 200 MiB | 1 | INACTIVE | NO |
| 3 | 1 | 200 MiB | 1 | INACTIVE | NO |

**Member**

| Group | Path | Type |
| --- | --- | --- |
| 1 | /opt/oracle/oradata/ORCL/redo01.log | ONLINE |
| 2 | /opt/oracle/oradata/ORCL/redo02.log | ONLINE |
| 3 | /opt/oracle/oradata/ORCL/redo03.log | ONLINE |

## Recovery area

no recovery area configured

</details>

<details><summary>Fresh p1-19c-prod smoke</summary>

### Space — p1-19c-prod

Captured at 2026-11-06T07:32:44.516Z (UTC). Binary units (KiB, MiB, GiB, TiB).
Snapshot is a short sequence of queries, not one consistent read.

## Findings

- **info: Redo** — Database is in NOARCHIVELOG mode: online redo is not archived, so point-in-time recovery is not possible. Review recovery requirements and backup strategy with the DBA.
- **info: Redo** — A single member per redo group. Review redo multiplexing and storage failure protection.

## Tablespaces

| Name | Allocated | Used | Maximum | Used / allocated | Used / max | Headroom |
| --- | --- | --- | --- | --- | --- | --- |
| SHOP_DATA | 512 MiB | 160.5 MiB | 4 GiB | ███░░░░░░░ 31.3% | ░░░░░░░░░░ 3.9% | 3.84 GiB |
| SYSAUX | 1.04 GiB | 1018.88 MiB | 32 GiB | ██████████ 95.2% | ░░░░░░░░░░ 3.1% | 31 GiB |
| SYSTEM | 980 MiB | 971.94 MiB | 32 GiB | ██████████ 99.2% | ░░░░░░░░░░ 3.0% | 31.05 GiB |
| TEMP | 429 MiB | 5 MiB | 32 GiB | ░░░░░░░░░░ 1.2% | ░░░░░░░░░░ 0.0% | 32 GiB |
| UNDOTBS1 | 585 MiB | 16.25 MiB | 32 GiB | ░░░░░░░░░░ 2.8% | ░░░░░░░░░░ 0.0% | 31.98 GiB |
| USERS | 5 MiB | 2.69 MiB | 32 GiB | █████░░░░░ 53.8% | ░░░░░░░░░░ 0.0% | 32 GiB |

<details><summary>Tablespace configuration and files</summary>

| Name | Contents | Bigfile | File Count | Free |
| --- | --- | --- | --- | --- |
| SHOP_DATA | PERMANENT | false | 1 | 351.5 MiB |
| SYSAUX | PERMANENT | false | 1 | 51.13 MiB |
| SYSTEM | PERMANENT | false | 1 | 8.06 MiB |
| TEMP | TEMPORARY | false | 1 | 424 MiB |
| UNDOTBS1 | UNDO | false | 1 | 568.75 MiB |
| USERS | PERMANENT | false | 1 | 2.31 MiB |

| Tablespace | Path | Bytes | Maximum | Autoextend |
| --- | --- | --- | --- | --- |
| SHOP_DATA | /opt/oracle/oradata/PRODCDB/shop_data01.dbf | 512 MiB | 4 GiB | true |
| SYSAUX | /opt/oracle/oradata/PRODCDB/sysaux01.dbf | 1.04 GiB | 32 GiB | true |
| SYSTEM | /opt/oracle/oradata/PRODCDB/system01.dbf | 980 MiB | 32 GiB | true |
| TEMP | /opt/oracle/oradata/PRODCDB/temp01.dbf | 429 MiB | 32 GiB | true |
| UNDOTBS1 | /opt/oracle/oradata/PRODCDB/undotbs01.dbf | 585 MiB | 32 GiB | true |
| USERS | /opt/oracle/oradata/PRODCDB/users01.dbf | 5 MiB | 32 GiB | true |

</details>

## Top segments

| Owner | Name | Type | Tablespace | Bytes |
| --- | --- | --- | --- | --- |
| SHOPAPP | ORDER_LINES | TABLE | SHOP_DATA | 40 MiB |
| SHOPAPP | ORDER_LINES_PROD_IX | INDEX | SHOP_DATA | 33 MiB |
| SHOPAPP | ORDER_LINES_PK | INDEX | SHOP_DATA | 27 MiB |

## Temp

**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| TEMP | /opt/oracle/oradata/PRODCDB/temp01.dbf | 429 MiB | 32 GiB |

**Usage**

| Tablespace | Total Bytes | Used | Free | Usage |
| --- | --- | --- | --- | --- |
| TEMP | 428 MiB | 5 MiB | 423 MiB | ░░░░░░░░░░ 1.2% |

**Consumer**

| SID | SQL_ID | Segment Type | Tablespace | Bytes |
| --- | --- | --- | --- | --- |
| 49 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 93 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 123 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 242 | c9umxngkc3byq | DATA | TEMP | 1 MiB |
| 274 | 5cu0x10yu88sw | DATA | TEMP | 1 MiB |

## Undo (last 24 h)

**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| UNDOTBS1 | /opt/oracle/oradata/PRODCDB/undotbs01.dbf | 585 MiB | 32 GiB |

**Extent status**

| Tablespace | Status | Bytes |
| --- | --- | --- |
| UNDOTBS1 | EXPIRED | 3 MiB |
| UNDOTBS1 | UNEXPIRED | 12.25 MiB |

**Last 24 h**

| Max Query Seconds | Snapshot Too Old Count | No Space Count | Min Tuned Retention Seconds | Max Tuned Retention Seconds | Retention Seconds |
| --- | --- | --- | --- | --- | --- |
| 1485 | 0 | 0 | 900 | 2326 | 900 |

## Online redo

Log mode: NOARCHIVELOG.

**Group**

| Group | Thread | Bytes | Members | Status | Archived |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 200 MiB | 1 | CURRENT | NO |
| 2 | 1 | 200 MiB | 1 | INACTIVE | NO |
| 3 | 1 | 200 MiB | 1 | INACTIVE | NO |

**Member**

| Group | Path | Type |
| --- | --- | --- |
| 1 | /opt/oracle/oradata/PRODCDB/redo01.log | ONLINE |
| 2 | /opt/oracle/oradata/PRODCDB/redo02.log | ONLINE |
| 3 | /opt/oracle/oradata/PRODCDB/redo03.log | ONLINE |

## Recovery area

no recovery area configured

</details>

## Live PDB verification (2026-11-08)

The general tablespace table measures TEMP used sort blocks and UNDO ACTIVE + UNEXPIRED extent bytes. Allocated temporary extents and reusable EXPIRED undo no longer imply exhaustion. PERMANENT tablespaces retain their existing usage-metrics/free-space calculation. See [WP-31A](wp-31a-pdb-live.md).
