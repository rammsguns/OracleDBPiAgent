# Space and capacity

Use `npm run piagent -- space --target d1-19c-lab` (or `p1-19c-prod`). Markdown is the default. Options: `--section tablespaces,segments,temp,undo,redo,recovery`, `--top 1–100` (default 20), `--owner X`, `--all`, and mutually exclusive `--json` / `--markdown`. Owner names are simple unquoted Oracle identifiers, normalized to uppercase. An explicit owner includes Oracle-maintained owners.

JSON carries raw bytes and query evidence. Markdown uses binary units and text bars. Findings do not change exit 0; usage errors exit 2, connection errors or all selected sections unavailable exit 1. Missing grants affect only their section. Catalog reads are bounded to 10,000 rows; truncation makes the report partial. A snapshot is a sequence of reads, so current usage can move between queries.

Headroom means maximum minus used bytes; the pure file helper returns expansion headroom (maximum minus allocated). Each autoextend maximum is clamped to at least its current allocation. Used tablespace bytes use usage-metric blocks multiplied by block size, with allocated minus free as fallback. Undo figures are cumulative over the available last 24 hours of V$UNDOSTAT buckets. Temp usage is current sort-segment allocation. FRA thresholds subtract reclaimable bytes. No log-switch-rate query is made.

## Live verification

These smokes used only the configured read-only accounts and SELECTs; no LLM calls. Independent checks below are separately written queries, not the module SQL. Static figures were asserted equal; current temp, undo and FRA counters were observed separately and may change between reads.

### d1-19c-lab — 2026-11-06T07:10:21.082Z

All six sections: `ok`.

**Independent files**

```sql
SELECT tablespace_name,SUM(bytes),SUM(CASE WHEN autoextensible='YES' THEN GREATEST(bytes,maxbytes) ELSE bytes END) FROM (SELECT tablespace_name,bytes,maxbytes,autoextensible FROM dba_data_files UNION ALL SELECT tablespace_name,bytes,maxbytes,autoextensible FROM dba_temp_files) GROUP BY tablespace_name ORDER BY tablespace_name
```

```json
[["SYSAUX",1300234240,34359721984],["SYSTEM",1038090240,34359721984],["TEMP",480247808,34359721984],["UNDOTBS1",618659840,34359721984],["USERS",382730240,34359721984]]
```

**Independent used**

```sql
SELECT m.tablespace_name,m.used_space*t.block_size FROM dba_tablespace_usage_metrics m,dba_tablespaces t WHERE t.tablespace_name=m.tablespace_name ORDER BY m.tablespace_name
```

```json
[["SYSAUX",1222443008],["SYSTEM",1034158080],["TEMP",8388608],["UNDOTBS1",14942208],["USERS",328466432]]
```

**Independent redo**

```sql
SELECT COUNT(*),MIN(bytes),MAX(bytes),SUM(members) FROM v$log
```

```json
[[3,209715200,209715200,3]]
```

**Independent recovery**

```sql
SELECT space_limit,space_used-space_reclaimable,number_of_files FROM v$recovery_file_dest
```

```json
[]
```

**Independent temp**

```sql
SELECT tablespace_name,total_blocks,used_blocks,free_blocks FROM v$sort_segment ORDER BY tablespace_name
```

```json
[["TEMP",58496,1024,57472]]
```

**Independent undo**

```sql
SELECT SUM(ssolderrcnt),SUM(nospaceerrcnt),MAX(maxquerylen) FROM v$undostat WHERE begin_time>SYSDATE-1
```

```json
[[0,0,1575]]
```

**Independent segments**

```sql
SELECT owner,segment_name,segment_type,bytes FROM dba_segments WHERE owner IN (SELECT username FROM dba_users WHERE oracle_maintained='N') ORDER BY bytes DESC,owner,segment_name,partition_name FETCH FIRST 3 ROWS ONLY
```

```json
[["SH","CUSTOMERS","TABLE",13631488],["SH","COSTS","TABLE PARTITION",8388608],["SH","COSTS","TABLE PARTITION",8388608]]
```

<details><summary>Live CLI-format smoke (top 3)</summary>

#### Space — d1-19c-lab

Captured at 2026-11-06T07:10:21.082Z (UTC). Binary units (KiB, MiB, GiB, TiB).
Snapshot is a short sequence of queries, not one consistent read.

## Findings

- **info: Redo** — A single member per redo group. Review redo multiplexing and storage failure protection.

## Tablespaces

