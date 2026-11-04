export interface ErrorGuide { code: string; meaning: string; causes: string; checks: string }
const entries: Record<string, [string, string, string]> = {
	'00001': ['Unique constraint violated', 'Duplicate key, sequence misuse, or retry inserting an existing business key.', 'Resolve the constraint and columns; inspect the conflicting key with approved non-secret literals.'],
	'00054': ['Resource busy', 'NOWAIT lock acquisition or lock timeout.', 'Inspect V$SESSION and V$LOCK blockers.'],
	'00060': ['Deadlock detected', 'Competing transactions lock rows in different orders.', 'Inspect current blockers; ask the DBA to review the recorded deadlock trace.'],
	'00904': ['Invalid identifier', 'Misspelled column, alias scope, or schema drift.', 'Compare source identifiers with ALL_TAB_COLUMNS.'],
	'00942': ['Table or view does not exist', 'Missing object, synonym, or direct grant.', 'Inspect objects, synonyms and visible grants.'],
	'01031': ['Insufficient privileges', 'Missing direct grants in definer-rights PL/SQL.', 'Inspect object grants and AUTHID declarations.'],
	'01403': ['No data found', 'SELECT INTO returned no row.', 'Inspect the SELECT predicates and exception handler.'],
	'01422': ['Exact fetch returns more rows than requested', 'SELECT INTO predicates do not identify a unique row.', 'Inspect uniqueness constraints and count matching rows.'],
	'01476': ['Divisor is equal to zero', 'Unchecked arithmetic denominator.', 'Inspect denominator expressions and NULLIF handling.'],
	'01555': ['Snapshot too old', 'Long read needs overwritten undo.', 'Review query duration and visible undo statistics with a DBA.'],
	'01722': ['Invalid number', 'Implicit conversion of nonnumeric text.', 'Inspect column types and explicit conversion predicates.'],
	'02291': ['Integrity constraint violated: parent key not found', 'Child insert/update references an absent parent.', 'Resolve child and parent columns and inspect the referenced key.'],
	'02292': ['Integrity constraint violated: child record found', 'Parent DELETE/UPDATE still has referencing child rows.', 'Resolve all child foreign keys, including tables not cleared by the preceding code.'],
	'04031': ['Unable to allocate shared memory', 'Shared pool pressure or fragmentation.', 'Review V$SGASTAT and current SQL; ask DBA to review memory evidence.'],
	'04068': ['Existing state of packages discarded', 'Stateful package invalidated during a session.', 'Inspect object LAST_DDL_TIME, status, and compile errors.'],
	'04091': ['Table is mutating', 'Row trigger reads its changing table.', 'Inspect trigger source and dependencies.'],
	'06502': ['Numeric or value error', 'Overflow, truncation, or incompatible assignment.', 'Inspect variable sizes, argument types, and frame statement.'],
	'06508': ['Could not find program unit being called', 'Invalid or missing dependency.', 'Inspect invalid objects, dependencies, and compile errors.'],
	'06511': ['Cursor already open', 'Repeated OPEN without CLOSE or error cleanup.', 'Inspect cursor lifecycle at the frame.'],
	'06550': ['PL/SQL compilation error', 'Syntax or name resolution failed.', 'Read accompanying PLS codes and dictionary errors.'],
};
export function errorGuide(code: string): ErrorGuide | undefined {
	let entry = entries[code.replace('ORA-', '')];
	if (/^ORA-20\d{3}$/.test(code)) entry = ['Application-defined error', 'RAISE_APPLICATION_ERROR in stored source or scheduler anonymous job_action.', 'Inspect the raising statement and its guard; the message is application evidence.'];
	if (/^PLS-/.test(code)) entry = ['PL/SQL compiler diagnostic', 'Syntax, declaration, signature, or name resolution mismatch.', 'Inspect compiler line/position, source and argument signatures.'];
	return entry ? { code, meaning: entry[0], causes: entry[1], checks: entry[2] } : undefined;
}
