/** Match file-capacity identifiers in already policy-validated SQL, ignoring prose. */
export function queriesFileMaxbytes(sql: string): boolean {
	const identifiers: string[] = [];
	for (let i = 0; i < sql.length;) {
		const rest = sql.slice(i);
		if (rest.startsWith('--')) {
			const end = sql.indexOf('\n', i);
			i = end < 0 ? sql.length : end;
		} else if (rest.startsWith('/*')) {
			const end = sql.indexOf('*/', i + 2);
			i = end < 0 ? sql.length : end + 2;
		} else if (/^[qQ]'/.test(rest)) {
			const open = sql[i + 2] ?? '';
			const close = ({ '[': ']', '{': '}', '(': ')', '<': '>' } as Record<string, string>)[open] ?? open;
			const end = sql.indexOf(`${close}'`, i + 3);
			i = end < 0 ? sql.length : end + 2;
		} else if (sql[i] === "'" || sql[i] === '"') {
			const quote = sql[i++]!;
			let value = '';
			while (i < sql.length) {
				const c = sql[i++]!;
				if (c === quote) {
					if (sql[i] === quote) { value += quote; i++; }
					else break;
				} else value += c;
			}
			if (quote === '"') identifiers.push(value.toUpperCase());
		} else {
			const word = /^[\p{L}_][\p{L}\p{N}\p{M}_$#]*/u.exec(rest)?.[0];
			if (word) { identifiers.push(word.toUpperCase()); i += word.length; }
			else i++;
		}
	}
	return identifiers.includes('MAXBYTES') && identifiers.some(id => /^(?:DBA|ALL|USER|CDB)_(?:DATA|TEMP)_FILES$/.test(id));
}