| Name | Allocated | Used | Maximum | Used / allocated | Used / max | Headroom |
| --- | --- | --- | --- | --- | --- | --- |
| SYSAUX | 1.21 GiB | 1.14 GiB | 32 GiB | █████████░ 94.0% | ░░░░░░░░░░ 3.6% | 30.86 GiB |
| SYSTEM | 990 MiB | 986.25 MiB | 32 GiB | ██████████ 99.6% | ░░░░░░░░░░ 3.0% | 31.04 GiB |
| TEMP | 458 MiB | 8 MiB | 32 GiB | ░░░░░░░░░░ 1.7% | ░░░░░░░░░░ 0.0% | 31.99 GiB |
| UNDOTBS1 | 590 MiB | 14.25 MiB | 32 GiB | ░░░░░░░░░░ 2.4% | ░░░░░░░░░░ 0.0% | 31.99 GiB |
| USERS | 365 MiB | 313.25 MiB | 32 GiB | █████████░ 85.8% | ░░░░░░░░░░ 1.0% | 31.69 GiB |

<details><summary>Tablespace configuration and files</summary>

| Name | Contents | Bigfile | File Count | Free |
| --- | --- | --- | --- | --- |
| SYSAUX | PERMANENT | false | 1 | 74.19 MiB |
| SYSTEM | PERMANENT | false | 1 | 3.75 MiB |
| TEMP | TEMPORARY | false | 1 | 450 MiB |
| UNDOTBS1 | UNDO | false | 1 | 575.75 MiB |
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
| 123 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 969 | gjaap3w3qbf8c | LOB_INDEX | TEMP | 1 MiB |
| 969 | gjaap3w3qbf8c | LOB_DATA | TEMP | 1 MiB |
| 969 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 970 | c9umxngkc3byq | DATA | TEMP | 1 MiB |
| 973 | c9umxngkc3byq | DATA | TEMP | 1 MiB |
| 1091 | f5yv529g61agb | DATA | TEMP | 1 MiB |
| 1459 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |

## Undo (last 24 h)


**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| UNDOTBS1 | /opt/oracle/oradata/ORCL/undotbs01.dbf | 590 MiB | 32 GiB |

**Extent status**

| Tablespace | Status | Bytes |
| --- | --- | --- |
| UNDOTBS1 | EXPIRED | 3 MiB |
| UNDOTBS1 | UNEXPIRED | 10.25 MiB |

**Last 24 h**

| Max Query Seconds | Snapshot Too Old Count | No Space Count | Min Tuned Retention Seconds | Max Tuned Retention Seconds | Retention Seconds |
| --- | --- | --- | --- | --- | --- |
| 1575 | 0 | 0 | 900 | 2289 | 900 |

## Online redo


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
<details><summary>No rows</summary>

No rows in this snapshot.

</details>


</details>

### p1-19c-prod — 2026-11-06T07:10:21.768Z

All six sections: `ok`.

**Independent files**

```sql
SELECT tablespace_name,SUM(bytes),SUM(CASE WHEN autoextensible='YES' THEN GREATEST(bytes,maxbytes) ELSE bytes END) FROM (SELECT tablespace_name,bytes,maxbytes,autoextensible FROM dba_data_files UNION ALL SELECT tablespace_name,bytes,maxbytes,autoextensible FROM dba_temp_files) GROUP BY tablespace_name ORDER BY tablespace_name
```

```json
[["SHOP_DATA",536870912,4294967296],["SYSAUX",1121976320,34359721984],["SYSTEM",1027604480,34359721984],["TEMP",449839104,34359721984],["UNDOTBS1",613416960,34359721984],["USERS",5242880,34359721984]]
```

**Independent used**

```sql
SELECT m.tablespace_name,m.used_space*t.block_size FROM dba_tablespace_usage_metrics m,dba_tablespaces t WHERE t.tablespace_name=m.tablespace_name ORDER BY m.tablespace_name
```

```json
[["SHOP_DATA",168296448],["SYSAUX",1068367872],["SYSTEM",1019150336],["TEMP",5242880],["UNDOTBS1",18087936],["USERS",2818048]]
```

**Independent redo**

```sql
SELECT COUNT(*),MIN(bytes),MAX(bytes),SUM(members) FROM v$log
```

```json
[[3,209715200,209715200,3]]
```

**Independent recovery**

```sql
SELECT space_limit,space_used-space_reclaimable,number_of_files FROM v$recovery_file_dest
```

```json
[]
```

**Independent temp**

