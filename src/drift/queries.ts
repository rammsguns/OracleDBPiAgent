import { SQL as backupSql } from '../backup/index.js';
export interface DriftQuery { name: string; source: string; sql: string; keys: number; grouped?: boolean }
const owner = ' WHERE owner = :owner';
const ordered = (sql: string, order: string) => `${sql} ORDER BY ${order}`;
export const parameterQuery: DriftQuery = { name: 'parameters', source: 'SYS.V_$PARAMETER', keys: 1, sql: "SELECT name, value FROM v$parameter WHERE isdefault = 'FALSE' ORDER BY name" };
export const objectQueries: DriftQuery[] = [
	{ name: 'objects', source: 'SYS.ALL_OBJECTS', keys: 3, sql: ordered('SELECT object_type, object_name, subobject_name, status FROM all_objects' + owner, 'object_type, object_name, subobject_name') },
	{ name: 'object_counts', source: 'SYS.ALL_OBJECTS', keys: 1, sql: 'SELECT object_type, COUNT(*) FROM all_objects' + owner + ' GROUP BY object_type ORDER BY object_type' },
	{ name: 'invalid_objects', source: 'SYS.ALL_OBJECTS', keys: 3, sql: ordered("SELECT object_type, object_name, subobject_name FROM all_objects" + owner + " AND status <> 'VALID'", 'object_type, object_name, subobject_name') },
];
export const schemaQueries: DriftQuery[] = [
	{ name: 'tables', source: 'SYS.ALL_TABLES', keys: 1, sql: ordered('SELECT table_name, temporary, partitioned, iot_type FROM all_tables' + owner, 'table_name') },
	{ name: 'columns', source: 'SYS.ALL_TAB_COLUMNS', keys: 2, sql: ordered('SELECT table_name, column_name, column_id, data_type, data_type_owner, data_length, data_precision, data_scale, char_used, char_length, nullable FROM all_tab_columns' + owner, 'table_name, column_id') },
	{ name: 'constraints', source: 'SYS.ALL_CONSTRAINTS, SYS.ALL_CONS_COLUMNS', keys: 2, grouped: true, sql: `SELECT c.table_name, c.constraint_name, c.generated, c.constraint_type, c.status, c.validated, c.deferrable, c.deferred, c.delete_rule, c.r_owner, r.table_name, rc.column_name, c.search_condition_vc, cc.position, cc.column_name
FROM all_constraints c LEFT JOIN all_cons_columns cc ON cc.owner=c.owner AND cc.constraint_name=c.constraint_name
LEFT JOIN all_constraints r ON r.owner=c.r_owner AND r.constraint_name=c.r_constraint_name
LEFT JOIN all_cons_columns rc ON rc.owner=r.owner AND rc.constraint_name=r.constraint_name AND rc.position=cc.position
WHERE c.owner=:owner ORDER BY c.table_name, c.constraint_name, cc.position` },
	{ name: 'indexes', source: 'SYS.ALL_INDEXES, SYS.ALL_IND_COLUMNS, SYS.ALL_IND_EXPRESSIONS', keys: 2, grouped: true, sql: `SELECT i.table_name, i.index_name, CASE WHEN REGEXP_LIKE(i.index_name, '^SYS_C[0-9]+$') THEN 'GENERATED NAME' ELSE 'USER NAME' END, i.uniqueness, i.status, i.index_type, i.visibility, ic.column_position, ic.column_name, ic.descend, ie.column_expression
FROM all_indexes i LEFT JOIN all_ind_columns ic ON ic.index_owner=i.owner AND ic.index_name=i.index_name
LEFT JOIN all_ind_expressions ie ON ie.index_owner=ic.index_owner AND ie.index_name=ic.index_name AND ie.column_position=ic.column_position
WHERE i.table_owner=:owner ORDER BY i.table_name, i.index_name, ic.column_position` },
	...objectQueries.filter(q => q.name !== 'objects'),
];

/** Configuration only: no backup history, file paths, timestamps or workload counters. */
export const backupQueries: DriftQuery[] = [
	{ name: 'rman_configuration', source: 'SYS.V_$RMAN_CONFIGURATION', keys: 1, sql: backupSql.configuration },
	{ name: 'log_mode', source: 'SYS.V_$DATABASE', keys: 1, sql: "SELECT 'LOG_MODE' NAME, LOG_MODE FROM V$DATABASE" },
];
