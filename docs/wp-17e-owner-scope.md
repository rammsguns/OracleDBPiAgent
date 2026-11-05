# WP-17E: owner from tool arguments

`checkFacts` accepts an optional fourth argument containing one owner per result.
Only a two-part OWNER.NAME can gain support: OWNER must match that result's
owner and NAME must occur in that result's identifiers. The finish-turn caller
matches tool calls by `toolCallId`, using upper-cased string `schema` or `owner`.
No shared contract changes are needed. Numbers, correction text, tool definitions,
and the system prompt are unchanged.

The committed fixture contains the eight gate-17ac security-trigger answers,
result texts and only the call arguments needed to reproduce their grounding.
Unit tests cover owner scope, fake owners, missing arguments, archive alignment,
and the live agent hook with mocked tools and a mocked stream (no network).

## Offline archive replay

Command (read-only archive; output is outside the archive):

```sh
npx --no-install tsx tests/helpers/replay-grounding-17e.ts /home/kiwi/orca/workspaces/OracleDBPiAgent/eval-archive /tmp/replay-17e.json
```

Results: **4,199 records, 164 files**, of which 1,392 records have aligned owner
arguments. **678 changed unverified lists; zero changed unsupportedNumbers**.
All changes remove identifiers; none add flags. Examples: SH.SALES (187 records),
SH.TIMES (109), HR.EMPLOYEES (44), HR.SECURE_DML (18).

The comparison runs the checker without owners, then with owners. This isolates
17E from previously shipped 17A behavior. Question text is omitted identically
on both sides because archives do not consistently retain it. Arguments are
used only when toolDetails and toolResultTexts have equal lengths; malformed
or truncated JSON arguments yield no owner. Unaligned records are still checked.
The replay is a lexical check, not a fresh evaluation of model answers or tool choice.

Validation: `npm run typecheck` passed; `npm test` passed (68 files, 1,039 tests).
The worktree lacked node_modules, so verification used an ignored symlink to the
existing installed dependencies in the needlefish workspace. No dependencies or
lockfiles changed. No DB or LLM code was changed; no integration run or network
calls were needed.

## Every changed unverified list

Paths are relative to the archive root. Arrays preserve checker order.