```sql
SELECT tablespace_name,total_blocks,used_blocks,free_blocks FROM v$sort_segment ORDER BY tablespace_name
```

```json
[["TEMP",54784,640,54144]]
```

**Independent undo**

```sql
SELECT SUM(ssolderrcnt),SUM(nospaceerrcnt),MAX(maxquerylen) FROM v$undostat WHERE begin_time>SYSDATE-1
```

```json
[[0,0,1485]]
```

**Independent segments**

```sql
SELECT owner,segment_name,segment_type,bytes FROM dba_segments WHERE owner IN (SELECT username FROM dba_users WHERE oracle_maintained='N') ORDER BY bytes DESC,owner,segment_name,partition_name FETCH FIRST 3 ROWS ONLY
```

```json
[["SHOPAPP","ORDER_LINES","TABLE",41943040],["SHOPAPP","ORDER_LINES_PROD_IX","INDEX",34603008],["SHOPAPP","ORDER_LINES_PK","INDEX",28311552]]
```

<details><summary>Live CLI-format smoke (top 3)</summary>

#### Space — p1-19c-prod

Captured at 2026-11-06T07:10:21.768Z (UTC). Binary units (KiB, MiB, GiB, TiB).
Snapshot is a short sequence of queries, not one consistent read.

## Findings

- **info: Redo** — A single member per redo group. Review redo multiplexing and storage failure protection.

## Tablespaces

| Name | Allocated | Used | Maximum | Used / allocated | Used / max | Headroom |
| --- | --- | --- | --- | --- | --- | --- |
| SHOP_DATA | 512 MiB | 160.5 MiB | 4 GiB | ███░░░░░░░ 31.3% | ░░░░░░░░░░ 3.9% | 3.84 GiB |
| SYSAUX | 1.04 GiB | 1018.88 MiB | 32 GiB | ██████████ 95.2% | ░░░░░░░░░░ 3.1% | 31 GiB |
| SYSTEM | 980 MiB | 971.94 MiB | 32 GiB | ██████████ 99.2% | ░░░░░░░░░░ 3.0% | 31.05 GiB |
| TEMP | 429 MiB | 5 MiB | 32 GiB | ░░░░░░░░░░ 1.2% | ░░░░░░░░░░ 0.0% | 32 GiB |
| UNDOTBS1 | 585 MiB | 17.25 MiB | 32 GiB | ░░░░░░░░░░ 2.9% | ░░░░░░░░░░ 0.1% | 31.98 GiB |
| USERS | 5 MiB | 2.69 MiB | 32 GiB | █████░░░░░ 53.8% | ░░░░░░░░░░ 0.0% | 32 GiB |

<details><summary>Tablespace configuration and files</summary>

| Name | Contents | Bigfile | File Count | Free |
| --- | --- | --- | --- | --- |
| SHOP_DATA | PERMANENT | false | 1 | 351.5 MiB |
| SYSAUX | PERMANENT | false | 1 | 51.13 MiB |
| SYSTEM | PERMANENT | false | 1 | 8.06 MiB |
| TEMP | TEMPORARY | false | 1 | 424 MiB |
| UNDOTBS1 | UNDO | false | 1 | 567.75 MiB |
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
| 49 | c9umxngkc3byq | DATA | TEMP | 1 MiB |
| 93 | c9umxngkc3byq | DATA | TEMP | 1 MiB |
| 123 | gjaap3w3qbf8c | DATA | TEMP | 1 MiB |
| 242 | c9umxngkc3byq | DATA | TEMP | 1 MiB |
| 274 | f5yv529g61agb | DATA | TEMP | 1 MiB |

## Undo (last 24 h)


**File**

| Tablespace | Path | Allocated | Maximum |
| --- | --- | --- | --- |
| UNDOTBS1 | /opt/oracle/oradata/PRODCDB/undotbs01.dbf | 585 MiB | 32 GiB |

**Extent status**

| Tablespace | Status | Bytes |
| --- | --- | --- |
| UNDOTBS1 | EXPIRED | 3.25 MiB |
| UNDOTBS1 | UNEXPIRED | 13 MiB |

**Last 24 h**

| Max Query Seconds | Snapshot Too Old Count | No Space Count | Min Tuned Retention Seconds | Max Tuned Retention Seconds | Retention Seconds |
| --- | --- | --- | --- | --- | --- |
| 1485 | 0 | 0 | 900 | 2326 | 900 |

## Online redo


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
<details><summary>No rows</summary>

No rows in this snapshot.

</details>


</details>