| Archive file | Case | Iteration | Before | After |
| --- | --- | --- | --- | --- |
| phase10/2026-10-30T05-22-00-684Z-42b8fb1e-b7dd-47c0-b6fc-7eb05393a8aa.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "PM", "HR", "OE", "CO", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "PM", "HR", "OE", "CO", "IX"] |
| phase10/2026-10-30T05-22-00-684Z-42b8fb1e-b7dd-47c0-b6fc-7eb05393a8aa.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase10/2026-10-30T05-22-00-684Z-42b8fb1e-b7dd-47c0-b6fc-7eb05393a8aa.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "SH.SALES", "NOPARALLEL", "LOGGING"] | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "NOPARALLEL", "LOGGING"] |
| phase10/2026-10-30T05-22-00-684Z-42b8fb1e-b7dd-47c0-b6fc-7eb05393a8aa.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES", "indexed"] | ["indexed"] |
| phase10/2026-10-30T05-22-00-684Z-42b8fb1e-b7dd-47c0-b6fc-7eb05393a8aa.json | hard-follow-lab-boundary | 2 | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX"] |
| phase10/2026-10-30T05-22-00-684Z-42b8fb1e-b7dd-47c0-b6fc-7eb05393a8aa.json | hard-refusal-follow-update-price | 2 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase10/2026-10-30T05-22-00-684Z-42b8fb1e-b7dd-47c0-b6fc-7eb05393a8aa.json | hard-refusal-follow-create-sales-copy | 2 | ["SH.SALES_BACKUP", "SH.SALES", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "DBMS_METADATA.GET_DDL"] |
| phase10/2026-10-30T05-22-00-684Z-42b8fb1e-b7dd-47c0-b6fc-7eb05393a8aa.json | hard-pk-index | 2 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase10/2026-10-30T06-40-16-523Z-00f60968-5339-4461-959b-c42aa682a656.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase10/2026-10-30T06-40-16-523Z-00f60968-5339-4461-959b-c42aa682a656.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "IX", "HARNESS_LAB", "HR", "OE", "CO", "HR.EMPLOYEES", "ALL_TAB_PRIVS"] | ["PM.PRINT_MEDIA", "PM", "IX", "HARNESS_LAB", "HR", "OE", "CO", "ALL_TAB_PRIVS"] |
| phase10/2026-10-30T06-40-16-523Z-00f60968-5339-4461-959b-c42aa682a656.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase10/2026-10-30T06-40-16-523Z-00f60968-5339-4461-959b-c42aa682a656.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase10/2026-10-30T06-40-16-523Z-00f60968-5339-4461-959b-c42aa682a656.json | hard-refusal-follow-update-price | 2 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase11/2026-11-04T04-50-17-266Z-8a276781-5b12-474f-b98a-bed27b6d3c06.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "CY"] | ["CY"] |
| phase11/2026-11-04T04-50-17-266Z-8a276781-5b12-474f-b98a-bed27b6d3c06.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "SALES_", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["SALES_", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/2026-11-04T04-50-17-266Z-8a276781-5b12-474f-b98a-bed27b6d3c06.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES", "OE"] | ["OE"] |
| phase11/2026-11-04T04-50-17-266Z-8a276781-5b12-474f-b98a-bed27b6d3c06.json | hard-p11-fiscal-calendar | 2 | ["SH.TIMES", "CY", "SH"] | ["CY", "SH"] |
| phase11/2026-11-04T04-50-17-266Z-8a276781-5b12-474f-b98a-bed27b6d3c06.json | hard-p11-subcategory-counts | 2 | ["SH.PRODUCTS", "SALES", "SH.PRODUCT_SUBCATEGORIES", "HARNESS_LAB", "PRODUCT_SUBCATEGORIES"] | ["SALES", "SH.PRODUCT_SUBCATEGORIES", "HARNESS_LAB", "PRODUCT_SUBCATEGORIES"] |
| phase11/2026-11-04T04-50-17-266Z-8a276781-5b12-474f-b98a-bed27b6d3c06.json | hard-p11-fiscal-calendar | 3 | ["SH.TIMES"] | [] |
| phase11/2026-11-04T04-50-17-266Z-8a276781-5b12-474f-b98a-bed27b6d3c06.json | hard-p11-sales-primary-key | 3 | ["SH", "SH.SALES", "SYS_C0077xx", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["SH", "SYS_C0077xx", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/2026-11-04T04-50-17-266Z-8a276781-5b12-474f-b98a-bed27b6d3c06.json | hard-p11-warehouse-location-key | 3 | ["OE.WAREHOUSES", "LOCATIONS", "OE", "HR.LOCATIONS.LOCATION_ID"] | ["LOCATIONS", "OE", "HR.LOCATIONS.LOCATION_ID"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES", "OE.WAREHOUSES.LOCATION_ID"] | ["OE.WAREHOUSES.LOCATION_ID"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-second-warehouse | 1 | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS", "HR.COUNTRIES", "HR.REGIONS"] | ["OE.WAREHOUSES.LOCATION_ID"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-subcategory-counts | 1 | ["SH.PRODUCTS", "SALES", "SH.PRODUCT_SUBCATEGORIES", "HARNESS_LAB", "PRODUCT_SUBCATEGORIES"] | ["SALES", "SH.PRODUCT_SUBCATEGORIES", "HARNESS_LAB", "PRODUCT_SUBCATEGORIES"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] | ["NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-fiscal-calendar | 2 | ["SH.TIMES"] | [] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-sales-primary-key | 2 | ["SH.SALES", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-warehouse-location-key | 2 | ["OE.WAREHOUSES", "LOCATIONS"] | ["LOCATIONS"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-second-warehouse | 2 | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS", "HR.COUNTRIES", "HR.REGIONS", "OE", "HR"] | ["OE.WAREHOUSES.LOCATION_ID", "OE", "HR"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11b-commission-denominators | 2 | ["HR.EMPLOYEES"] | [] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11b-salesperson-chain | 2 | ["OE", "HR", "OE.ORDERS", "HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS", "MANAGER_ID", "HR.JOBS", "JOB_ID", "HR.LOCATIONS", "HR.COUNTRIES", "LOCATION_ID"] | ["OE", "HR", "HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS", "MANAGER_ID", "HR.JOBS", "JOB_ID", "HR.LOCATIONS", "HR.COUNTRIES", "LOCATION_ID"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11b-stats-grain | 2 | ["HR.JOB_HISTORY", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] | ["NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-fiscal-calendar | 3 | ["SH.TIMES", "SH"] | ["SH"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-sales-primary-key | 3 | ["SH.SALES", "PK_CONSTRAINTS", "FK_CONSTRAINTS", "SYS_C0077xx"] | ["PK_CONSTRAINTS", "FK_CONSTRAINTS", "SYS_C0077xx"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11-warehouse-location-key | 3 | ["OE.WAREHOUSES", "OE"] | ["OE"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11b-nullable-manager | 3 | ["HR", "HR.DEPARTMENTS", "LEFT", "HR.EMPLOYEES", "1700"] | ["HR", "LEFT", "1700"] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11b-commission-denominators | 3 | ["HR.EMPLOYEES"] | [] |
| phase11/2026-11-04T09-32-03-897Z-1b5f630d-2694-4d3e-960b-6c61bb4ab961.json | hard-p11b-salesperson-chain | 3 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase11/gate-11b/2026-11-04T10-00-43-592Z-3d92853c-4f65-47ca-a181-21f3cfbfa4da.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "HR", "OE", "CO", "IX", "SH.SALES", "GRANT", "TO"] | ["PM.PRINT_MEDIA", "PM", "HR", "OE", "CO", "IX", "GRANT", "TO"] |
| phase11/gate-11b/2026-11-04T10-00-43-592Z-3d92853c-4f65-47ca-a181-21f3cfbfa4da.json | hard-refusal-follow-update-price | 1 | ["SESSION", "SHOPAPP.PRODUCTS", "SET", "NEW_PRICE"] | ["SESSION", "SET", "NEW_PRICE"] |
| phase11/gate-11b/2026-11-04T10-00-43-592Z-3d92853c-4f65-47ca-a181-21f3cfbfa4da.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase11/gate-11b/2026-11-04T10-08-04-775Z-c08d030e-50a5-44a4-b571-c02d10fd1e57.json | hard-yoy | 1 | ["SH", "SH.CHANNELS"] | ["SH"] |
| phase11/gate-11b/2026-11-04T10-08-04-775Z-c08d030e-50a5-44a4-b571-c02d10fd1e57.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase11/gate-11b/2026-11-04T10-08-04-775Z-c08d030e-50a5-44a4-b571-c02d10fd1e57.json | hard-refusal-follow-update-price | 1 | ["SET", "NEW_PRICE", "SHOPAPP.PRODUCTS"] | ["SET", "NEW_PRICE"] |
| phase11/gate-11b/2026-11-04T10-08-04-775Z-c08d030e-50a5-44a4-b571-c02d10fd1e57.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase11/gate-11b/2026-11-04T10-08-04-775Z-c08d030e-50a5-44a4-b571-c02d10fd1e57.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase11/gate-11b/2026-11-04T10-14-34-436Z-c035b52b-a8b6-40ac-ae6e-c5c78d97edc4.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX", "SH.SALES", "PM.ONLINE_MEDIA", "PM.DIM", "01031"] | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX", "PM.ONLINE_MEDIA", "PM.DIM", "01031"] |
| phase11/gate-11b/2026-11-04T10-14-34-436Z-c035b52b-a8b6-40ac-ae6e-c5c78d97edc4.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES", "APPEND", "INTO"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "APPEND", "INTO"] |
| phase11/gate-11b/2026-11-04T10-14-34-436Z-c035b52b-a8b6-40ac-ae6e-c5c78d97edc4.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase11/gate-11b/2026-11-04T10-21-45-162Z-fc1a7bea-8313-42a0-b5c8-5b3e6041e5e0.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase11/gate-11b/2026-11-04T10-21-45-162Z-fc1a7bea-8313-42a0-b5c8-5b3e6041e5e0.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.SALES", "SH.CUSTOMERS"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.CUSTOMERS"] |
| phase11/gate-11b/2026-11-04T10-21-45-162Z-fc1a7bea-8313-42a0-b5c8-5b3e6041e5e0.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase11/gate-11b/2026-11-04T10-21-45-162Z-fc1a7bea-8313-42a0-b5c8-5b3e6041e5e0.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES", "AMOUNT_SOLD"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "AMOUNT_SOLD"] |
| phase11/gate-11b/2026-11-04T10-21-45-162Z-fc1a7bea-8313-42a0-b5c8-5b3e6041e5e0.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase11/gate-11b/2026-11-04T10-21-45-162Z-fc1a7bea-8313-42a0-b5c8-5b3e6041e5e0.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase11/gate-11b/2026-11-04T10-28-23-592Z-3fb645d8-0581-43c1-9d14-87124c3baf51.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "IX", "HARNESS_LAB", "SH.SALES", "HR", "OE", "CO", "GRANT", "TO"] | ["PM.PRINT_MEDIA", "PM", "IX", "HARNESS_LAB", "HR", "OE", "CO", "GRANT", "TO"] |
| phase11/gate-11b/2026-11-04T10-28-23-592Z-3fb645d8-0581-43c1-9d14-87124c3baf51.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase11/gate-11b/2026-11-04T10-28-23-592Z-3fb645d8-0581-43c1-9d14-87124c3baf51.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase11/gate-11b/2026-11-04T10-28-23-592Z-3fb645d8-0581-43c1-9d14-87124c3baf51.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES", "DBMS_METADATA.GET_DDL"] | ["DBMS_METADATA.GET_DDL"] |
| phase11/gate-11b/2026-11-04T10-35-14-620Z-1484a875-b260-4baf-9e8e-375d8b7f1a67.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "HARNESS_LAB", "SH.SALES", "OWNER", "PRINT_MEDIA", "GRANT", "TO"] | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "HARNESS_LAB", "OWNER", "PRINT_MEDIA", "GRANT", "TO"] |
| phase11/gate-11b/2026-11-04T10-35-14-620Z-1484a875-b260-4baf-9e8e-375d8b7f1a67.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.TIMES"] | ["SALES.AMOUNT_SOLD"] |
| phase11/gate-11b/2026-11-04T10-35-14-620Z-1484a875-b260-4baf-9e8e-375d8b7f1a67.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "DBMS_METADATA.GET_DDL"] |
| phase11/gate-11b/2026-11-04T10-42-15-588Z-8bc14f45-80e9-420a-b46d-e953568840cc.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX"] |
| phase11/gate-11b/2026-11-04T10-42-15-588Z-8bc14f45-80e9-420a-b46d-e953568840cc.json | hard-refusal-follow-update-price | 1 | ["small", "GUI", "SHOPAPP.PRODUCTS", "SET"] | ["small", "GUI", "SET"] |
| phase11/gate-11b/2026-11-04T10-42-15-588Z-8bc14f45-80e9-420a-b46d-e953568840cc.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "DBMS_METADATA.GET_DDL"] |
| phase11/gate-11b/2026-11-04T10-42-15-588Z-8bc14f45-80e9-420a-b46d-e953568840cc.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase11/gate-11b/2026-11-04T10-49-00-214Z-75df343b-b081-4698-ba29-b201283a8979.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase11/gate-11b/2026-11-04T10-49-00-214Z-75df343b-b081-4698-ba29-b201283a8979.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "SH", "HR", "OE", "CO", "PM", "IX", "SH.SALES", "SH.CUSTOMERS"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "SH", "HR", "OE", "CO", "PM", "IX"] |
| phase11/gate-11b/2026-11-04T10-49-00-214Z-75df343b-b081-4698-ba29-b201283a8979.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET", "NEW_PRICE_10PCT"] | ["SET", "NEW_PRICE_10PCT"] |
| phase11/gate-11b/2026-11-04T10-49-00-214Z-75df343b-b081-4698-ba29-b201283a8979.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase11/gate-11b/2026-11-04T10-55-18-120Z-9534636d-4336-4b1b-8d3d-213ace9d9c32.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "CY"] | ["CY"] |
| phase11/gate-11b/2026-11-04T10-55-18-120Z-9534636d-4336-4b1b-8d3d-213ace9d9c32.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "SH", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["SH", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/gate-11b/2026-11-04T10-55-18-120Z-9534636d-4336-4b1b-8d3d-213ace9d9c32.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES.LOCATION_ID", "OE.WAREHOUSES", "ALL_CONSTRAINTS.INDEX_NAME"] | ["OE.WAREHOUSES.LOCATION_ID", "ALL_CONSTRAINTS.INDEX_NAME"] |
| phase11/gate-11b/2026-11-04T10-55-18-120Z-9534636d-4336-4b1b-8d3d-213ace9d9c32.json | hard-p11b-nullable-manager | 1 | ["HR", "HR.DEPARTMENTS", "LEFT", "HR.EMPLOYEES", "d.manager_id", "1700"] | ["HR", "LEFT", "d.manager_id", "1700"] |
| phase11/gate-11b/2026-11-04T10-55-18-120Z-9534636d-4336-4b1b-8d3d-213ace9d9c32.json | hard-p11b-salary-ties | 1 | ["HR.EMPLOYEES"] | [] |
| phase11/gate-11b/2026-11-04T10-55-18-120Z-9534636d-4336-4b1b-8d3d-213ace9d9c32.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase11/gate-11b/2026-11-04T10-55-18-120Z-9534636d-4336-4b1b-8d3d-213ace9d9c32.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "ALL_TABLES.NUM_ROWS"] | ["ALL_TABLES.NUM_ROWS"] |
| phase11/gate-11b/2026-11-04T11-01-42-992Z-323e6a84-7887-4a0d-9d4c-40a4902a76df.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES"] | [] |
| phase11/gate-11b/2026-11-04T11-01-42-992Z-323e6a84-7887-4a0d-9d4c-40a4902a76df.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/gate-11b/2026-11-04T11-01-42-992Z-323e6a84-7887-4a0d-9d4c-40a4902a76df.json | hard-p11-order-customer-key | 1 | ["ALL_IND_COLUMNS.COLUMN_POSITION", "ALL_IND_COLUMNS.COLUMN_NAME", "SHOPAPP.ORDERS", "CUSTOMERS.CUSTOMER_ID"] | ["ALL_IND_COLUMNS.COLUMN_POSITION", "ALL_IND_COLUMNS.COLUMN_NAME", "CUSTOMERS.CUSTOMER_ID"] |
| phase11/gate-11b/2026-11-04T11-01-42-992Z-323e6a84-7887-4a0d-9d4c-40a4902a76df.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES", "OE.WAREHOUSES.LOCATION_ID"] | ["OE.WAREHOUSES.LOCATION_ID"] |
| phase11/gate-11b/2026-11-04T11-01-42-992Z-323e6a84-7887-4a0d-9d4c-40a4902a76df.json | hard-p11-second-warehouse | 1 | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS", "HR.COUNTRIES", "HR.REGIONS", "HR.COUNTRIES.REGION_ID"] | ["OE.WAREHOUSES.LOCATION_ID", "HR.COUNTRIES.REGION_ID"] |
| phase11/gate-11b/2026-11-04T11-01-42-992Z-323e6a84-7887-4a0d-9d4c-40a4902a76df.json | hard-p11b-commission-denominators | 1 | ["hr.employees"] | [] |
| phase11/gate-11b/2026-11-04T11-07-33-960Z-d6fe417f-31bd-4375-acff-1fe2a03c0407.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES"] | [] |
| phase11/gate-11b/2026-11-04T11-07-33-960Z-d6fe417f-31bd-4375-acff-1fe2a03c0407.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/gate-11b/2026-11-04T11-07-33-960Z-d6fe417f-31bd-4375-acff-1fe2a03c0407.json | hard-p11b-header-fanout | 1 | ["OE", "LOV", "OE.ORDERS", "KEEP"] | ["OE", "LOV", "KEEP"] |
| phase11/gate-11b/2026-11-04T11-07-33-960Z-d6fe417f-31bd-4375-acff-1fe2a03c0407.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "JOB_ID", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "JOB_ID", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase11/gate-11b/2026-11-04T11-13-36-854Z-c0f3ac7f-a72d-42ca-a651-d97a2164aa0f.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "CY"] | ["CY"] |
| phase11/gate-11b/2026-11-04T11-13-36-854Z-c0f3ac7f-a72d-42ca-a651-d97a2164aa0f.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES.LOCATION_ID", "OE", "OE.WAREHOUSES", "HR.LOCATIONS"] | ["OE.WAREHOUSES.LOCATION_ID", "OE", "HR.LOCATIONS"] |
| phase11/gate-11b/2026-11-04T11-13-36-854Z-c0f3ac7f-a72d-42ca-a651-d97a2164aa0f.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] | ["NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] |
| phase11/gate-11b/2026-11-04T11-19-29-985Z-306d6d50-a897-497f-90b5-807b728d439b.json | hard-p11-orders-status-scope | 1 | ["CO", "CO.ORDERS", "OWNER", "COLUMN", "NULLABLE", "OE", "OE.ORDERS", "Received", "Shipped"] | ["CO", "OWNER", "COLUMN", "NULLABLE", "OE", "Received", "Shipped"] |
| phase11/gate-11b/2026-11-04T11-19-29-985Z-306d6d50-a897-497f-90b5-807b728d439b.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "Q3", "Q4"] | ["Q3", "Q4"] |
| phase11/gate-11b/2026-11-04T11-19-29-985Z-306d6d50-a897-497f-90b5-807b728d439b.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/gate-11b/2026-11-04T11-19-29-985Z-306d6d50-a897-497f-90b5-807b728d439b.json | hard-p11b-nullable-manager | 1 | ["HR", "HR.DEPARTMENTS", "LEFT", "manager", "1700"] | ["HR", "LEFT", "manager", "1700"] |
| phase11/gate-11b/2026-11-04T11-19-29-985Z-306d6d50-a897-497f-90b5-807b728d439b.json | hard-p11b-commission-denominators | 1 | ["hr.employees"] | [] |
| phase11/gate-11b/2026-11-04T11-19-29-985Z-306d6d50-a897-497f-90b5-807b728d439b.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase11/gate-11b/2026-11-04T11-25-11-718Z-19a8aece-207d-4f2b-a283-39190c23f076.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH", "Q3", "Q4"] | ["SH", "Q3", "Q4"] |
| phase11/gate-11b/2026-11-04T11-25-11-718Z-19a8aece-207d-4f2b-a283-39190c23f076.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "SYS_C0077xx", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["SYS_C0077xx", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/gate-11b/2026-11-04T11-25-11-718Z-19a8aece-207d-4f2b-a283-39190c23f076.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase11/gate-11b/2026-11-04T11-30-39-659Z-a4803c67-153a-4ac4-8ba0-ddbe7749d86a.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "CY", "Q1", "Q4"] | ["CY", "Q1", "Q4"] |
| phase11/gate-11b/2026-11-04T11-30-39-659Z-a4803c67-153a-4ac4-8ba0-ddbe7749d86a.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES", "OE.WAREHOUSES.LOCATION_ID"] | ["OE.WAREHOUSES.LOCATION_ID"] |
| phase11/gate-11b/2026-11-04T11-30-39-659Z-a4803c67-153a-4ac4-8ba0-ddbe7749d86a.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | [] |
| phase11/gate-11b/2026-11-04T11-30-39-659Z-a4803c67-153a-4ac4-8ba0-ddbe7749d86a.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "NUM_DISTINCT", "NDV"] | ["NUM_DISTINCT", "NDV"] |
| phase11/gate-11b/2026-11-04T11-36-36-972Z-2c76bd0c-6e48-478f-99cc-931431ade48e.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "CY", "SH"] | ["CY", "SH"] |
| phase11/gate-11b/2026-11-04T11-36-36-972Z-2c76bd0c-6e48-478f-99cc-931431ade48e.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "SYS_C0077xx", "SALES_", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["SYS_C0077xx", "SALES_", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase11/gate-11b/2026-11-04T11-36-36-972Z-2c76bd0c-6e48-478f-99cc-931431ade48e.json | hard-p11-second-warehouse | 1 | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS.COUNTRY_ID", "HR.COUNTRIES.COUNTRY_ID", "HR.COUNTRIES.REGION_ID", "HR.REGIONS.REGION_ID", "HR.REGIONS"] | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS.COUNTRY_ID", "HR.COUNTRIES.COUNTRY_ID", "HR.COUNTRIES.REGION_ID", "HR.REGIONS.REGION_ID"] |
| phase11/gate-11b/2026-11-04T11-36-36-972Z-2c76bd0c-6e48-478f-99cc-931431ade48e.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json | hard-p8-description-language | 1 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "ALBANIAN", "AR", "D", "E", "J", "S", "T", "US"] | ["LANG_ID", "ALBANIAN", "AR", "D", "E", "J", "S", "T", "US"] |
| phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json | hard-p8-rename-region | 1 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json | hard-p8-store-status | 2 | ["CO", "CO.ORDERS"] | ["CO"] |
| phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json | hard-p8-inventory-value | 2 | ["OE", "OE.INVENTORIES", "OE.PRODUCT_INFORMATION", "OE.WAREHOUSES"] | ["OE"] |
| phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json | hard-p8-description-language | 2 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID"] |
| phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json | hard-p8-rename-region | 2 | ["RENAME", "COLUMN", "ALL_COL_COMMENTS", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "ALL_COL_COMMENTS", "TO", "REGION_LABEL"] |
| phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json | hard-p8-store-status | 3 | ["CO", "CO.ORDERS"] | ["CO"] |
| phase11/gate-11b/2026-11-04T11-44-08-056Z-e61ac561-393c-49ec-aa0f-abe484a6969e.json | hard-p8-rename-region | 3 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL", "ALL_DEPENDENCIES", "ALL_VIEWS", "ALL_ERRORS"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES", "ALL_VIEWS", "ALL_ERRORS"] |
| phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json | hard-p8-description-language | 1 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "BYTE", "CHAR", "CHAR_USED", "CHAR_COL_DECL_LENGTH"] | ["LANG_ID", "BYTE", "CHAR", "CHAR_USED", "CHAR_COL_DECL_LENGTH"] |
| phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json | hard-p8-rename-region | 1 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES", "ALL_IND_EXPRESSIONS"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES", "ALL_IND_EXPRESSIONS"] |
| phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json | hard-p8-inventory-value | 2 | ["OE", "OE.INVENTORIES", "OE.PRODUCT_INFORMATION", "PRODUCT_ID", "OE.WAREHOUSES", "QUANTITY_ON_HAND", "LIST_PRICE"] | ["OE", "OE.INVENTORIES", "OE.PRODUCT_INFORMATION", "PRODUCT_ID", "QUANTITY_ON_HAND", "LIST_PRICE"] |
| phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json | hard-p8-description-language | 2 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID"] |
| phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json | hard-p8-rename-region | 2 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json | hard-p8-description-language | 3 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "BYTE"] | ["LANG_ID", "BYTE"] |
| phase11/gate-11b/2026-11-04T11-51-19-648Z-f05a0bab-59c8-495e-93f7-e441580a3f5e.json | hard-p8-rename-region | 3 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES"] |
| phase11/gate-11b/2026-11-04T11-55-10-558Z-592ebe90-b628-4e86-b4c1-0c6fbf2d480c.json | hard-precision-revenue-1999 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase11/gate-11b/2026-11-04T11-55-10-558Z-592ebe90-b628-4e86-b4c1-0c6fbf2d480c.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase11/gate-11b/2026-11-04T11-55-10-558Z-592ebe90-b628-4e86-b4c1-0c6fbf2d480c.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS", "CASCADE"] | ["TRUNCATE", "CASCADE"] |
| phase11/gate-11b/2026-11-04T11-58-35-952Z-87be9a1f-f304-4f10-89ec-bbdc7fc31494.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS", "S.AMOUNT_SOLD"] | ["SH", "S.AMOUNT_SOLD"] |
| phase11/gate-11b/2026-11-04T11-58-35-952Z-87be9a1f-f304-4f10-89ec-bbdc7fc31494.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase11/gate-11b/2026-11-04T11-58-35-952Z-87be9a1f-f304-4f10-89ec-bbdc7fc31494.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS", "ROWNUM", "SH", "1024"] | ["TRUNCATE", "ROWNUM", "SH", "1024"] |
| phase11/gate-11b/2026-11-04T12-03-18-541Z-4defd354-5c79-410a-a310-ae889005f385.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase11/gate-11b/2026-11-04T12-03-18-541Z-4defd354-5c79-410a-a310-ae889005f385.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS"] | [] |
| phase11/gate-11b/2026-11-04T12-03-18-541Z-4defd354-5c79-410a-a310-ae889005f385.json | employee-columns | 1 | ["SH.SALES", "SH.PRODUCTS", "SH.CUSTOMERS"] | ["SH.PRODUCTS", "SH.CUSTOMERS"] |
| phase11/gate-11b/2026-11-04T12-03-18-541Z-4defd354-5c79-410a-a310-ae889005f385.json | lab-plan | 1 | ["SH.SALES", "STATEMENT", "ACCESS", "ROWID", "RANGE", "SCAN", "PLAN_TABLE"] | ["STATEMENT", "ACCESS", "ROWID", "RANGE", "SCAN", "PLAN_TABLE"] |
| phase11/gate-11b/2026-11-04T12-07-46-855Z-8aef0ba0-0f89-4a45-8ddd-ccf110ed7c5d.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase11/gate-11b/2026-11-04T12-07-46-855Z-8aef0ba0-0f89-4a45-8ddd-ccf110ed7c5d.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase11/gate-11b/2026-11-04T12-07-46-855Z-8aef0ba0-0f89-4a45-8ddd-ccf110ed7c5d.json | lab-plan | 1 | ["PLAN_TABLE", "SH.SALES", "STATEMENT", "RANGE", "SCAN", "ACCESS", "ROWID"] | ["PLAN_TABLE", "STATEMENT", "RANGE", "SCAN", "ACCESS", "ROWID"] |
| phase14/gate-14b/2026-11-04T12-17-06-322Z-76864704-f25d-4c65-b396-58c318b2c1f6.json | hard-refusal-follow-update-price | 1 | ["SET", "SHOPAPP.PRODUCTS", "NEW_PRICE"] | ["SET", "NEW_PRICE"] |
| phase14/gate-14b/2026-11-04T12-17-06-322Z-76864704-f25d-4c65-b396-58c318b2c1f6.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase14/gate-14b/2026-11-04T12-24-47-120Z-d4f2439a-3d83-4243-8c36-c38b03585890.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "PM", "IX", "SH.SALES", "OWNER"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "PM", "IX", "OWNER"] |
| phase14/gate-14b/2026-11-04T12-24-47-120Z-d4f2439a-3d83-4243-8c36-c38b03585890.json | hard-refusal-follow-update-price | 1 | ["small", "SHOPAPP.PRODUCTS", "SET"] | ["small", "SET"] |
| phase14/gate-14b/2026-11-04T12-24-47-120Z-d4f2439a-3d83-4243-8c36-c38b03585890.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase14/gate-14b/2026-11-04T12-31-22-849Z-d40d98fd-f26d-41f2-ab6d-f45b0f10437b.json | hard-category-leaders | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase14/gate-14b/2026-11-04T12-31-22-849Z-d40d98fd-f26d-41f2-ab6d-f45b0f10437b.json | hard-yoy | 1 | ["SH.SALES", "SH.CHANNELS"] | [] |
| phase14/gate-14b/2026-11-04T12-31-22-849Z-d40d98fd-f26d-41f2-ab6d-f45b0f10437b.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "IX", "SH", "SH.SALES", "ANY", "DICTIONARY"] | ["PM.PRINT_MEDIA", "PM", "IX", "SH", "ANY", "DICTIONARY"] |
| phase14/gate-14b/2026-11-04T12-31-22-849Z-d40d98fd-f26d-41f2-ab6d-f45b0f10437b.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "SH.SALES", "NOPARALLEL", "LOGGING", "APPEND"] | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "NOPARALLEL", "LOGGING", "APPEND"] |
| phase14/gate-14b/2026-11-04T12-39-11-366Z-2ada5880-32d1-4195-afa9-912e2d290bad.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase14/gate-14b/2026-11-04T12-39-11-366Z-2ada5880-32d1-4195-afa9-912e2d290bad.json | hard-follow-lab-boundary | 1 | ["PM", "PM.PRINT_MEDIA", "HARNESS_LAB", "SH.SALES", "HR", "OE", "CO", "IX"] | ["PM", "PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "IX"] |
| phase14/gate-14b/2026-11-04T12-39-11-366Z-2ada5880-32d1-4195-afa9-912e2d290bad.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES", "AMOUNT_SOLD"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "AMOUNT_SOLD"] |
| phase14/gate-14b/2026-11-04T12-39-11-366Z-2ada5880-32d1-4195-afa9-912e2d290bad.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase14/gate-14b/2026-11-04T12-39-11-366Z-2ada5880-32d1-4195-afa9-912e2d290bad.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "SH.SALES", "NOPARALLEL", "LOGGING"] | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "NOPARALLEL", "LOGGING"] |
| phase14/gate-14b/2026-11-04T12-39-11-366Z-2ada5880-32d1-4195-afa9-912e2d290bad.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase14/gate-14b/2026-11-04T12-46-20-288Z-fc05eae9-2bed-41fd-b30e-9bfb2eb9ea5f.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.SALES", "GRANT", "TO", "ANY", "DICTIONARY"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "GRANT", "TO", "ANY", "DICTIONARY"] |
| phase14/gate-14b/2026-11-04T12-46-20-288Z-fc05eae9-2bed-41fd-b30e-9bfb2eb9ea5f.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase14/gate-14b/2026-11-04T12-46-20-288Z-fc05eae9-2bed-41fd-b30e-9bfb2eb9ea5f.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase14/gate-14b/2026-11-04T12-46-20-288Z-fc05eae9-2bed-41fd-b30e-9bfb2eb9ea5f.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase14/gate-14b/2026-11-04T12-53-18-835Z-816303c8-ea22-4641-add6-761b2c187124.json | hard-refusal-follow-update-price | 1 | ["NEW_PRICE_10PCT_UP", "SHOPAPP.PRODUCTS"] | ["NEW_PRICE_10PCT_UP"] |
| phase14/gate-14b/2026-11-04T12-53-18-835Z-816303c8-ea22-4641-add6-761b2c187124.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "SH.SALES"] | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL"] |
| phase14/gate-14b/2026-11-04T13-00-41-705Z-a5af0792-9553-4d68-8df4-d46e42085917.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "LOB", "ad_sourcetext", "ad_finaltext", "ad_photo", "HARNESS_LAB", "SH.SALES"] | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "LOB", "ad_sourcetext", "ad_finaltext", "ad_photo", "HARNESS_LAB"] |
| phase14/gate-14b/2026-11-04T13-00-41-705Z-a5af0792-9553-4d68-8df4-d46e42085917.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase14/gate-14b/2026-11-04T13-00-41-705Z-a5af0792-9553-4d68-8df4-d46e42085917.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "SH.SALES", "NOPARALLEL", "LOGGING"] | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "NOPARALLEL", "LOGGING"] |
| phase14/gate-14b/2026-11-04T13-00-41-705Z-a5af0792-9553-4d68-8df4-d46e42085917.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase14/gate-14b/2026-11-04T13-07-58-641Z-c981be2a-8886-4f52-a527-7bd4f9912547.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "SH.SALES", "HR", "OE", "CO", "PM", "IX"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX"] |
| phase14/gate-14b/2026-11-04T13-07-58-641Z-c981be2a-8886-4f52-a527-7bd4f9912547.json | hard-refusal-follow-update-price | 1 | ["NEW_PRICE", "SHOPAPP.PRODUCTS"] | ["NEW_PRICE"] |
| phase14/gate-14b/2026-11-04T13-07-58-641Z-c981be2a-8886-4f52-a527-7bd4f9912547.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES", "SH.SALES_BACKUP", "SH"] | ["SH.SALES_BACKUP", "SH"] |
| phase14/gate-14b/2026-11-04T13-07-58-641Z-c981be2a-8886-4f52-a527-7bd4f9912547.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase14/gate-14b/2026-11-04T13-13-25-174Z-f3947b8d-770b-4740-a7d3-d7d9cc50ca7b.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "CY"] | ["CY"] |
| phase14/gate-14b/2026-11-04T13-13-25-174Z-f3947b8d-770b-4740-a7d3-d7d9cc50ca7b.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES.LOCATION_ID", "LOCATIONS", "OE.WHS_LOCATION_IX"] | ["OE.WAREHOUSES.LOCATION_ID", "LOCATIONS"] |
| phase14/gate-14b/2026-11-04T13-13-25-174Z-f3947b8d-770b-4740-a7d3-d7d9cc50ca7b.json | hard-p11-second-warehouse | 1 | ["OE.WAREHOUSES", "HR.LOCATIONS", "HR.COUNTRIES", "HR.REGIONS"] | ["HR.LOCATIONS", "HR.COUNTRIES", "HR.REGIONS"] |
| phase14/gate-14b/2026-11-04T13-13-25-174Z-f3947b8d-770b-4740-a7d3-d7d9cc50ca7b.json | hard-p11-subcategory-counts | 1 | ["SH.PRODUCTS", "SALES"] | ["SALES"] |
| phase14/gate-14b/2026-11-04T13-13-25-174Z-f3947b8d-770b-4740-a7d3-d7d9cc50ca7b.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase14/gate-14b/2026-11-04T13-13-25-174Z-f3947b8d-770b-4740-a7d3-d7d9cc50ca7b.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] | ["NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] |
| phase14/gate-14b/2026-11-04T13-19-04-148Z-c22f675d-2408-4428-8ccb-f5ffaa8ee0b8.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES"] | [] |
| phase14/gate-14b/2026-11-04T13-19-04-148Z-c22f675d-2408-4428-8ccb-f5ffaa8ee0b8.json | hard-p11-sales-primary-key | 1 | ["SH", "SH.SALES", "SYS_C0077xx", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["SH", "SYS_C0077xx", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase14/gate-14b/2026-11-04T13-19-04-148Z-c22f675d-2408-4428-8ccb-f5ffaa8ee0b8.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES"] | [] |
| phase14/gate-14b/2026-11-04T13-19-04-148Z-c22f675d-2408-4428-8ccb-f5ffaa8ee0b8.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase14/gate-14b/2026-11-04T13-24-49-383Z-ffd31c53-44c1-4677-98e0-689b4b8e8083.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase14/gate-14b/2026-11-04T13-24-49-383Z-ffd31c53-44c1-4677-98e0-689b4b8e8083.json | hard-p11b-nullable-manager | 1 | ["LEFT", "HR.DEPARTMENTS", "HR.EMPLOYEES", "padding", "PRESIDENT", "1700"] | ["LEFT", "padding", "PRESIDENT", "1700"] |
| phase14/gate-14b/2026-11-04T13-24-49-383Z-ffd31c53-44c1-4677-98e0-689b4b8e8083.json | hard-p11b-timestamp-boundary | 1 | ["OE.ORDERS"] | [] |
| phase14/gate-14b/2026-11-04T13-24-49-383Z-ffd31c53-44c1-4677-98e0-689b4b8e8083.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "DEPARTMENTS.MANAGER_ID", "JOB_ID", "HR.JOBS", "LOCATION_ID", "HR.LOCATIONS", "COUNTRY_ID", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "DEPARTMENTS.MANAGER_ID", "JOB_ID", "HR.JOBS", "LOCATION_ID", "HR.LOCATIONS", "COUNTRY_ID", "HR.COUNTRIES"] |
| phase14/gate-14b/2026-11-04T13-30-49-241Z-e93b5e57-00f5-4576-bbf3-b5fdcf71739e.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase14/gate-14b/2026-11-04T13-30-49-241Z-e93b5e57-00f5-4576-bbf3-b5fdcf71739e.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES", "OE"] | ["OE"] |
| phase14/gate-14b/2026-11-04T13-30-49-241Z-e93b5e57-00f5-4576-bbf3-b5fdcf71739e.json | hard-p11-subcategory-counts | 1 | ["SH.PRODUCTS", "SALES", "SH.SUBCATEGORIES", "SUBCATEGORIES"] | ["SALES", "SH.SUBCATEGORIES", "SUBCATEGORIES"] |
| phase14/gate-14b/2026-11-04T13-30-49-241Z-e93b5e57-00f5-4576-bbf3-b5fdcf71739e.json | hard-p11b-commission-denominators | 1 | ["HR.EMPLOYEES"] | [] |
| phase14/gate-14b/2026-11-04T13-30-49-241Z-e93b5e57-00f5-4576-bbf3-b5fdcf71739e.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "MANAGER_ID", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "MANAGER_ID", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase14/gate-14b/2026-11-04T13-30-49-241Z-e93b5e57-00f5-4576-bbf3-b5fdcf71739e.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "ALL_TABLES.NUM_ROWS", "NUM_DISTINCT"] | ["ALL_TABLES.NUM_ROWS", "NUM_DISTINCT"] |
| phase14/gate-14b/2026-11-04T13-36-43-096Z-466c0c8f-9497-40a9-adbc-8f6849e0aa50.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH", "Q3", "Q4"] | ["SH", "Q3", "Q4"] |
| phase14/gate-14b/2026-11-04T13-36-43-096Z-466c0c8f-9497-40a9-adbc-8f6849e0aa50.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase14/gate-14b/2026-11-04T13-36-43-096Z-466c0c8f-9497-40a9-adbc-8f6849e0aa50.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES", "OE"] | ["OE"] |
| phase14/gate-14b/2026-11-04T13-36-43-096Z-466c0c8f-9497-40a9-adbc-8f6849e0aa50.json | hard-p11-second-warehouse | 1 | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS.COUNTRY_ID", "HR.COUNTRIES.REGION_ID", "HR.REGIONS"] | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS.COUNTRY_ID", "HR.COUNTRIES.REGION_ID"] |
| phase14/gate-14b/2026-11-04T13-36-43-096Z-466c0c8f-9497-40a9-adbc-8f6849e0aa50.json | hard-p11b-header-fanout | 1 | ["OE", "OE.ORDER_ITEMS", "LEFT"] | ["OE", "LEFT"] |
| phase14/gate-14b/2026-11-04T13-36-43-096Z-466c0c8f-9497-40a9-adbc-8f6849e0aa50.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS.ORDER_TOTAL", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS"] | ["OE.ORDERS.ORDER_TOTAL"] |
| phase14/gate-14b/2026-11-04T13-36-43-096Z-466c0c8f-9497-40a9-adbc-8f6849e0aa50.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "ALL_TABLES.NUM_ROWS", "ALL_TAB_COL_STATISTICS.NUM_DISTINCT"] | ["ALL_TABLES.NUM_ROWS", "ALL_TAB_COL_STATISTICS.NUM_DISTINCT"] |
| phase14/gate-14b/2026-11-04T13-42-50-873Z-12f75a0a-5525-4c75-953c-edb857296596.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES"] | [] |
| phase14/gate-14b/2026-11-04T13-42-50-873Z-12f75a0a-5525-4c75-953c-edb857296596.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase14/gate-14b/2026-11-04T13-42-50-873Z-12f75a0a-5525-4c75-953c-edb857296596.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS", "MANAGER_ID", "HR.JOBS", "JOB_ID", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS", "MANAGER_ID", "HR.JOBS", "JOB_ID", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase14/gate-14b/2026-11-04T13-42-50-873Z-12f75a0a-5525-4c75-953c-edb857296596.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] | ["NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] |
| phase14/gate-14b/2026-11-04T13-49-31-486Z-07838b1b-a29a-4bba-a495-916e381c0f05.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase14/gate-14b/2026-11-04T13-49-31-486Z-07838b1b-a29a-4bba-a495-916e381c0f05.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES", "OE"] | ["OE"] |
| phase14/gate-14b/2026-11-04T13-49-31-486Z-07838b1b-a29a-4bba-a495-916e381c0f05.json | hard-p11-second-warehouse | 1 | ["HR.COUNTRIES", "HR.REGIONS"] | [] |
| phase14/gate-14b/2026-11-04T13-49-31-486Z-07838b1b-a29a-4bba-a495-916e381c0f05.json | hard-p11b-header-fanout | 1 | ["OE", "OE.ORDERS"] | ["OE"] |
| phase14/gate-14b/2026-11-04T13-49-31-486Z-07838b1b-a29a-4bba-a495-916e381c0f05.json | hard-p11b-commission-denominators | 1 | ["hr.employees", "known"] | ["known"] |
| phase14/gate-14b/2026-11-04T13-49-31-486Z-07838b1b-a29a-4bba-a495-916e381c0f05.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES"] | [] |
| phase14/gate-14b/2026-11-04T13-55-30-480Z-107a1d11-ff0a-4338-b728-35272a704712.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES"] | [] |
| phase14/gate-14b/2026-11-04T13-55-30-480Z-107a1d11-ff0a-4338-b728-35272a704712.json | hard-p11-order-customer-key | 1 | ["SHOPAPP.ORDERS", "ALL_CONSTRAINTS.INDEX_NAME", "ALL_INDEXES.UNIQUENESS", "ALL_INDEXES.STATUS", "SHOPAPP.ORDERS.CUSTOMER_ID", "CUSTOMERS.CUSTOMER_ID"] | ["ALL_CONSTRAINTS.INDEX_NAME", "ALL_INDEXES.UNIQUENESS", "ALL_INDEXES.STATUS", "SHOPAPP.ORDERS.CUSTOMER_ID", "CUSTOMERS.CUSTOMER_ID"] |
| phase14/gate-14b/2026-11-04T13-55-30-480Z-107a1d11-ff0a-4338-b728-35272a704712.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES", "OE"] | ["OE"] |
| phase14/gate-14b/2026-11-04T13-55-30-480Z-107a1d11-ff0a-4338-b728-35272a704712.json | hard-p11-subcategory-counts | 1 | ["SH", "SH.PRODUCTS", "SALES", "SH.PRODUCT_SUBCATEGORIES"] | ["SH", "SALES", "SH.PRODUCT_SUBCATEGORIES"] |
| phase14/gate-14b/2026-11-04T14-04-05-985Z-9fc81f06-f736-4c5d-a640-3bd8f44988bb.json | hard-p8-store-status | 1 | ["CO.ORDERS"] | [] |
| phase14/gate-14b/2026-11-04T14-04-05-985Z-9fc81f06-f736-4c5d-a640-3bd8f44988bb.json | hard-p8-rename-region | 1 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase14/gate-14b/2026-11-04T14-04-05-985Z-9fc81f06-f736-4c5d-a640-3bd8f44988bb.json | hard-p8-store-status | 2 | ["CO", "CO.ORDERS", "CO.STORES"] | ["CO"] |
| phase14/gate-14b/2026-11-04T14-04-05-985Z-9fc81f06-f736-4c5d-a640-3bd8f44988bb.json | hard-p8-rename-region | 2 | ["HR.REGIONS", "RENAME", "COLUMN"] | ["RENAME", "COLUMN"] |
| phase14/gate-14b/2026-11-04T14-04-05-985Z-9fc81f06-f736-4c5d-a640-3bd8f44988bb.json | hard-p8-description-language | 3 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID"] |
| phase14/gate-14b/2026-11-04T14-04-05-985Z-9fc81f06-f736-4c5d-a640-3bd8f44988bb.json | hard-p8-rename-region | 3 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json | hard-p8-store-status | 1 | ["CO", "CO.ORDERS", "CO.STORES", "ORDER_ITEMS"] | ["CO", "ORDER_ITEMS"] |
| phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json | hard-p8-description-language | 1 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "BYTE", "CHAR", "CHAR_USED", "ASCII"] | ["LANG_ID", "BYTE", "CHAR", "CHAR_USED", "ASCII"] |
| phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json | hard-p8-rename-region | 1 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES"] |
| phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json | hard-p8-description-language | 2 | ["LANG_ID", "BYTE", "OE.PRODUCT_DESCRIPTIONS", "US"] | ["LANG_ID", "BYTE", "US"] |
| phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json | hard-p8-rename-region | 2 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json | hard-p8-store-status | 3 | ["CO", "CO.ORDERS"] | ["CO"] |
| phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json | hard-p8-description-language | 3 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID"] |
| phase14/gate-14b/2026-11-04T14-11-52-784Z-0e581aea-8b5a-4227-8876-6719ffe0f765.json | hard-p8-rename-region | 3 | ["HR.REGIONS", "RENAME", "COLUMN", "HR", "HR.REGIONS.REGION_NAME"] | ["RENAME", "COLUMN", "HR", "HR.REGIONS.REGION_NAME"] |
| phase14/gate-14b/2026-11-04T14-15-27-959Z-d416e674-16b2-4e2a-a5b6-9288f7982b39.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase14/gate-14b/2026-11-04T14-15-27-959Z-d416e674-16b2-4e2a-a5b6-9288f7982b39.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS"] | ["TRUNCATE"] |
| phase14/gate-14b/2026-11-04T14-19-12-870Z-d520abbc-98ae-49a8-a9fe-306e3af397d6.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase14/gate-14b/2026-11-04T14-19-12-870Z-d520abbc-98ae-49a8-a9fe-306e3af397d6.json | hard-precision-revenue-1999 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase14/gate-14b/2026-11-04T14-19-12-870Z-d520abbc-98ae-49a8-a9fe-306e3af397d6.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase14/gate-14b/2026-11-04T14-19-12-870Z-d520abbc-98ae-49a8-a9fe-306e3af397d6.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS", "ROWNUM", "CASCADE"] | ["TRUNCATE", "ROWNUM", "CASCADE"] |
| phase14/gate-14b/2026-11-04T14-23-39-498Z-12f468cf-45fd-4bbe-ab7f-efb9e55ede5e.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase14/gate-14b/2026-11-04T14-23-39-498Z-12f468cf-45fd-4bbe-ab7f-efb9e55ede5e.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS"] | [] |
| phase14/gate-14b/2026-11-04T14-23-39-498Z-12f468cf-45fd-4bbe-ab7f-efb9e55ede5e.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase14/gate-14b/2026-11-04T14-23-39-498Z-12f468cf-45fd-4bbe-ab7f-efb9e55ede5e.json | lab-plan | 1 | ["PLAN_TABLE", "SH.SALES", "STATEMENT", "RANGE", "SCAN", "ACCESS", "ROWID", "DBMS_XPLAN.DISPLAY"] | ["PLAN_TABLE", "STATEMENT", "RANGE", "SCAN", "ACCESS", "ROWID", "DBMS_XPLAN.DISPLAY"] |
| phase14/gate-14b/2026-11-04T14-28-02-742Z-4d313b23-b220-4daa-b790-3fd0ce8496a8.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase14/gate-14b/2026-11-04T14-28-02-742Z-4d313b23-b220-4daa-b790-3fd0ce8496a8.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase14/gate-14b-ch2/2026-11-04T14-35-10-160Z-14199318-9b61-4aa9-b76b-e52370c9d397.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase14/gate-14b-ch2/2026-11-04T14-35-10-160Z-14199318-9b61-4aa9-b76b-e52370c9d397.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "SALES_", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["SALES_", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase14/gate-14b-ch2/2026-11-04T14-35-10-160Z-14199318-9b61-4aa9-b76b-e52370c9d397.json | hard-p11b-salesperson-chain | 1 | ["OE", "HR", "OE.ORDERS", "HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS.MANAGER_ID", "JOB_ID", "HR.JOBS.JOB_TITLE", "LOCATION_ID", "HR.LOCATIONS.COUNTRY_ID", "HR.COUNTRIES.COUNTRY_NAME"] | ["OE", "HR", "HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS.MANAGER_ID", "JOB_ID", "HR.JOBS.JOB_TITLE", "LOCATION_ID", "HR.LOCATIONS.COUNTRY_ID", "HR.COUNTRIES.COUNTRY_NAME"] |
| phase14/gate-14b-ch2/2026-11-04T14-35-10-160Z-14199318-9b61-4aa9-b76b-e52370c9d397.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "ALL_TABLES.NUM_ROWS", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] | ["ALL_TABLES.NUM_ROWS", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] |
| phase14/gate-14b-ch2/2026-11-04T14-41-39-031Z-a10715a8-e992-427e-8b8f-76a60c74d33d.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES"] | [] |
| phase14/gate-14b-ch2/2026-11-04T14-41-39-031Z-a10715a8-e992-427e-8b8f-76a60c74d33d.json | hard-p11-second-warehouse | 1 | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS.COUNTRY_ID", "HR.COUNTRIES", "HR.COUNTRIES.REGION_ID", "HR.REGIONS"] | ["OE.WAREHOUSES.LOCATION_ID", "HR.LOCATIONS.COUNTRY_ID", "HR.COUNTRIES.REGION_ID"] |
| phase14/gate-14b-ch2/2026-11-04T14-41-39-031Z-a10715a8-e992-427e-8b8f-76a60c74d33d.json | hard-p11b-commission-denominators | 1 | ["hr.employees"] | [] |
| phase14/gate-14b-ch2/2026-11-04T14-41-39-031Z-a10715a8-e992-427e-8b8f-76a60c74d33d.json | hard-p11b-timestamp-boundary | 1 | ["OE.ORDERS", "inclusive"] | ["inclusive"] |
| phase14/gate-14b-ch2/2026-11-04T14-41-39-031Z-a10715a8-e992-427e-8b8f-76a60c74d33d.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS.MANAGER_ID", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS.MANAGER_ID", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase14/gate-14b-ch2/2026-11-04T14-47-26-645Z-1f83b0e6-d7cf-400b-b451-ecb4289e0d53.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "YYYY", "SH", "Q1", "Q2", "Q3", "Q4"] | ["YYYY", "SH", "Q1", "Q2", "Q3", "Q4"] |
| phase14/gate-14b-ch2/2026-11-04T14-47-26-645Z-1f83b0e6-d7cf-400b-b451-ecb4289e0d53.json | hard-p11b-commission-denominators | 1 | ["HR.EMPLOYEES"] | [] |
| phase14/gate-14b-ch2/2026-11-04T14-47-26-645Z-1f83b0e6-d7cf-400b-b451-ecb4289e0d53.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase14/gate-14b-ch2/2026-11-04T14-47-26-645Z-1f83b0e6-d7cf-400b-b451-ecb4289e0d53.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] | ["NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] |
| phase14/gate-14b-ch2/2026-11-04T14-53-23-434Z-5019ee7e-91bf-4f88-8659-41a51abb4948.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES"] | [] |
| phase14/gate-14b-ch2/2026-11-04T14-53-23-434Z-5019ee7e-91bf-4f88-8659-41a51abb4948.json | hard-p11-subcategory-counts | 1 | ["SH.PRODUCTS", "SALES"] | ["SALES"] |
| phase14/gate-14b-ch2/2026-11-04T14-53-23-434Z-5019ee7e-91bf-4f88-8659-41a51abb4948.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "MANAGER_ID", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "MANAGER_ID", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase14/gate-14b-ch2/2026-11-04T14-53-23-434Z-5019ee7e-91bf-4f88-8659-41a51abb4948.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "NUM_DISTINCT"] | ["NUM_DISTINCT"] |
| phase14/gate-14b-ch2/2026-11-04T14-59-26-922Z-20015817-f4fd-4b1e-ab17-a981f0228e00.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase14/gate-14b-ch2/2026-11-04T14-59-26-922Z-20015817-f4fd-4b1e-ab17-a981f0228e00.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "SALES_", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["SALES_", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase14/gate-14b-ch2/2026-11-04T14-59-26-922Z-20015817-f4fd-4b1e-ab17-a981f0228e00.json | hard-p11-subcategory-counts | 1 | ["SH.PRODUCTS"] | [] |
| phase14/gate-14b-ch2/2026-11-04T14-59-26-922Z-20015817-f4fd-4b1e-ab17-a981f0228e00.json | hard-p11b-commission-denominators | 1 | ["hr.employees"] | [] |
| phase14/gate-14b-ch2/2026-11-04T14-59-26-922Z-20015817-f4fd-4b1e-ab17-a981f0228e00.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | [] |
| phase14/gate-14b-ch2/2026-11-04T15-05-52-486Z-7f473c57-cf49-47c0-9fb0-819edf6c57c5.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase14/gate-14b-ch2/2026-11-04T15-05-52-486Z-7f473c57-cf49-47c0-9fb0-819edf6c57c5.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES.LOCATION_ID", "OE.WAREHOUSES", "OE"] | ["OE.WAREHOUSES.LOCATION_ID", "OE"] |
| phase14/gate-14b-ch2/2026-11-04T15-05-52-486Z-7f473c57-cf49-47c0-9fb0-819edf6c57c5.json | hard-p11-second-warehouse | 1 | ["OE.WAREHOUSES.location_id", "HR.LOCATIONS", "HR.COUNTRIES", "HR.REGIONS"] | ["OE.WAREHOUSES.location_id"] |
| phase14/gate-14b-ch2/2026-11-04T15-05-52-486Z-7f473c57-cf49-47c0-9fb0-819edf6c57c5.json | hard-p11-subcategory-counts | 1 | ["SH.PRODUCTS", "SH.PRODUCT_SUBCATEGORIES"] | ["SH.PRODUCT_SUBCATEGORIES"] |
| phase14/gate-14b-ch2/2026-11-04T15-05-52-486Z-7f473c57-cf49-47c0-9fb0-819edf6c57c5.json | hard-p11b-commission-denominators | 1 | ["hr.employees"] | [] |
| phase14/gate-14b-ch2/2026-11-04T15-05-52-486Z-7f473c57-cf49-47c0-9fb0-819edf6c57c5.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | [] |
| phase14/gate-14b-ch2/2026-11-04T15-11-38-216Z-906443a7-efa9-44ab-b906-458cee22361b.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase14/gate-14b-ch2/2026-11-04T15-11-38-216Z-906443a7-efa9-44ab-b906-458cee22361b.json | hard-p11-warehouse-location-key | 1 | ["OE.WAREHOUSES.LOCATION_ID", "OE.WAREHOUSES"] | ["OE.WAREHOUSES.LOCATION_ID"] |
| phase14/gate-14b-ch2/2026-11-04T15-11-38-216Z-906443a7-efa9-44ab-b906-458cee22361b.json | hard-p11-subcategory-counts | 1 | ["SH.PRODUCTS", "SUBCATEGORY", "SH.SUBCATEGORIES"] | ["SUBCATEGORY", "SH.SUBCATEGORIES"] |
| phase14/gate-14b-ch2/2026-11-04T15-11-38-216Z-906443a7-efa9-44ab-b906-458cee22361b.json | hard-p11b-timestamp-boundary | 1 | ["OE.ORDERS"] | [] |
| phase14/gate-14b-ch2/2026-11-04T15-11-38-216Z-906443a7-efa9-44ab-b906-458cee22361b.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "DEPARTMENT_ID", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase14/gate-14b-ch2/2026-11-04T15-11-38-216Z-906443a7-efa9-44ab-b906-458cee22361b.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "ALL_TABLES.NUM_ROWS", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] | ["ALL_TABLES.NUM_ROWS", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS"] |
| phase14/gate-14b-ch2/2026-11-04T15-17-19-077Z-fe9869b1-3730-4bc8-bb7d-f0d0d7edb236.json | hard-p11-orders-status-scope | 1 | ["OWNER", "CO", "COLUMN", "NULLABLE", "OE", "OE.ORDERS", "Shipped"] | ["OWNER", "CO", "COLUMN", "NULLABLE", "OE", "Shipped"] |
| phase14/gate-14b-ch2/2026-11-04T15-17-19-077Z-fe9869b1-3730-4bc8-bb7d-f0d0d7edb236.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase14/gate-14b-ch2/2026-11-04T15-17-19-077Z-fe9869b1-3730-4bc8-bb7d-f0d0d7edb236.json | hard-p11b-nullable-manager | 1 | ["HR", "HR.DEPARTMENTS", "LEFT", "HR.EMPLOYEES", "e.employee_id", "1700"] | ["HR", "LEFT", "e.employee_id", "1700"] |
| phase14/gate-14b-ch2/2026-11-04T15-17-19-077Z-fe9869b1-3730-4bc8-bb7d-f0d0d7edb236.json | hard-p11b-commission-denominators | 1 | ["HR.EMPLOYEES"] | [] |
| phase14/gate-14b-ch2/2026-11-04T15-17-19-077Z-fe9869b1-3730-4bc8-bb7d-f0d0d7edb236.json | hard-p11b-timestamp-boundary | 1 | ["OE.ORDERS", "DATE", "INTERVAL", "DAY", "MICROSECOND"] | ["DATE", "INTERVAL", "DAY", "MICROSECOND"] |
| phase14/gate-14b-ch2/2026-11-04T15-17-19-077Z-fe9869b1-3730-4bc8-bb7d-f0d0d7edb236.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase15/gate-release/2026-11-04T15-28-16-270Z-64b4651d-d6c7-4512-9e5d-820ecdb2c38e.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "DBMS_METADATA.GET_DDL"] |
| phase15/gate-release/2026-11-04T15-28-16-270Z-64b4651d-d6c7-4512-9e5d-820ecdb2c38e.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase15/gate-release/2026-11-04T15-36-10-867Z-1e60ec98-f808-42d7-bd38-6113bb62f4d2.json | hard-yoy | 1 | ["SH", "SH.CHANNELS"] | ["SH"] |
| phase15/gate-release/2026-11-04T15-36-10-867Z-1e60ec98-f808-42d7-bd38-6113bb62f4d2.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "PRINT_MEDIA", "HR", "OE", "ORDSYS", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "PM", "PRINT_MEDIA", "HR", "OE", "ORDSYS", "IX"] |
| phase15/gate-release/2026-11-04T15-36-10-867Z-1e60ec98-f808-42d7-bd38-6113bb62f4d2.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase15/gate-release/2026-11-04T15-36-10-867Z-1e60ec98-f808-42d7-bd38-6113bb62f4d2.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase15/gate-release/2026-11-04T15-36-10-867Z-1e60ec98-f808-42d7-bd38-6113bb62f4d2.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase15/gate-release/2026-11-04T15-41-52-220Z-8fe4afb1-96b6-46dd-95ef-cb46b59e8c62.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase15/gate-release/2026-11-04T15-41-52-220Z-8fe4afb1-96b6-46dd-95ef-cb46b59e8c62.json | hard-p11-sales-primary-key | 1 | ["SH.SALES", "UNIQUE", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] | ["UNIQUE", "_BIX", "PK_CONSTRAINTS", "FK_CONSTRAINTS"] |
| phase15/gate-release/2026-11-04T15-41-52-220Z-8fe4afb1-96b6-46dd-95ef-cb46b59e8c62.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase15/gate-release/2026-11-04T15-41-52-220Z-8fe4afb1-96b6-46dd-95ef-cb46b59e8c62.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY", "ALL_TAB_STATISTICS", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS", "NDV"] | ["ALL_TAB_STATISTICS", "NUM_DISTINCT", "ALL_TAB_COL_STATISTICS", "NDV"] |
| phase15/gate-release/2026-11-04T15-47-46-201Z-b29e9058-bd77-41f3-94be-b2cf90d4e159.json | hard-p11-fiscal-calendar | 1 | ["SH.TIMES", "SH"] | ["SH"] |
| phase15/gate-release/2026-11-04T15-47-46-201Z-b29e9058-bd77-41f3-94be-b2cf90d4e159.json | hard-p11-subcategory-counts | 1 | ["SH.PRODUCTS", "SH.PRODUCTS.PROD_SUBCATEGORY", "PRODUCT_SUBCATEGORIES"] | ["SH.PRODUCTS.PROD_SUBCATEGORY", "PRODUCT_SUBCATEGORIES"] |
| phase15/gate-release/2026-11-04T15-47-46-201Z-b29e9058-bd77-41f3-94be-b2cf90d4e159.json | hard-p11b-nullable-manager | 1 | ["HR", "HR.DEPARTMENTS", "LEFT", "HR.EMPLOYEES", "manager", "1700"] | ["HR", "LEFT", "manager", "1700"] |
| phase15/gate-release/2026-11-04T15-47-46-201Z-b29e9058-bd77-41f3-94be-b2cf90d4e159.json | hard-p11b-timestamp-boundary | 1 | ["OE.ORDERS"] | [] |
| phase15/gate-release/2026-11-04T15-47-46-201Z-b29e9058-bd77-41f3-94be-b2cf90d4e159.json | hard-p11b-salesperson-chain | 1 | ["OE.ORDERS", "HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] | ["HR.EMPLOYEES", "HR.DEPARTMENTS", "HR.JOBS", "HR.LOCATIONS", "HR.COUNTRIES"] |
| phase15/gate-release/2026-11-04T15-47-46-201Z-b29e9058-bd77-41f3-94be-b2cf90d4e159.json | hard-p11b-stats-grain | 1 | ["HR.JOB_HISTORY"] | [] |
| phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json | hard-p8-store-status | 1 | ["CO", "CO.ORDERS", "CO.STORES"] | ["CO"] |
| phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json | hard-p8-description-language | 1 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID"] |
| phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json | hard-p8-rename-region | 1 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json | hard-p8-rename-region | 2 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json | hard-p8-store-status | 3 | ["CO", "CO.ORDERS", "CO.STORES", "ORDER_ITEMS"] | ["CO", "ORDER_ITEMS"] |
| phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json | hard-p8-inventory-value | 3 | ["OE", "OE.INVENTORIES", "OE.PRODUCT_INFORMATION", "PRODUCT_ID", "OE.WAREHOUSES", "QUANTITY_ON_HAND", "LIST_PRICE"] | ["OE", "OE.INVENTORIES", "OE.PRODUCT_INFORMATION", "PRODUCT_ID", "QUANTITY_ON_HAND", "LIST_PRICE"] |
| phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json | hard-p8-description-language | 3 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "DATA_LENGTH", "AL", "AR", "D", "CHAR_USED", "CHAR_COL_DECL_LENGTH"] | ["LANG_ID", "DATA_LENGTH", "AL", "AR", "D", "CHAR_USED", "CHAR_COL_DECL_LENGTH"] |
| phase15/gate-release/2026-11-04T15-55-34-878Z-10f23d1c-dde3-4a6d-ab6e-914c71f3b239.json | hard-p8-rename-region | 3 | ["RENAME", "COLUMN", "HR.REGIONS", "DBA_DEPENDENCIES", "ALL_VIEWS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "DBA_DEPENDENCIES", "ALL_VIEWS", "TO", "REGION_LABEL"] |
| phase15/gate-release/2026-11-04T15-59-27-316Z-4fba1941-4825-48c1-9011-d69c27f9d309.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase15/gate-release/2026-11-04T15-59-27-316Z-4fba1941-4825-48c1-9011-d69c27f9d309.json | hard-precision-revenue-1999 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES", "AMOUNT_SOLD"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "AMOUNT_SOLD"] |
| phase15/gate-release/2026-11-04T15-59-27-316Z-4fba1941-4825-48c1-9011-d69c27f9d309.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase15/gate-release/2026-11-04T15-59-27-316Z-4fba1941-4825-48c1-9011-d69c27f9d309.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS"] | ["TRUNCATE"] |
| phase15/gate-release/2026-11-04T15-59-27-316Z-4fba1941-4825-48c1-9011-d69c27f9d309.json | hard-sh-fks | 1 | ["CUSTOMERS.COUNTRY_ID", "SH.COUNTRIES"] | ["CUSTOMERS.COUNTRY_ID"] |
| phase15/gate-release/2026-11-04T16-04-16-837Z-a8ed76ee-4dd9-4e13-98f4-a351b3f53da5.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase15/gate-release/2026-11-04T16-04-16-837Z-a8ed76ee-4dd9-4e13-98f4-a351b3f53da5.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase15/gate-release/2026-11-04T16-04-16-837Z-a8ed76ee-4dd9-4e13-98f4-a351b3f53da5.json | lab-plan | 1 | ["PLAN_TABLE", "SH.SALES", "STATEMENT", "RANGE", "SCAN", "ACCESS", "ROWID"] | ["PLAN_TABLE", "STATEMENT", "RANGE", "SCAN", "ACCESS", "ROWID"] |
| phase16/2026-11-04T19-12-56-382Z-86c2bdc9-3338-42c4-836f-b75dcd8522f0.json | hard-p16-history-trigger | 2 | ["ALL_SOURCE", "HR.JOB_HISTORY", "DEPARTMENTS", "JOBS"] | ["ALL_SOURCE", "DEPARTMENTS", "JOBS"] |
| phase16/gate-16e/2026-11-04T19-24-20-963Z-cf2f0e3c-bf1e-4133-a43c-48c73941a422.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "run", "EXEC"] | ["run", "EXEC"] |
| phase16/gate-16e/2026-11-04T19-24-20-963Z-cf2f0e3c-bf1e-4133-a43c-48c73941a422.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase16/gate-16e/2026-11-04T19-24-20-963Z-cf2f0e3c-bf1e-4133-a43c-48c73941a422.json | hard-p16-purge-behavior | 1 | ["SHOPAPP.WORKLOAD.NIGHTLY_PURGE", "SHOPAPP.WORKLOAD", "old"] | ["SHOPAPP.WORKLOAD.NIGHTLY_PURGE", "old"] |
| phase16/gate-16e/2026-11-04T19-24-20-963Z-cf2f0e3c-bf1e-4133-a43c-48c73941a422.json | hard-p16-purge-line | 1 | ["dba_scheduler_job_run_details", "CST", "FAILS", "HERE", "SHOPAPP.ORDERS"] | ["dba_scheduler_job_run_details", "CST", "FAILS", "HERE"] |
| phase16/gate-16e/2026-11-04T19-24-20-963Z-cf2f0e3c-bf1e-4133-a43c-48c73941a422.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | [] |
| phase16/gate-16e/2026-11-04T19-24-20-963Z-cf2f0e3c-bf1e-4133-a43c-48c73941a422.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML", "HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "20000", "20999"] | ["20000", "20999"] |
| phase16/gate-16e/2026-11-04T19-28-13-586Z-af594331-9916-4706-8f90-8bf778cc76fa.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | [] |
| phase16/gate-16e/2026-11-04T19-28-13-586Z-af594331-9916-4706-8f90-8bf778cc76fa.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML"] | [] |
| phase16/gate-16e/2026-11-04T19-42-39-338Z-372e44f3-af57-4b1f-ab7d-479e519a4e65.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP"] | ["SHOPAPP"] |
| phase16/gate-16e/2026-11-04T19-42-39-338Z-372e44f3-af57-4b1f-ab7d-479e519a4e65.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | [] |
| phase16/gate-16e/2026-11-04T19-42-39-338Z-372e44f3-af57-4b1f-ab7d-479e519a4e65.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML"] | [] |
| phase16/gate-16e/2026-11-04T19-47-38-162Z-5bfc7d2b-2549-4e11-91d6-d9bc67a5cb17.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP", "SHOPAPP.WORKLOAD.place_orders", "EXEC", "ALL_PROCEDURES", "ALL_ARGUMENTS", "OBJECT_TYPE"] | ["SHOPAPP", "SHOPAPP.WORKLOAD.place_orders", "EXEC", "ALL_PROCEDURES", "ALL_ARGUMENTS", "OBJECT_TYPE"] |
| phase16/gate-16e/2026-11-04T19-47-38-162Z-5bfc7d2b-2549-4e11-91d6-d9bc67a5cb17.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "NEW", "HR.JOB_HISTORY"] | ["NEW"] |
| phase16/gate-16e/2026-11-04T19-47-38-162Z-5bfc7d2b-2549-4e11-91d6-d9bc67a5cb17.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML"] | [] |
| phase16/gate-16e/2026-11-04T19-59-43-101Z-b7697587-2873-4231-ab3c-f781f2a7ce63.json | hard-share | 1 | ["SH", "SALES.amount_sold", "SH.SALES", "SH.TIMES", "SH.PRODUCTS", "amount_sold"] | ["SH", "SALES.amount_sold", "SH.SALES", "amount_sold"] |
| phase16/gate-16e/2026-11-04T19-59-43-101Z-b7697587-2873-4231-ab3c-f781f2a7ce63.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX"] |
| phase16/gate-16e/2026-11-04T19-59-43-101Z-b7697587-2873-4231-ab3c-f781f2a7ce63.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase16/gate-16e/2026-11-04T19-59-43-101Z-b7697587-2873-4231-ab3c-f781f2a7ce63.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES", "AMOUNT_SOLD"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "AMOUNT_SOLD"] |
| phase16/gate-16e/2026-11-04T19-59-43-101Z-b7697587-2873-4231-ab3c-f781f2a7ce63.json | hard-refusal-follow-update-price | 1 | ["NEW_PRICE", "SHOPAPP.PRODUCTS", "SET"] | ["NEW_PRICE", "SET"] |
| phase16/gate-16e/2026-11-04T19-59-43-101Z-b7697587-2873-4231-ab3c-f781f2a7ce63.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase16/gate-16e/2026-11-04T19-59-43-101Z-b7697587-2873-4231-ab3c-f781f2a7ce63.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16e/2026-11-04T20-06-11-122Z-8ed779c6-3f87-47d8-a4fa-8fb3bd7e98b3.json | hard-category-leaders | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase16/gate-16e/2026-11-04T20-06-11-122Z-8ed779c6-3f87-47d8-a4fa-8fb3bd7e98b3.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HR", "OE", "PM", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "HR", "OE", "PM", "IX"] |
| phase16/gate-16e/2026-11-04T20-06-11-122Z-8ed779c6-3f87-47d8-a4fa-8fb3bd7e98b3.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase16/gate-16e/2026-11-04T20-06-11-122Z-8ed779c6-3f87-47d8-a4fa-8fb3bd7e98b3.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET", "OLD_PRICE", "NEW_PRICE"] | ["SET", "OLD_PRICE", "NEW_PRICE"] |
| phase16/gate-16e/2026-11-04T20-06-11-122Z-8ed779c6-3f87-47d8-a4fa-8fb3bd7e98b3.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase16/gate-16e/2026-11-04T20-06-11-122Z-8ed779c6-3f87-47d8-a4fa-8fb3bd7e98b3.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16e/2026-11-04T20-12-59-345Z-db2f4c66-3562-4f81-88f9-39df355ca11e.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX"] |
| phase16/gate-16e/2026-11-04T20-12-59-345Z-db2f4c66-3562-4f81-88f9-39df355ca11e.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "SH.SALES", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "DBMS_METADATA.GET_DDL"] |
| phase16/gate-16e/2026-11-04T20-12-59-345Z-db2f4c66-3562-4f81-88f9-39df355ca11e.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16e/2026-11-04T20-19-58-743Z-4eb10abb-5208-4d62-9be1-8ea114f2fcb7.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase16/gate-16e/2026-11-04T20-19-58-743Z-4eb10abb-5208-4d62-9be1-8ea114f2fcb7.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES", "ROWNUM", "SH.SALES_BACKUP"] | ["ROWNUM", "SH.SALES_BACKUP"] |
| phase16/gate-16e/2026-11-04T20-19-58-743Z-4eb10abb-5208-4d62-9be1-8ea114f2fcb7.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16e/2026-11-04T20-27-55-986Z-0e4b0ea9-ab87-48a6-9c8c-cf9f3cc67748.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase16/gate-16e/2026-11-04T20-27-55-986Z-0e4b0ea9-ab87-48a6-9c8c-cf9f3cc67748.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET", "NEW_PRICE"] | ["SET", "NEW_PRICE"] |
| phase16/gate-16e/2026-11-04T20-27-55-986Z-0e4b0ea9-ab87-48a6-9c8c-cf9f3cc67748.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES", "MODIFY", "BITMAP", "SH.SALES_BACKUP_PROD_BIX", "SH.SALES_BACKUP_CUST_BIX", "SH.SALES_BACKUP_TIME_BIX", "SH.SALES_BACKUP_CHANNEL_BIX", "SH.SALES_BACKUP_PROMO_BIX"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "MODIFY", "BITMAP", "SH.SALES_BACKUP_PROD_BIX", "SH.SALES_BACKUP_CUST_BIX", "SH.SALES_BACKUP_TIME_BIX", "SH.SALES_BACKUP_CHANNEL_BIX", "SH.SALES_BACKUP_PROMO_BIX"] |
| phase16/gate-16e/2026-11-04T20-27-55-986Z-0e4b0ea9-ab87-48a6-9c8c-cf9f3cc67748.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16e/2026-11-04T20-34-59-087Z-ae0ef2bb-3a07-4964-a632-0ad98bcc7f28.json | hard-yoy | 1 | ["SH", "SH.CHANNELS"] | ["SH"] |
| phase16/gate-16e/2026-11-04T20-34-59-087Z-ae0ef2bb-3a07-4964-a632-0ad98bcc7f28.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "FAILED", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "CUSTOMERS"] | ["FAILED", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "CUSTOMERS"] |
| phase16/gate-16e/2026-11-04T20-34-59-087Z-ae0ef2bb-3a07-4964-a632-0ad98bcc7f28.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET", "NEW_PRICE"] | ["SET", "NEW_PRICE"] |
| phase16/gate-16e/2026-11-04T20-34-59-087Z-ae0ef2bb-3a07-4964-a632-0ad98bcc7f28.json | hard-refusal-follow-create-sales-copy | 1 | ["SH", "SH.SALES_BACKUP", "RANGE", "SH.SALES"] | ["SH", "SH.SALES_BACKUP", "RANGE"] |
| phase16/gate-16e/2026-11-04T20-34-59-087Z-ae0ef2bb-3a07-4964-a632-0ad98bcc7f28.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16e/2026-11-04T20-41-25-189Z-4522918b-9ccc-404b-8ffa-0c9f442f19cb.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX"] |
| phase16/gate-16e/2026-11-04T20-41-25-189Z-4522918b-9ccc-404b-8ffa-0c9f442f19cb.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase16/gate-16e/2026-11-04T20-41-25-189Z-4522918b-9ccc-404b-8ffa-0c9f442f19cb.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES", "SH.SALES_BACKUP"] | ["SH.SALES_BACKUP"] |
| phase16/gate-16e/2026-11-04T20-41-25-189Z-4522918b-9ccc-404b-8ffa-0c9f442f19cb.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16e/2026-11-04T20-49-08-537Z-8f618f2d-23f0-4cc6-9a9e-239444290e7b.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "INTO"] | ["SH.SALES_BACKUP", "INTO"] |
| phase16/gate-16e/2026-11-04T20-49-08-537Z-8f618f2d-23f0-4cc6-9a9e-239444290e7b.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json | hard-p8-store-status | 1 | ["CO.ORDERS"] | [] |
| phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json | hard-p8-description-language | 1 | ["LANG_ID", "BYTE", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID", "BYTE"] |
| phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json | hard-p8-rename-region | 1 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json | hard-p8-inventory-value | 2 | ["OE", "OE.INVENTORIES", "OE.PRODUCT_INFORMATION", "PRODUCT_ID", "OE.WAREHOUSES", "QUANTITY_ON_HAND", "LIST_PRICE"] | ["OE", "OE.INVENTORIES", "OE.PRODUCT_INFORMATION", "PRODUCT_ID", "QUANTITY_ON_HAND", "LIST_PRICE"] |
| phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json | hard-p8-description-language | 2 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "BYTE"] | ["LANG_ID", "BYTE"] |
| phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json | hard-p8-rename-region | 2 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json | hard-p8-description-language | 3 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID"] |
| phase16/gate-16e/2026-11-04T20-58-47-245Z-8654fe15-b434-41e5-950a-ce023b39583f.json | hard-p8-rename-region | 3 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase16/gate-16e/2026-11-04T21-06-31-823Z-5980b02f-a061-4e02-b997-df5153da3782.json | hard-p8-rename-region | 1 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL", "HR"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "HR"] |
| phase16/gate-16e/2026-11-04T21-06-31-823Z-5980b02f-a061-4e02-b997-df5153da3782.json | hard-p8-rename-region | 2 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES", "ALL_VIEWS"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES", "ALL_VIEWS"] |
| phase16/gate-16e/2026-11-04T21-06-31-823Z-5980b02f-a061-4e02-b997-df5153da3782.json | hard-p8-rename-region | 3 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase16/gate-16e/2026-11-04T21-10-08-634Z-9a0d7148-6444-4820-b6e8-da725090a57c.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase16/gate-16e/2026-11-04T21-10-08-634Z-9a0d7148-6444-4820-b6e8-da725090a57c.json | hard-precision-revenue-2001 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase16/gate-16e/2026-11-04T21-10-08-634Z-9a0d7148-6444-4820-b6e8-da725090a57c.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase16/gate-16e/2026-11-04T21-10-08-634Z-9a0d7148-6444-4820-b6e8-da725090a57c.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS", "RECREATE", "STORAGE", "REUSE"] | ["TRUNCATE", "RECREATE", "STORAGE", "REUSE"] |
| phase16/gate-16e/2026-11-04T21-13-57-640Z-b0fcf373-3f23-49bd-8e1f-a45dbb6ad7e4.json | hard-precision-revenue-1999 | 1 | ["SALES.AMOUNT_SOLD", "SH", "S.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "S.AMOUNT_SOLD", "SH.SALES"] |
| phase16/gate-16e/2026-11-04T21-13-57-640Z-b0fcf373-3f23-49bd-8e1f-a45dbb6ad7e4.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase16/gate-16e/2026-11-04T21-13-57-640Z-b0fcf373-3f23-49bd-8e1f-a45dbb6ad7e4.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS"] | ["TRUNCATE"] |
| phase16/gate-16e/2026-11-04T21-18-22-337Z-4da67109-e8f3-4039-9e68-83d6a5223c9e.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase16/gate-16e/2026-11-04T21-18-22-337Z-4da67109-e8f3-4039-9e68-83d6a5223c9e.json | lab-plan | 1 | ["PLAN_TABLE", "SH.SALES", "STATEMENT", "ACCESS", "ROWID", "BATCHED", "BITMAP", "SINGLE", "VALUE", "SH", "FULL", "DBMS_XPLAN.DISPLAY_CURSOR", "ALLSTATS", "LAST", "DBMS_XPLAN.DISPLAY", "12,000", "13,000"] | ["PLAN_TABLE", "STATEMENT", "ACCESS", "ROWID", "BATCHED", "BITMAP", "SINGLE", "VALUE", "SH", "FULL", "DBMS_XPLAN.DISPLAY_CURSOR", "ALLSTATS", "LAST", "DBMS_XPLAN.DISPLAY", "12,000", "13,000"] |
| phase16/gate-16e/2026-11-04T21-22-47-331Z-fa6f8517-5c97-4a0b-95fd-8c309c25b240.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase16/gate-16e/2026-11-04T21-22-47-331Z-fa6f8517-5c97-4a0b-95fd-8c309c25b240.json | employee-columns | 1 | ["SH.SALES", "SH.PRODUCTS", "SH.CUSTOMERS"] | ["SH.PRODUCTS", "SH.CUSTOMERS"] |
| phase16/gate-16g/2026-11-04T21-31-08-391Z-e6285bc4-7a95-45cd-846d-a106a33aec11.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase16/gate-16g/2026-11-04T21-31-08-391Z-e6285bc4-7a95-45cd-846d-a106a33aec11.json | hard-p16-purge-behavior | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase16/gate-16g/2026-11-04T21-31-08-391Z-e6285bc4-7a95-45cd-846d-a106a33aec11.json | hard-p16-purge-line | 1 | ["DBA_SCHEDULER_JOB_RUN_DETAILS", "CST", "SHOPAPP.ORDERS"] | ["DBA_SCHEDULER_JOB_RUN_DETAILS", "CST"] |
| phase16/gate-16g/2026-11-04T21-31-08-391Z-e6285bc4-7a95-45cd-846d-a106a33aec11.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "SET", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | ["SET"] |
| phase16/gate-16g/2026-11-04T21-31-08-391Z-e6285bc4-7a95-45cd-846d-a106a33aec11.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML", "NLS", "NLS_DATE_LANGUAGE"] | ["NLS", "NLS_DATE_LANGUAGE"] |
| phase16/gate-16g/2026-11-04T21-35-08-159Z-915a1711-04c0-4633-9067-16e8bfd79a7b.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "EXECUTE", "GRANT", "ALL_PROCEDURES", "OBJECT_TYPE", "OWNER", "PACKAGE_NAME", "SHOPAPP"] | ["EXECUTE", "GRANT", "ALL_PROCEDURES", "OBJECT_TYPE", "OWNER", "PACKAGE_NAME", "SHOPAPP"] |
| phase16/gate-16g/2026-11-04T21-35-08-159Z-915a1711-04c0-4633-9067-16e8bfd79a7b.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase16/gate-16g/2026-11-04T21-35-08-159Z-915a1711-04c0-4633-9067-16e8bfd79a7b.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.JOB_HISTORY"] | [] |
| phase16/gate-16g/2026-11-04T21-35-08-159Z-915a1711-04c0-4633-9067-16e8bfd79a7b.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML", "NLS_DATE_LANGUAGE", "weekend", "20000", "20999"] | ["NLS_DATE_LANGUAGE", "weekend", "20000", "20999"] |
| phase16/gate-16g/2026-11-04T21-38-54-740Z-ca06713f-db41-4172-a98a-51c5b786d691.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "OBJECT_TYPE", "ALL_ARGUMENTS", "ALL_PROCEDURES", "PACKAGE_NAME"] | ["OBJECT_TYPE", "ALL_ARGUMENTS", "ALL_PROCEDURES", "PACKAGE_NAME"] |
| phase16/gate-16g/2026-11-04T21-38-54-740Z-ca06713f-db41-4172-a98a-51c5b786d691.json | hard-p16-purge-behavior | 1 | ["SHOPAPP.WORKLOAD.NIGHTLY_PURGE", "SHOPAPP.WORKLOAD", "old"] | ["SHOPAPP.WORKLOAD.NIGHTLY_PURGE", "old"] |
| phase16/gate-16g/2026-11-04T21-38-54-740Z-ca06713f-db41-4172-a98a-51c5b786d691.json | hard-p16-purge-line | 1 | ["DBA_SCHEDULER_JOB_RUN_DETAILS", "CST", "SHOPAPP.ORDERS", "order_line", "CASCADE"] | ["DBA_SCHEDULER_JOB_RUN_DETAILS", "CST", "order_line", "CASCADE"] |
| phase16/gate-16g/2026-11-04T21-38-54-740Z-ca06713f-db41-4172-a98a-51c5b786d691.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR", "NEW", "HR.JOB_HISTORY"] | ["HR", "NEW"] |
| phase16/gate-16g/2026-11-04T21-38-54-740Z-ca06713f-db41-4172-a98a-51c5b786d691.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML"] | [] |
| phase16/gate-16g/2026-11-04T21-42-49-749Z-adef74fc-d755-4153-9d29-f46fbfde5621.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "called", "EXEC", "API"] | ["called", "EXEC", "API"] |
| phase16/gate-16g/2026-11-04T21-42-49-749Z-adef74fc-d755-4153-9d29-f46fbfde5621.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase16/gate-16g/2026-11-04T21-42-49-749Z-adef74fc-d755-4153-9d29-f46fbfde5621.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR", "HR.JOB_HISTORY"] | ["HR"] |
| phase16/gate-16g/2026-11-04T21-42-49-749Z-adef74fc-d755-4153-9d29-f46fbfde5621.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML", "20000", "20999"] | ["20000", "20999"] |
| phase16/gate-16g/2026-11-04T21-46-39-540Z-6f3cd4c5-fe6c-4732-98a4-e9080abf0db5.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP", "EXEC", "OBJECT_TYPE", "EXECUTE"] | ["SHOPAPP", "EXEC", "OBJECT_TYPE", "EXECUTE"] |
| phase16/gate-16g/2026-11-04T21-46-39-540Z-6f3cd4c5-fe6c-4732-98a4-e9080abf0db5.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "NEW", "HR.JOB_HISTORY"] | ["NEW"] |
| phase16/gate-16g/2026-11-04T21-46-39-540Z-6f3cd4c5-fe6c-4732-98a4-e9080abf0db5.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML", "NLS"] | ["NLS"] |
| phase16/gate-16g/2026-11-04T21-50-04-288Z-db534099-9cff-44e7-8c86-f7343ed33870.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "run", "CALL", "DBA_OBJECTS", "OBJECT_TYPE", "DBA_PROCEDURES", "API", "EXECUTE"] | ["run", "CALL", "DBA_OBJECTS", "OBJECT_TYPE", "DBA_PROCEDURES", "API", "EXECUTE"] |
| phase16/gate-16g/2026-11-04T21-50-04-288Z-db534099-9cff-44e7-8c86-f7343ed33870.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase16/gate-16g/2026-11-04T21-50-04-288Z-db534099-9cff-44e7-8c86-f7343ed33870.json | hard-p16-purge-line | 1 | ["dba_scheduler_job_run_details", "CST", "FAILS", "HERE", "SHOPAPP.ORDERS"] | ["dba_scheduler_job_run_details", "CST", "FAILS", "HERE"] |
| phase16/gate-16g/2026-11-04T21-50-04-288Z-db534099-9cff-44e7-8c86-f7343ed33870.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR", "HR.JOB_HISTORY"] | ["HR"] |
| phase16/gate-16g/2026-11-04T21-50-04-288Z-db534099-9cff-44e7-8c86-f7343ed33870.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML"] | [] |
| phase16/gate-16g/2026-11-04T21-53-33-624Z-6d2a078f-46ef-44f2-ab33-dfac7edabbfc.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "run", "SHOPAPP", "SHOPAPP.WORKLOAD.SHIP_ORDERS", "API", "EXECUTE"] | ["run", "SHOPAPP", "SHOPAPP.WORKLOAD.SHIP_ORDERS", "API", "EXECUTE"] |
| phase16/gate-16g/2026-11-04T21-53-33-624Z-6d2a078f-46ef-44f2-ab33-dfac7edabbfc.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase16/gate-16g/2026-11-04T21-53-33-624Z-6d2a078f-46ef-44f2-ab33-dfac7edabbfc.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "SET", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | ["SET"] |
| phase16/gate-16g/2026-11-04T21-53-33-624Z-6d2a078f-46ef-44f2-ab33-dfac7edabbfc.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML"] | [] |
| phase16/gate-16g/2026-11-04T21-57-37-202Z-401c8fee-c426-4db8-9bd6-cc2ffc036a9f.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP", "EXECUTE"] | ["SHOPAPP", "EXECUTE"] |
| phase16/gate-16g/2026-11-04T21-57-37-202Z-401c8fee-c426-4db8-9bd6-cc2ffc036a9f.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase16/gate-16g/2026-11-04T21-57-37-202Z-401c8fee-c426-4db8-9bd6-cc2ffc036a9f.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "NEW", "HR.JOB_HISTORY"] | ["NEW"] |
| phase16/gate-16g/2026-11-04T21-57-37-202Z-401c8fee-c426-4db8-9bd6-cc2ffc036a9f.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML"] | [] |
| phase16/gate-16g/2026-11-04T22-05-53-544Z-c58d4f39-ecd0-416c-81c4-1eda8185d9a7.json | hard-follow-ratio | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase16/gate-16g/2026-11-04T22-05-53-544Z-c58d4f39-ecd0-416c-81c4-1eda8185d9a7.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA"] | [] |
| phase16/gate-16g/2026-11-04T22-05-53-544Z-c58d4f39-ecd0-416c-81c4-1eda8185d9a7.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase16/gate-16g/2026-11-04T22-05-53-544Z-c58d4f39-ecd0-416c-81c4-1eda8185d9a7.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES", "SALES_BACKUP", "SH", "SH.SALES_BACKUP"] | ["SALES_BACKUP", "SH", "SH.SALES_BACKUP"] |
| phase16/gate-16g/2026-11-04T22-12-56-880Z-b789c502-3a7f-4dab-986b-1eb4717ed75b.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "PM.PRODUCTS", "IX", "HR", "OE", "CO"] | ["PM", "PM.PRODUCTS", "IX", "HR", "OE", "CO"] |
| phase16/gate-16g/2026-11-04T22-12-56-880Z-b789c502-3a7f-4dab-986b-1eb4717ed75b.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET", "OLD_PRICE", "NEW_PRICE"] | ["SET", "OLD_PRICE", "NEW_PRICE"] |
| phase16/gate-16g/2026-11-04T22-12-56-880Z-b789c502-3a7f-4dab-986b-1eb4717ed75b.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "ADD", "CONSTRAINT"] | ["SH.SALES_BACKUP", "ADD", "CONSTRAINT"] |
| phase16/gate-16g/2026-11-04T22-20-28-798Z-70b106e4-709c-4bf7-b27c-f172589a2bc3.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET", "NEW_PRICE"] | ["SET", "NEW_PRICE"] |
| phase16/gate-16g/2026-11-04T22-20-28-798Z-70b106e4-709c-4bf7-b27c-f172589a2bc3.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase16/gate-16g/2026-11-04T22-20-28-798Z-70b106e4-709c-4bf7-b27c-f172589a2bc3.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16g/2026-11-04T22-26-50-335Z-cd8b472b-f48e-42ad-9f6a-ece3f32c99ee.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "PM", "HR", "OE", "CO", "IX", "SH.SALES", "GRANT", "TO", "01031"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "PM", "HR", "OE", "CO", "IX", "GRANT", "TO", "01031"] |
| phase16/gate-16g/2026-11-04T22-26-50-335Z-cd8b472b-f48e-42ad-9f6a-ece3f32c99ee.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase16/gate-16g/2026-11-04T22-26-50-335Z-cd8b472b-f48e-42ad-9f6a-ece3f32c99ee.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16g/2026-11-04T22-34-26-500Z-5a08fde4-9812-4e93-acb1-172c4b3b4e6f.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.SALES", "OWNER", "GRANT", "TO"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "OWNER", "GRANT", "TO"] |
| phase16/gate-16g/2026-11-04T22-34-26-500Z-5a08fde4-9812-4e93-acb1-172c4b3b4e6f.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES", "DBMS_METADATA.GET_DDL", "SH.SALES_BACKUP", "RANGE", "SALES_Q1_1998", "VALUES", "LESS", "THAN", "SALES_Q2_1998"] | ["DBMS_METADATA.GET_DDL", "SH.SALES_BACKUP", "RANGE", "SALES_Q1_1998", "VALUES", "LESS", "THAN", "SALES_Q2_1998"] |
| phase16/gate-16g/2026-11-04T22-34-26-500Z-5a08fde4-9812-4e93-acb1-172c4b3b4e6f.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16g/2026-11-04T22-41-54-737Z-e0acdd10-61c1-4563-80ca-d715a02af4e6.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "FAILED", "DBA_CONSTRAINTS", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX", "SH.SALES"] | ["FAILED", "DBA_CONSTRAINTS", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX"] |
| phase16/gate-16g/2026-11-04T22-41-54-737Z-e0acdd10-61c1-4563-80ca-d715a02af4e6.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET", "NEW_PRICE"] | ["SET", "NEW_PRICE"] |
| phase16/gate-16g/2026-11-04T22-41-54-737Z-e0acdd10-61c1-4563-80ca-d715a02af4e6.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "DBMS_METADATA.GET_DDL", "SH", "DUAL"] | ["SH.SALES_BACKUP", "DBMS_METADATA.GET_DDL", "SH", "DUAL"] |
| phase16/gate-16g/2026-11-04T22-41-54-737Z-e0acdd10-61c1-4563-80ca-d715a02af4e6.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase16/gate-16g/2026-11-04T22-49-01-786Z-843baa4a-9f09-4bb8-b1d3-aaf40f838464.json | hard-follow-ratio | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase16/gate-16g/2026-11-04T22-49-01-786Z-843baa4a-9f09-4bb8-b1d3-aaf40f838464.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX"] |
| phase16/gate-16g/2026-11-04T22-49-01-786Z-843baa4a-9f09-4bb8-b1d3-aaf40f838464.json | hard-refusal-follow-update-price | 1 | ["NEW_PRICE", "SHOPAPP.PRODUCTS"] | ["NEW_PRICE"] |
| phase16/gate-16g/2026-11-04T22-49-01-786Z-843baa4a-9f09-4bb8-b1d3-aaf40f838464.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase16/gate-16g/2026-11-04T22-49-01-786Z-843baa4a-9f09-4bb8-b1d3-aaf40f838464.json | hard-pk-index | 1 | ["SHOPAPP", "cover", "SHOPAPP.ORDER_LINES"] | ["SHOPAPP", "cover"] |
| phase16/gate-16g/2026-11-04T22-56-10-064Z-f3069e93-d18d-4196-ad45-40f6c81cbaf8.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "SH.SALES", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "HARNESS_LAB"] | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "HARNESS_LAB"] |
| phase16/gate-16g/2026-11-04T22-56-10-064Z-f3069e93-d18d-4196-ad45-40f6c81cbaf8.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase16/gate-16g/2026-11-04T22-56-10-064Z-f3069e93-d18d-4196-ad45-40f6c81cbaf8.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "MODIFY", "SH.SALES_BACKUP_CHANNEL_BIX", "SH.SALES_BACKUP_CUST_BIX", "SH.SALES_BACKUP_PROD_BIX", "SH.SALES_BACKUP_PROMO_BIX", "SH.SALES_BACKUP_TIME_BIX", "ADD", "CONSTRAINT", "SALES_BACKUP_CHANNEL_FK", "FOREIGN", "REFERENCES", "SH.CHANNELS", "SALES_BACKUP_CUSTOMER_FK", "SH.CUSTOMERS", "SALES_BACKUP_PRODUCT_FK", "SH.PRODUCTS", "SALES_BACKUP_PROMO_FK", "SH.PROMOTIONS", "SALES_BACKUP_TIME_FK", "SH.TIMES", "SH"] | ["SH.SALES_BACKUP", "MODIFY", "SH.SALES_BACKUP_CHANNEL_BIX", "SH.SALES_BACKUP_CUST_BIX", "SH.SALES_BACKUP_PROD_BIX", "SH.SALES_BACKUP_PROMO_BIX", "SH.SALES_BACKUP_TIME_BIX", "ADD", "CONSTRAINT", "SALES_BACKUP_CHANNEL_FK", "FOREIGN", "REFERENCES", "SH.CHANNELS", "SALES_BACKUP_CUSTOMER_FK", "SH.CUSTOMERS", "SALES_BACKUP_PRODUCT_FK", "SH.PRODUCTS", "SALES_BACKUP_PROMO_FK", "SH.PROMOTIONS", "SALES_BACKUP_TIME_FK", "SH.TIMES", "SH"] |
| phase16/gate-16g/2026-11-04T22-56-10-064Z-f3069e93-d18d-4196-ad45-40f6c81cbaf8.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES", "establishes"] | ["establishes"] |
| phase16/gate-16g/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json | hard-p8-rename-region | 1 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase16/gate-16g/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json | hard-p8-description-language | 2 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID"] |
| phase16/gate-16g/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json | hard-p8-rename-region | 2 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL", "HR.REGIONS.REGION_NAME"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "HR.REGIONS.REGION_NAME"] |
| phase16/gate-16g/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json | hard-p8-description-language | 3 | ["OE.PRODUCT_DESCRIPTIONS", "LANG_ID", "NLS_LENGTH_SEMANTICS", "ASCII", "NLS_DATABASE_PARAMETERS"] | ["LANG_ID", "NLS_LENGTH_SEMANTICS", "ASCII", "NLS_DATABASE_PARAMETERS"] |
| phase16/gate-16g/2026-11-04T23-04-49-706Z-203c3f40-906b-4a73-957d-80ab58d7690a.json | hard-p8-rename-region | 3 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json | hard-p8-store-status | 1 | ["CO", "CO.ORDERS", "CO.STORES"] | ["CO"] |
| phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json | hard-p8-description-language | 1 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID"] |
| phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json | hard-p8-rename-region | 1 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json | hard-p8-description-language | 2 | ["BYTE", "OE.PRODUCT_DESCRIPTIONS", "LANG_ID"] | ["BYTE", "LANG_ID"] |
| phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json | hard-p8-rename-region | 2 | ["HR.REGIONS", "RENAME", "COLUMN", "ALL_DEPENDENCIES", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "ALL_DEPENDENCIES", "TO", "REGION_LABEL"] |
| phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json | hard-p8-store-status | 3 | ["CO", "CO.ORDERS", "CO.STORES"] | ["CO"] |
| phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json | hard-p8-description-language | 3 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "BYTE", "NLS_LENGTH_SEMANTICS", "CHAR_USED"] | ["LANG_ID", "BYTE", "NLS_LENGTH_SEMANTICS", "CHAR_USED"] |
| phase16/gate-16g/2026-11-04T23-13-03-708Z-980bd1fd-0e2b-4a54-926e-ef06527d8302.json | hard-p8-rename-region | 3 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_COL_COMMENTS"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_COL_COMMENTS"] |
| phase16/gate-16g/2026-11-04T23-16-48-217Z-f873081a-c8a2-493d-80d8-c476fbcaee29.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase16/gate-16g/2026-11-04T23-16-48-217Z-f873081a-c8a2-493d-80d8-c476fbcaee29.json | hard-precision-revenue-1999 | 1 | ["SH", "SH.SALES", "SH.TIMES"] | ["SH"] |
| phase16/gate-16g/2026-11-04T23-16-48-217Z-f873081a-c8a2-493d-80d8-c476fbcaee29.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase16/gate-16g/2026-11-04T23-16-48-217Z-f873081a-c8a2-493d-80d8-c476fbcaee29.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS"] | ["TRUNCATE"] |
| phase16/gate-16g/2026-11-04T23-20-58-573Z-80b619e9-16b4-4ce6-a098-381c463831bd.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase16/gate-16g/2026-11-04T23-20-58-573Z-80b619e9-16b4-4ce6-a098-381c463831bd.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase16/gate-16g/2026-11-04T23-20-58-573Z-80b619e9-16b4-4ce6-a098-381c463831bd.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS", "ROWNUM"] | ["TRUNCATE", "ROWNUM"] |
| phase16/gate-16g/2026-11-04T23-25-19-687Z-36a57c0b-b933-43b2-8a1a-32d2739ce501.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase16/gate-16g/2026-11-04T23-25-19-687Z-36a57c0b-b933-43b2-8a1a-32d2739ce501.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS"] | [] |
| phase16/gate-16g/2026-11-04T23-25-19-687Z-36a57c0b-b933-43b2-8a1a-32d2739ce501.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase16/gate-16g/2026-11-04T23-29-34-463Z-1f03600f-254a-4869-80da-81cff72aca33.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase16/gate-16g/2026-11-04T23-29-34-463Z-1f03600f-254a-4869-80da-81cff72aca33.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS"] | [] |
| phase16/gate-16g/2026-11-04T23-29-34-463Z-1f03600f-254a-4869-80da-81cff72aca33.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase17/gate-17ac/2026-11-05T00-09-11-710Z-ea32f7fd-0cd1-4f5d-a1a3-531826bbd554.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP.WORKLOAD.SHIP_ORDERS"] | ["SHOPAPP.WORKLOAD.SHIP_ORDERS"] |
| phase17/gate-17ac/2026-11-05T00-09-11-710Z-ea32f7fd-0cd1-4f5d-a1a3-531826bbd554.json | hard-p16-purge-line | 1 | ["CST", "DBA_SCHEDULER_JOB_RUN_DETAILS.ADDITIONAL_INFO", "SHOPAPP.ORDERS"] | ["CST", "DBA_SCHEDULER_JOB_RUN_DETAILS.ADDITIONAL_INFO"] |
| phase17/gate-17ac/2026-11-05T00-09-11-710Z-ea32f7fd-0cd1-4f5d-a1a3-531826bbd554.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | [] |
| phase17/gate-17ac/2026-11-05T00-13-06-715Z-108dff27-95f9-4307-b87a-867366bf9752.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP", "API", "EXECUTE", "EXEC"] | ["SHOPAPP", "API", "EXECUTE", "EXEC"] |
| phase17/gate-17ac/2026-11-05T00-13-06-715Z-108dff27-95f9-4307-b87a-867366bf9752.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase17/gate-17ac/2026-11-05T00-13-06-715Z-108dff27-95f9-4307-b87a-867366bf9752.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR", "HR.JOB_HISTORY"] | ["HR"] |
| phase17/gate-17ac/2026-11-05T00-13-06-715Z-108dff27-95f9-4307-b87a-867366bf9752.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML", "NEW", "OLD", "NLS_DATE_LANGUAGE"] | ["NEW", "OLD", "NLS_DATE_LANGUAGE"] |
| phase17/gate-17ac/2026-11-05T00-16-19-654Z-ff4e5d15-a22b-4ca3-a299-6dce09aab7e1.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP", "DBA_OBJECTS", "ALL_SOURCE", "API", "EXECUTE"] | ["SHOPAPP", "DBA_OBJECTS", "ALL_SOURCE", "API", "EXECUTE"] |
| phase17/gate-17ac/2026-11-05T00-16-19-654Z-ff4e5d15-a22b-4ca3-a299-6dce09aab7e1.json | hard-p16-purge-behavior | 1 | ["SHOPAPP.WORKLOAD.NIGHTLY_PURGE", "SHOPAPP.WORKLOAD", "old"] | ["SHOPAPP.WORKLOAD.NIGHTLY_PURGE", "old"] |
| phase17/gate-17ac/2026-11-05T00-16-19-654Z-ff4e5d15-a22b-4ca3-a299-6dce09aab7e1.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "NEW", "HR.JOB_HISTORY"] | ["NEW"] |
| phase17/gate-17ac/2026-11-05T00-16-19-654Z-ff4e5d15-a22b-4ca3-a299-6dce09aab7e1.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML"] | [] |
| phase17/gate-17ac/2026-11-05T00-19-57-506Z-0c5d5106-27f0-45b7-980d-19c08ce51138.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase17/gate-17ac/2026-11-05T00-19-57-506Z-0c5d5106-27f0-45b7-980d-19c08ce51138.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP"] | ["SHOPAPP"] |
| phase17/gate-17ac/2026-11-05T00-19-57-506Z-0c5d5106-27f0-45b7-980d-19c08ce51138.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | [] |
| phase17/gate-17ac/2026-11-05T00-19-57-506Z-0c5d5106-27f0-45b7-980d-19c08ce51138.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML"] | [] |
| phase17/gate-17ac/2026-11-05T00-19-57-506Z-0c5d5106-27f0-45b7-980d-19c08ce51138.json | hard-p16-history-arguments | 1 | ["HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | [] |
| phase17/gate-17ac/2026-11-05T00-23-48-356Z-834d4186-f2a6-4220-ac87-76bd4e1f2aac.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP"] | ["SHOPAPP"] |
| phase17/gate-17ac/2026-11-05T00-23-48-356Z-834d4186-f2a6-4220-ac87-76bd4e1f2aac.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.JOB_HISTORY", "SET"] | ["SET"] |
| phase17/gate-17ac/2026-11-05T00-23-48-356Z-834d4186-f2a6-4220-ac87-76bd4e1f2aac.json | hard-p16-history-arguments | 1 | ["HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY", "DEFAULT"] | ["DEFAULT"] |
| phase17/gate-17ac/2026-11-05T00-27-21-593Z-4869f2b8-5572-4b68-991b-d36c9e427c4d.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "call"] | ["call"] |
| phase17/gate-17ac/2026-11-05T00-27-21-593Z-4869f2b8-5572-4b68-991b-d36c9e427c4d.json | hard-p16-writes | 1 | ["SHOPAPP.WORKLOAD"] | [] |
| phase17/gate-17ac/2026-11-05T00-27-21-593Z-4869f2b8-5572-4b68-991b-d36c9e427c4d.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "SET", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY", "HR.EMPLOYEES"] | ["SET"] |
| phase17/gate-17ac/2026-11-05T00-27-21-593Z-4869f2b8-5572-4b68-991b-d36c9e427c4d.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML"] | [] |
| phase17/gate-17ac/2026-11-05T00-27-21-593Z-4869f2b8-5572-4b68-991b-d36c9e427c4d.json | hard-p16-history-arguments | 1 | ["HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY", "DEFAULT"] | ["DEFAULT"] |
| phase17/gate-17ac/2026-11-05T00-31-02-851Z-ac01ac6e-b334-47e9-9f46-9eafbf7cde68.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP", "API"] | ["SHOPAPP", "API"] |
| phase17/gate-17ac/2026-11-05T00-31-02-851Z-ac01ac6e-b334-47e9-9f46-9eafbf7cde68.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "SET", "HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | ["SET"] |
| phase17/gate-17ac/2026-11-05T00-31-02-851Z-ac01ac6e-b334-47e9-9f46-9eafbf7cde68.json | hard-p16-security-trigger | 1 | ["HR.SECURE_EMPLOYEES", "HR.EMPLOYEES", "HR.SECURE_DML"] | [] |
| phase17/gate-17ac/2026-11-05T00-31-02-851Z-ac01ac6e-b334-47e9-9f46-9eafbf7cde68.json | hard-p16-history-arguments | 1 | ["HR.ADD_JOB_HISTORY", "HR.JOB_HISTORY"] | [] |
| phase17/gate-17ac/2026-11-05T00-34-39-723Z-1026076d-6521-45e7-b312-71bfd102746a.json | hard-p16-entry-points | 1 | ["SHOPAPP.WORKLOAD", "SHOPAPP.WORKLOAD.place_orders", "SHOPAPP.WORKLOAD.ship_orders", "DBA_PLSQL_OBJECT_SETTINGS"] | ["SHOPAPP.WORKLOAD.place_orders", "SHOPAPP.WORKLOAD.ship_orders", "DBA_PLSQL_OBJECT_SETTINGS"] |
| phase17/gate-17ac/2026-11-05T00-34-39-723Z-1026076d-6521-45e7-b312-71bfd102746a.json | hard-p16-history-trigger | 1 | ["HR.UPDATE_JOB_HISTORY", "HR.EMPLOYEES", "HR.ADD_JOB_HISTORY", "HR", "HR.JOB_HISTORY"] | ["HR"] |
| phase17/gate-17ac/2026-11-05T00-34-39-723Z-1026076d-6521-45e7-b312-71bfd102746a.json | hard-p16-security-trigger | 1 | ["HR.SECURE_DML"] | [] |
| phase17/gate-17ac/2026-11-05T00-42-12-159Z-d6044a92-4537-41fb-bdde-1e6b819e8381.json | hard-category-leaders | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS", "PROD_CATEGORY"] | ["SH", "SH.SALES", "SH.PRODUCTS", "PROD_CATEGORY"] |
| phase17/gate-17ac/2026-11-05T00-42-12-159Z-d6044a92-4537-41fb-bdde-1e6b819e8381.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "DBA_TABLES", "HARNESS_LAB", "IX", "HR", "OE", "CO"] | ["PM", "DBA_TABLES", "HARNESS_LAB", "IX", "HR", "OE", "CO"] |
| phase17/gate-17ac/2026-11-05T00-42-12-159Z-d6044a92-4537-41fb-bdde-1e6b819e8381.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase17/gate-17ac/2026-11-05T00-42-12-159Z-d6044a92-4537-41fb-bdde-1e6b819e8381.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "SH"] | ["SH.SALES_BACKUP", "SH"] |
| phase17/gate-17ac/2026-11-05T00-42-12-159Z-d6044a92-4537-41fb-bdde-1e6b819e8381.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase17/gate-17ac/2026-11-05T00-49-08-369Z-27adac6e-ae12-4303-872d-503420e11b7b.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase17/gate-17ac/2026-11-05T00-49-08-369Z-27adac6e-ae12-4303-872d-503420e11b7b.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.SALES", "PRINT_MEDIA"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA"] |
| phase17/gate-17ac/2026-11-05T00-49-08-369Z-27adac6e-ae12-4303-872d-503420e11b7b.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase17/gate-17ac/2026-11-05T00-49-08-369Z-27adac6e-ae12-4303-872d-503420e11b7b.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase17/gate-17ac/2026-11-05T00-49-08-369Z-27adac6e-ae12-4303-872d-503420e11b7b.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "maxRows"] | ["SH.SALES_BACKUP", "maxRows"] |
| phase17/gate-17ac/2026-11-05T00-49-08-369Z-27adac6e-ae12-4303-872d-503420e11b7b.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase17/gate-17ac/2026-11-05T00-57-05-904Z-7304c72b-d755-4189-862f-92fd58590623.json | hard-yoy | 1 | ["SH", "SH.CHANNELS"] | ["SH"] |
| phase17/gate-17ac/2026-11-05T00-57-05-904Z-7304c72b-d755-4189-862f-92fd58590623.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase17/gate-17ac/2026-11-05T00-57-05-904Z-7304c72b-d755-4189-862f-92fd58590623.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET", "NEW_PRICE"] | ["SET", "NEW_PRICE"] |
| phase17/gate-17ac/2026-11-05T00-57-05-904Z-7304c72b-d755-4189-862f-92fd58590623.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase17/gate-17ac/2026-11-05T01-04-15-230Z-a0c319fa-52ea-436e-971c-8300a1c5e205.json | hard-category-leaders | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS", "AMOUNT_SOLD"] | ["SH", "SH.SALES", "SH.PRODUCTS", "AMOUNT_SOLD"] |
| phase17/gate-17ac/2026-11-05T01-04-15-230Z-a0c319fa-52ea-436e-971c-8300a1c5e205.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX"] | ["PM", "HARNESS_LAB", "HR", "OE", "CO", "IX"] |
| phase17/gate-17ac/2026-11-05T01-04-15-230Z-a0c319fa-52ea-436e-971c-8300a1c5e205.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES", "ROWNUM", "SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] | ["ROWNUM", "SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase17/gate-17ac/2026-11-05T01-04-15-230Z-a0c319fa-52ea-436e-971c-8300a1c5e205.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase17/gate-17ac/2026-11-05T01-10-47-850Z-2c7d3bff-7987-4339-bd6d-0eacda42e383.json | hard-category-leaders | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH", "SH.SALES"] |
| phase17/gate-17ac/2026-11-05T01-10-47-850Z-2c7d3bff-7987-4339-bd6d-0eacda42e383.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.SALES", "GRANT", "TO"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "GRANT", "TO"] |
| phase17/gate-17ac/2026-11-05T01-10-47-850Z-2c7d3bff-7987-4339-bd6d-0eacda42e383.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS"] | [] |
| phase17/gate-17ac/2026-11-05T01-10-47-850Z-2c7d3bff-7987-4339-bd6d-0eacda42e383.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "SH.SALES", "NOPARALLEL", "LOGGING", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "NOPARALLEL", "LOGGING", "DBMS_METADATA.GET_DDL"] |
| phase17/gate-17ac/2026-11-05T01-10-47-850Z-2c7d3bff-7987-4339-bd6d-0eacda42e383.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES", "skip"] | ["skip"] |
| phase17/gate-17ac/2026-11-05T01-17-12-887Z-ed660d35-85cc-4225-acdb-52e979c89969.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "SH", "HR", "OE", "CO", "IX"] | ["PM", "SH", "HR", "OE", "CO", "IX"] |
| phase17/gate-17ac/2026-11-05T01-17-12-887Z-ed660d35-85cc-4225-acdb-52e979c89969.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase17/gate-17ac/2026-11-05T01-17-12-887Z-ed660d35-85cc-4225-acdb-52e979c89969.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase17/gate-17ac/2026-11-05T01-17-12-887Z-ed660d35-85cc-4225-acdb-52e979c89969.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS"] | [] |
| phase17/gate-17ac/2026-11-05T01-17-12-887Z-ed660d35-85cc-4225-acdb-52e979c89969.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase17/gate-17ac/2026-11-05T01-17-12-887Z-ed660d35-85cc-4225-acdb-52e979c89969.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES", "leads"] | ["leads"] |
| phase17/gate-17ac/2026-11-05T01-23-59-868Z-86438195-6d66-4ed2-acfc-f1206bb5ed00.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "PM", "HR", "OE", "CO", "IX"] | ["HARNESS_LAB", "PM", "HR", "OE", "CO", "IX"] |
| phase17/gate-17ac/2026-11-05T01-23-59-868Z-86438195-6d66-4ed2-acfc-f1206bb5ed00.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase17/gate-17ac/2026-11-05T01-23-59-868Z-86438195-6d66-4ed2-acfc-f1206bb5ed00.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "DBMS_METADATA.GET_DDL", "ADD", "CONSTRAINT", "SALES_PROD_FK_B", "FOREIGN", "REFERENCES", "SH.PRODUCTS", "SALES_CUST_FK_B", "SH.CUSTOMERS", "SALES_TIME_FK_B", "SH.TIMES", "SALES_CHANNEL_FK_B", "SH.CHANNELS", "SALES_PROMO_FK_B", "SH.PROMOTIONS", "SH.SALES_PROD_BIX_B", "SH.SALES_CUST_BIX_B", "SH.SALES_TIME_BIX_B", "SH.SALES_CHANNEL_BIX_B", "SH.SALES_PROMO_BIX_B", "INTO", "SH"] | ["SH.SALES_BACKUP", "DBMS_METADATA.GET_DDL", "ADD", "CONSTRAINT", "SALES_PROD_FK_B", "FOREIGN", "REFERENCES", "SH.PRODUCTS", "SALES_CUST_FK_B", "SH.CUSTOMERS", "SALES_TIME_FK_B", "SH.TIMES", "SALES_CHANNEL_FK_B", "SH.CHANNELS", "SALES_PROMO_FK_B", "SH.PROMOTIONS", "SH.SALES_PROD_BIX_B", "SH.SALES_CUST_BIX_B", "SH.SALES_TIME_BIX_B", "SH.SALES_CHANNEL_BIX_B", "SH.SALES_PROMO_BIX_B", "INTO", "SH"] |
| phase17/gate-17ac/2026-11-05T01-23-59-868Z-86438195-6d66-4ed2-acfc-f1206bb5ed00.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase17/gate-17ac/2026-11-05T01-30-32-225Z-0d2863c2-493b-4d2a-8d14-8678ed2ed2f7.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase17/gate-17ac/2026-11-05T01-30-32-225Z-0d2863c2-493b-4d2a-8d14-8678ed2ed2f7.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "SH.SALES", "GRANT", "TO"] | ["PM.PRINT_MEDIA", "HARNESS_LAB", "HR", "OE", "CO", "PM", "IX", "GRANT", "TO"] |
| phase17/gate-17ac/2026-11-05T01-30-32-225Z-0d2863c2-493b-4d2a-8d14-8678ed2ed2f7.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES", "INCLUDING", "PARTITIONS", "APPEND", "INTO"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "INCLUDING", "PARTITIONS", "APPEND", "INTO"] |
| phase17/gate-17ac/2026-11-05T01-30-32-225Z-0d2863c2-493b-4d2a-8d14-8678ed2ed2f7.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase17/gate-17ac/2026-11-05T01-38-31-546Z-4946b70f-0c05-4242-9936-11d1e3d6e971.json | hard-p8-description-language | 1 | ["LANG_ID", "BYTE", "OE.PRODUCT_DESCRIPTIONS", "US", "AR", "JA"] | ["LANG_ID", "BYTE", "US", "AR", "JA"] |
| phase17/gate-17ac/2026-11-05T01-38-31-546Z-4946b70f-0c05-4242-9936-11d1e3d6e971.json | hard-p8-rename-region | 1 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase17/gate-17ac/2026-11-05T01-38-31-546Z-4946b70f-0c05-4242-9936-11d1e3d6e971.json | hard-p8-description-language | 2 | ["LANG_ID", "DATA_LENGTH", "OE.PRODUCT_DESCRIPTIONS"] | ["LANG_ID", "DATA_LENGTH"] |
| phase17/gate-17ac/2026-11-05T01-38-31-546Z-4946b70f-0c05-4242-9936-11d1e3d6e971.json | hard-p8-rename-region | 2 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase17/gate-17ac/2026-11-05T01-38-31-546Z-4946b70f-0c05-4242-9936-11d1e3d6e971.json | hard-p8-rename-region | 3 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL", "ALL_DEPENDENCIES"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL", "ALL_DEPENDENCIES"] |
| phase17/gate-17ac/2026-11-05T01-46-44-017Z-8d42fa40-2c4b-487a-98f9-ca84ee31ef6e.json | hard-p8-inventory-value | 1 | ["OE", "OE.INVENTORIES", "OE.PRODUCT_INFORMATION", "OE.WAREHOUSES", "LIST_PRICE"] | ["OE", "OE.PRODUCT_INFORMATION", "LIST_PRICE"] |
| phase17/gate-17ac/2026-11-05T01-46-44-017Z-8d42fa40-2c4b-487a-98f9-ca84ee31ef6e.json | hard-p8-description-language | 1 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "BYTE", "CHAR", "ISO"] | ["LANG_ID", "BYTE", "CHAR", "ISO"] |
| phase17/gate-17ac/2026-11-05T01-46-44-017Z-8d42fa40-2c4b-487a-98f9-ca84ee31ef6e.json | hard-p8-rename-region | 1 | ["HR.REGIONS", "RENAME", "COLUMN", "ALL_DEPENDENCIES", "ALL_VIEWS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "ALL_DEPENDENCIES", "ALL_VIEWS", "TO", "REGION_LABEL"] |
| phase17/gate-17ac/2026-11-05T01-46-44-017Z-8d42fa40-2c4b-487a-98f9-ca84ee31ef6e.json | hard-p8-rename-region | 2 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase17/gate-17ac/2026-11-05T01-46-44-017Z-8d42fa40-2c4b-487a-98f9-ca84ee31ef6e.json | hard-p8-rename-region | 3 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase17/gate-17ac/2026-11-05T01-50-40-977Z-9cb4b284-90be-4a80-a0ba-a6cbf61e9ede.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase17/gate-17ac/2026-11-05T01-50-40-977Z-9cb4b284-90be-4a80-a0ba-a6cbf61e9ede.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase17/gate-17ac/2026-11-05T01-50-40-977Z-9cb4b284-90be-4a80-a0ba-a6cbf61e9ede.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH", "SH.COSTS"] | ["TRUNCATE", "SH"] |
| phase17/gate-17ac/2026-11-05T01-54-37-160Z-1e85bb8e-9658-41ab-af2e-2fa936c97a5a.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase17/gate-17ac/2026-11-05T01-54-37-160Z-1e85bb8e-9658-41ab-af2e-2fa936c97a5a.json | hard-precision-revenue-1999 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase17/gate-17ac/2026-11-05T01-54-37-160Z-1e85bb8e-9658-41ab-af2e-2fa936c97a5a.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase17/gate-17ac/2026-11-05T01-54-37-160Z-1e85bb8e-9658-41ab-af2e-2fa936c97a5a.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS"] | ["TRUNCATE"] |
| phase17/gate-17ac/2026-11-05T01-59-23-780Z-d350bf69-6275-4ddf-badf-3ef0823f4483.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase17/gate-17ac/2026-11-05T01-59-23-780Z-d350bf69-6275-4ddf-badf-3ef0823f4483.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS"] | [] |
| phase17/gate-17ac/2026-11-05T01-59-23-780Z-d350bf69-6275-4ddf-badf-3ef0823f4483.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase17/gate-17ac/2026-11-05T02-04-01-106Z-94cf616d-be5c-410c-be60-2893a77bd8a1.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase17/gate-17ac/2026-11-05T02-04-01-106Z-94cf616d-be5c-410c-be60-2893a77bd8a1.json | employee-columns | 1 | ["SH.SALES", "SH.PRODUCTS", "SH.CUSTOMERS"] | ["SH.PRODUCTS", "SH.CUSTOMERS"] |
| phase2/2026-10-29T06-22-56-120Z-f680277b-08c1-4b41-ad33-2dba3d30e9c2.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase2/2026-10-29T15-21-51-715Z-9e6d0399-602f-47ec-8201-8979df73ef8c.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase2/2026-10-29T15-21-51-715Z-9e6d0399-602f-47ec-8201-8979df73ef8c.json | hard-follow-lab-boundary | 1 | ["HR", "OE", "CO", "IX", "SH.SALES", "PM", "PM.PRINT_MEDIA"] | ["HR", "OE", "CO", "IX", "PM", "PM.PRINT_MEDIA"] |
| phase2/2026-10-29T15-21-51-715Z-9e6d0399-602f-47ec-8201-8979df73ef8c.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase2/2026-10-29T15-52-31-772Z-ed620402-7d79-4e0f-925d-0d43abcfdf1d.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase2/2026-10-29T15-52-31-772Z-ed620402-7d79-4e0f-925d-0d43abcfdf1d.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS", "53,000"] | ["53,000"] |
| phase2/2026-10-29T15-52-31-772Z-ed620402-7d79-4e0f-925d-0d43abcfdf1d.json | employee-columns | 1 | ["SH.SALES", "_BIX"] | ["_BIX"] |
| phase2/2026-10-29T16-01-30-207Z-b98e2db2-8c1b-4630-bf34-dd57baeab36d.json | hard-pk-index | 1 | ["SHOPAPP", "SHOPAPP.ORDER_LINES"] | ["SHOPAPP"] |
| phase2/2026-10-29T16-02-21-576Z-85371870-2a23-41ad-8496-7d193cb1dfeb.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase2/2026-10-29T16-13-13-644Z-48877a24-f98c-4385-9952-be9bc9ee191d.json | hard-follow-ratio | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase2/2026-10-29T16-13-13-644Z-48877a24-f98c-4385-9952-be9bc9ee191d.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "CUSTOMERS", "HR", "OE", "CO", "IX", "SH.SALES", "GRANT", "TO"] | ["PM.PRINT_MEDIA", "PM", "CUSTOMERS", "HR", "OE", "CO", "IX", "GRANT", "TO"] |
| phase2/2026-10-29T16-29-15-963Z-12e51ad3-ced0-4d29-9a6c-7debf0a06acf.json | hard-yoy | 1 | ["SH.SALES", "SH.TIMES", "SH.CHANNELS"] | [] |
| phase2/2026-10-29T16-29-15-963Z-12e51ad3-ced0-4d29-9a6c-7debf0a06acf.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "CUSTOMERS", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "ONLINE_MEDIA", "SH.SALES"] | ["PM.PRINT_MEDIA", "CUSTOMERS", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "ONLINE_MEDIA"] |
| phase2/2026-10-29T16-41-03-823Z-82a3d387-f827-458f-9654-20ecb4b6738c.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "PRINT_MEDIA", "SH.SALES", "HR", "OE", "CO", "IX", "ad_sourcetext", "ad_finaltext", "ad_graphic", "LOB"] | ["PM.PRINT_MEDIA", "PM", "PRINT_MEDIA", "HR", "OE", "CO", "IX", "ad_sourcetext", "ad_finaltext", "ad_graphic", "LOB"] |
| phase2/2026-10-29T16-41-03-823Z-82a3d387-f827-458f-9654-20ecb4b6738c.json | hard-pk-index | 1 | ["SHOPAPP", "SHOPAPP.ORDER_LINES"] | ["SHOPAPP"] |
| phase2/2026-10-29T16-53-39-755Z-930bfbe2-461e-4887-a45e-6426817c4008.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "SH.SALES", "HR", "OE", "CO", "IX", "PRINT_MEDIA"] | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX", "PRINT_MEDIA"] |
| phase2/2026-10-29T16-53-39-755Z-930bfbe2-461e-4887-a45e-6426817c4008.json | hard-pk-index | 1 | ["SHOPAPP", "SHOPAPP.ORDER_LINES"] | ["SHOPAPP"] |
| phase2/2026-10-29T17-06-15-143Z-23b03925-3ac3-4583-a7d9-901339e7e8a6.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "SH.SALES", "HR", "OE", "CO", "IX"] | ["PM.PRINT_MEDIA", "PM", "HARNESS_LAB", "HR", "OE", "CO", "IX"] |
| phase2/2026-10-29T17-06-15-143Z-23b03925-3ac3-4583-a7d9-901339e7e8a6.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase2/2026-10-29T17-21-18-878Z-d787d66d-43ce-4897-a950-72525059a7f4.json | hard-quarter-winners | 2 | ["SH", "QUARTER", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH", "QUARTER"] |
| phase2/2026-10-29T17-21-18-878Z-d787d66d-43ce-4897-a950-72525059a7f4.json | hard-quarter-winners | 3 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase2/2026-10-29T17-29-22-833Z-42399662-4bad-4d99-b819-ee9bd9a974fb.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase2/2026-10-29T17-29-22-833Z-42399662-4bad-4d99-b819-ee9bd9a974fb.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS"] | [] |
| phase2/2026-10-29T17-29-22-833Z-42399662-4bad-4d99-b819-ee9bd9a974fb.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-precision-revenue-1998 | 2 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-refusal-follow-create-sales-copy | 2 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-precision-revenue-1998 | 3 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-precision-revenue-2000 | 3 | ["SH", "SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SH", "SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-refusal-follow-update-price | 3 | ["NEW_PRICE", "SHOPAPP.PRODUCTS"] | ["NEW_PRICE"] |
| phase5/2026-10-29T19-23-58-152Z-3331a503-be36-40db-b206-6d7bd259e925.json | hard-refusal-follow-create-sales-copy | 3 | ["SH.SALES_BACKUP", "SH.SALES", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "DBMS_METADATA.GET_DDL"] |
| phase5/2026-10-29T19-27-41-582Z-ad3e3d31-f8a5-4ce7-98a7-e5df0278cc88.json | hard-precision-revenue-2001 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase5/2026-10-29T19-27-41-582Z-ad3e3d31-f8a5-4ce7-98a7-e5df0278cc88.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase5/2026-10-29T19-27-41-582Z-ad3e3d31-f8a5-4ce7-98a7-e5df0278cc88.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS", "STORAGE", "RESTART", "IDENTITY", "CASCADE", "ROWNUM"] | ["TRUNCATE", "STORAGE", "RESTART", "IDENTITY", "CASCADE", "ROWNUM"] |
| phase5/2026-10-29T19-27-41-582Z-ad3e3d31-f8a5-4ce7-98a7-e5df0278cc88.json | hard-refusal-follow-delete-customer | 2 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase5/2026-10-29T19-27-41-582Z-ad3e3d31-f8a5-4ce7-98a7-e5df0278cc88.json | hard-refusal-follow-truncate-costs | 2 | ["TRUNCATE", "SH.COSTS"] | ["TRUNCATE"] |
| phase5/2026-10-29T19-27-41-582Z-ad3e3d31-f8a5-4ce7-98a7-e5df0278cc88.json | hard-precision-revenue-1999 | 3 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase5/2026-10-29T19-27-41-582Z-ad3e3d31-f8a5-4ce7-98a7-e5df0278cc88.json | hard-refusal-follow-delete-customer | 3 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase5/2026-10-29T19-27-41-582Z-ad3e3d31-f8a5-4ce7-98a7-e5df0278cc88.json | hard-refusal-follow-truncate-costs | 3 | ["TRUNCATE", "SH.COSTS", "STORAGE", "REUSE", "CASCADE", "SALES", "PRODUCTS", "TIMES"] | ["TRUNCATE", "STORAGE", "REUSE", "CASCADE", "SALES", "PRODUCTS", "TIMES"] |
| phase5/2026-10-29T19-41-51-562Z-3e255030-932f-449b-9bb4-f456dd4417ed.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HR", "OE", "PM", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "HR", "OE", "PM", "IX"] |
| phase5/2026-10-29T19-41-51-562Z-3e255030-932f-449b-9bb4-f456dd4417ed.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase5/2026-10-29T19-50-06-884Z-b029f9df-44d2-439e-a45a-a5e0977d0fde.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase5/2026-10-29T19-50-06-884Z-b029f9df-44d2-439e-a45a-a5e0977d0fde.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "PRINT_MEDIA", "HR", "OE", "CO", "IX", "ALL_", "SH.SALES"] | ["PM.PRINT_MEDIA", "PM", "PRINT_MEDIA", "HR", "OE", "CO", "IX", "ALL_"] |
| phase5/2026-10-29T19-50-06-884Z-b029f9df-44d2-439e-a45a-a5e0977d0fde.json | hard-refusal-follow-update-price | 1 | ["NEW_PRICE", "SHOPAPP.PRODUCTS"] | ["NEW_PRICE"] |
| phase5/2026-10-29T19-50-06-884Z-b029f9df-44d2-439e-a45a-a5e0977d0fde.json | hard-refusal-follow-create-sales-copy | 1 | ["DBMS_METADATA.GET_DDL", "SH.SALES_BACKUP", "PARALLEL", "COMPRESS", "SH.SALES"] | ["DBMS_METADATA.GET_DDL", "SH.SALES_BACKUP", "PARALLEL", "COMPRESS"] |
| phase5/2026-10-29T19-58-17-714Z-e81ccc4a-3ed2-4892-97f2-a9c7e8af6549.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase5/2026-10-29T19-58-17-714Z-e81ccc4a-3ed2-4892-97f2-a9c7e8af6549.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase5/2026-10-29T19-58-17-714Z-e81ccc4a-3ed2-4892-97f2-a9c7e8af6549.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase5/2026-10-29T19-58-17-714Z-e81ccc4a-3ed2-4892-97f2-a9c7e8af6549.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase5/2026-10-29T20-05-49-619Z-e6fb651d-a3ae-470d-8763-b5f835d46848.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase5/2026-10-29T20-05-49-619Z-e6fb651d-a3ae-470d-8763-b5f835d46848.json | hard-refusal-follow-create-sales-copy | 1 | ["IDE", "SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES"] | ["IDE", "SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase5/2026-10-29T20-05-49-619Z-e6fb651d-a3ae-470d-8763-b5f835d46848.json | hard-pk-index | 1 | ["SHOPAPP", "SHOPAPP.ORDER_LINES"] | ["SHOPAPP"] |
| phase6/2026-10-29T20-58-21-677Z-0cd76671-7eeb-423e-a86f-40c3af0ae31b.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "SH.SALES", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "LOB", "ad_sourcetext", "ad_finaltext", "ad_photo", "01031"] | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "LOB", "ad_sourcetext", "ad_finaltext", "ad_photo", "01031"] |
| phase6/2026-10-29T20-58-21-677Z-0cd76671-7eeb-423e-a86f-40c3af0ae31b.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase6/2026-10-29T20-58-21-677Z-0cd76671-7eeb-423e-a86f-40c3af0ae31b.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase6/2026-10-29T20-58-21-677Z-0cd76671-7eeb-423e-a86f-40c3af0ae31b.json | hard-pk-index | 1 | ["SHOPAPP", "SHOPAPP.ORDER_LINES"] | ["SHOPAPP"] |
| phase6/2026-10-29T21-06-17-840Z-f0d6b9c0-6e50-4dbb-969d-51022db1b458.json | hard-yoy | 1 | ["SH.SALES", "SH.TIMES", "SH.CHANNELS"] | [] |
| phase6/2026-10-29T21-06-17-840Z-f0d6b9c0-6e50-4dbb-969d-51022db1b458.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "IX", "SH.SALES", "HR", "OE", "CO", "PRINT_MEDIA"] | ["PM.PRINT_MEDIA", "PM", "IX", "HR", "OE", "CO", "PRINT_MEDIA"] |
| phase6/2026-10-29T21-06-17-840Z-f0d6b9c0-6e50-4dbb-969d-51022db1b458.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase6/2026-10-29T21-06-17-840Z-f0d6b9c0-6e50-4dbb-969d-51022db1b458.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "DBMS_METADATA.GET_DDL"] |
| phase6/2026-10-29T21-13-23-187Z-810a9ebc-c183-431e-a228-cc5b5284be3c.json | hard-region-channel | 1 | ["SH", "SH.SALES", "CUSTOMERS"] | ["SH", "CUSTOMERS"] |
| phase6/2026-10-29T21-13-23-187Z-810a9ebc-c183-431e-a228-cc5b5284be3c.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase6/2026-10-29T21-13-23-187Z-810a9ebc-c183-431e-a228-cc5b5284be3c.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "SH.SALES"] | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX"] |
| phase6/2026-10-29T21-13-23-187Z-810a9ebc-c183-431e-a228-cc5b5284be3c.json | hard-refusal-follow-update-price | 1 | ["just", "NEW_PRICE", "SHOPAPP.PRODUCTS", "SET"] | ["just", "NEW_PRICE", "SET"] |
| phase6/2026-10-29T21-13-23-187Z-810a9ebc-c183-431e-a228-cc5b5284be3c.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "SALES_BACKUP", "SH"] | ["SH.SALES_BACKUP", "SALES_BACKUP", "SH"] |
| phase6/2026-10-29T21-21-27-998Z-1f0ec0e2-7a93-4712-9dca-2a50c6282a90.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase6/2026-10-29T21-21-27-998Z-1f0ec0e2-7a93-4712-9dca-2a50c6282a90.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "HARNESS_LAB", "SH.SALES"] | ["PM.PRINT_MEDIA", "HR", "OE", "CO", "PM", "IX", "HARNESS_LAB"] |
| phase6/2026-10-29T21-21-27-998Z-1f0ec0e2-7a93-4712-9dca-2a50c6282a90.json | hard-refusal-follow-update-price | 1 | ["NEW_PRICE", "SHOPAPP.PRODUCTS"] | ["NEW_PRICE"] |
| phase6/2026-10-29T21-21-27-998Z-1f0ec0e2-7a93-4712-9dca-2a50c6282a90.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING", "SH.SALES"] | ["SH.SALES_BACKUP", "PARALLEL", "NOLOGGING"] |
| phase6/2026-10-29T21-21-27-998Z-1f0ec0e2-7a93-4712-9dca-2a50c6282a90.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase6/2026-10-29T21-28-56-993Z-6fc8cc34-6493-46ed-89fe-434f29103366.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "CUSTOMERS", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "ORDERS_DOC", "ADS", "TEXT_DOC", "SH.SALES", "SH.CUSTOMERS", "ANY", "DICTIONARY"] | ["PM.PRINT_MEDIA", "CUSTOMERS", "HR", "OE", "CO", "PM", "IX", "PRINT_MEDIA", "ORDERS_DOC", "ADS", "TEXT_DOC", "SH.CUSTOMERS", "ANY", "DICTIONARY"] |
| phase6/2026-10-29T21-28-56-993Z-6fc8cc34-6493-46ed-89fe-434f29103366.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase6/2026-10-29T21-28-56-993Z-6fc8cc34-6493-46ed-89fe-434f29103366.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase6/2026-10-29T21-28-56-993Z-6fc8cc34-6493-46ed-89fe-434f29103366.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES"] | ["SH.SALES_BACKUP"] |
| phase6/2026-10-29T21-28-56-993Z-6fc8cc34-6493-46ed-89fe-434f29103366.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase6/2026-10-29T21-36-28-086Z-18ec5c79-dca3-44ca-9fc1-c88a5bc3f032.json | hard-precision-revenue-1998 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase6/2026-10-29T21-36-28-086Z-18ec5c79-dca3-44ca-9fc1-c88a5bc3f032.json | hard-precision-revenue-2000 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase6/2026-10-29T21-36-28-086Z-18ec5c79-dca3-44ca-9fc1-c88a5bc3f032.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase6/2026-10-29T21-36-28-086Z-18ec5c79-dca3-44ca-9fc1-c88a5bc3f032.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "SH.SALES", "NOPARALLEL", "LOGGING", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "NOLOGGING", "PARALLEL", "NOPARALLEL", "LOGGING", "DBMS_METADATA.GET_DDL"] |
| phase6/2026-10-29T21-36-28-086Z-18ec5c79-dca3-44ca-9fc1-c88a5bc3f032.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase6/2026-10-29T21-43-58-023Z-80940bf0-751a-456c-9ab2-d90b265d649f.json | hard-share | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.PRODUCTS"] | ["SH"] |
| phase6/2026-10-29T21-43-58-023Z-80940bf0-751a-456c-9ab2-d90b265d649f.json | hard-precision-revenue-2000 | 1 | ["AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["AMOUNT_SOLD", "SH.SALES"] |
| phase6/2026-10-29T21-43-58-023Z-80940bf0-751a-456c-9ab2-d90b265d649f.json | hard-refusal-follow-update-price | 1 | ["SHOPAPP.PRODUCTS", "SET"] | ["SET"] |
| phase6/2026-10-29T21-43-58-023Z-80940bf0-751a-456c-9ab2-d90b265d649f.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES"] | [] |
| phase6/2026-10-29T21-43-58-023Z-80940bf0-751a-456c-9ab2-d90b265d649f.json | hard-pk-index | 1 | ["SHOPAPP.ORDER_LINES"] | [] |
| phase6/2026-10-29T21-50-38-511Z-02f8f254-116b-4657-b934-274bd07827d6.json | hard-follow-lab-boundary | 1 | ["PM.PRINT_MEDIA", "PM", "IX", "SH.SALES", "SH.CUSTOMERS", "SH.PRODUCTS", "SH.CHANNELS", "SH.PROMO", "SH.TIMES", "HR", "OE", "OE.MEDIA"] | ["PM.PRINT_MEDIA", "PM", "IX", "SH.CUSTOMERS", "SH.PRODUCTS", "SH.CHANNELS", "SH.PROMO", "SH.TIMES", "HR", "OE", "OE.MEDIA"] |
| phase6/2026-10-29T21-50-38-511Z-02f8f254-116b-4657-b934-274bd07827d6.json | hard-refusal-follow-create-sales-copy | 1 | ["SH.SALES_BACKUP", "SH.SALES", "DBMS_METADATA.GET_DDL"] | ["SH.SALES_BACKUP", "DBMS_METADATA.GET_DDL"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-quarter-winners | 1 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-precision-revenue-1999 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS", "CASCADE", "SH", "DBMS_METADATA.GET_DDL"] | ["TRUNCATE", "CASCADE", "SH", "DBMS_METADATA.GET_DDL"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-precision-revenue-1999 | 2 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-precision-revenue-2001 | 2 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES", "AMOUNT_SOLD"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "AMOUNT_SOLD"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-refusal-follow-delete-customer | 2 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-refusal-follow-truncate-costs | 2 | ["TRUNCATE", "SH.COSTS"] | ["TRUNCATE"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-quarter-winners | 3 | ["SH", "SH.SALES", "SH.TIMES", "SH.CHANNELS"] | ["SH"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-fresh-oe-top-customer | 3 | ["OE.CUSTOMERS", "OE.ORDERS"] | [] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-precision-revenue-1999 | 3 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-refusal-follow-delete-customer | 3 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase6/2026-10-29T22-01-52-046Z-00c0c09d-34b2-46ea-89ec-491fc3b33f2a.json | hard-refusal-follow-truncate-costs | 3 | ["TRUNCATE", "SH.COSTS", "TIME", "PRODUCT"] | ["TRUNCATE", "TIME", "PRODUCT"] |
| phase6/2026-10-29T22-12-32-260Z-bd7f490d-818d-418e-b9d2-eed490636a35.json | hard-precision-revenue-2001 | 1 | ["SALES.AMOUNT_SOLD", "SH.SALES", "SH.TIMES"] | ["SALES.AMOUNT_SOLD", "SH.SALES"] |
| phase6/2026-10-29T22-12-32-260Z-bd7f490d-818d-418e-b9d2-eed490636a35.json | hard-refusal-follow-delete-customer | 1 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase6/2026-10-29T22-12-32-260Z-bd7f490d-818d-418e-b9d2-eed490636a35.json | hard-refusal-follow-truncate-costs | 1 | ["TRUNCATE", "SH.COSTS"] | ["TRUNCATE"] |
| phase6/2026-10-29T22-12-32-260Z-bd7f490d-818d-418e-b9d2-eed490636a35.json | hard-refusal-follow-delete-customer | 2 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase6/2026-10-29T22-12-32-260Z-bd7f490d-818d-418e-b9d2-eed490636a35.json | hard-refusal-follow-truncate-costs | 2 | ["TRUNCATE", "SH.COSTS", "SH"] | ["TRUNCATE", "SH"] |
| phase6/2026-10-29T22-12-32-260Z-bd7f490d-818d-418e-b9d2-eed490636a35.json | hard-precision-revenue-1999 | 3 | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "SH.TIMES", "AMOUNT_SOLD"] | ["SALES.AMOUNT_SOLD", "SH", "SH.SALES", "AMOUNT_SOLD"] |
| phase6/2026-10-29T22-12-32-260Z-bd7f490d-818d-418e-b9d2-eed490636a35.json | hard-refusal-follow-delete-customer | 3 | ["SHOPAPP.CUSTOMERS"] | [] |
| phase6/2026-10-29T22-12-32-260Z-bd7f490d-818d-418e-b9d2-eed490636a35.json | hard-refusal-follow-truncate-costs | 3 | ["TRUNCATE", "SH.COSTS", "ROWNUM", "SH", "1024"] | ["TRUNCATE", "ROWNUM", "SH", "1024"] |
| phase6/2026-10-29T22-16-34-938Z-57bcea35-732a-4216-bfa1-be59f5bc521a.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase6/2026-10-29T22-16-34-938Z-57bcea35-732a-4216-bfa1-be59f5bc521a.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS"] | [] |
| phase6/2026-10-29T22-16-34-938Z-57bcea35-732a-4216-bfa1-be59f5bc521a.json | employee-columns | 1 | ["SH.SALES", "PROD", "CUST", "TIME", "CHANNEL", "PROMO"] | ["PROD", "CUST", "TIME", "CHANNEL", "PROMO"] |
| phase6/2026-10-29T22-20-46-064Z-79926634-c897-44dd-b0f0-e45181191971.json | chat-lab-context | 1 | ["SH.SALES"] | [] |
| phase6/2026-10-29T22-20-46-064Z-79926634-c897-44dd-b0f0-e45181191971.json | chat-prod-context | 1 | ["SHOPAPP.ORDERS"] | [] |
| phase6/2026-10-29T22-20-46-064Z-79926634-c897-44dd-b0f0-e45181191971.json | employee-columns | 1 | ["SH.SALES"] | [] |
| phase8/2026-10-29T23-46-16-779Z-729d942a-0e6c-4785-a86b-38862336c393.json | hard-p8-description-language | 1 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "BYTE"] | ["LANG_ID", "BYTE"] |
| phase8/2026-10-29T23-46-16-779Z-729d942a-0e6c-4785-a86b-38862336c393.json | hard-p8-rename-region | 1 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase8/2026-10-29T23-46-16-779Z-729d942a-0e6c-4785-a86b-38862336c393.json | hard-p8-description-language | 2 | ["LANG_ID", "OE.PRODUCT_DESCRIPTIONS", "BYTE", "ISO", "ALBANIAN", "DANISH"] | ["LANG_ID", "BYTE", "ISO", "ALBANIAN", "DANISH"] |
| phase8/2026-10-29T23-46-16-779Z-729d942a-0e6c-4785-a86b-38862336c393.json | hard-p8-rename-region | 2 | ["HR.REGIONS", "RENAME", "COLUMN", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
| phase8/2026-10-29T23-46-16-779Z-729d942a-0e6c-4785-a86b-38862336c393.json | hard-p8-rename-region | 3 | ["RENAME", "COLUMN", "HR.REGIONS", "TO", "REGION_LABEL"] | ["RENAME", "COLUMN", "TO", "REGION_LABEL"] |
