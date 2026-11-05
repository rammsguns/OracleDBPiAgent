import { API } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import type { SourceFile } from 'typescript/unstable/ast';
export * from 'typescript/unstable/ast';

/** TypeScript 7 moved parsing out of the legacy createSourceFile API.
 * Keep the scan's parser entry point local, backed only by the declared compiler.
 * The virtual project never imports or evaluates inspected code, or writes files.
 */
export function createSourceFile(filename: string, source: string): SourceFile {
	const path = '/security-sql-scan/' + filename, config = '/security-sql-scan/tsconfig.json';
	const api = new API({ cwd: '/security-sql-scan', fs: createVirtualFileSystem({
		[path]: source,
		[config]: JSON.stringify({ compilerOptions: { noLib: true, noResolve: true }, files: [filename] }),
	}) });
	try {
		const snapshot = api.updateSnapshot({ openProjects: [config] });
		try {
			const program = snapshot.getProject(config)?.program;
			if (!program) throw new Error(`Cannot scan ${filename}: TypeScript project unavailable`);
			const diagnostics = program.getSyntacticDiagnostics(path);
			if (diagnostics.length) throw new Error(`Cannot scan ${filename}: TypeScript parse errors`);
			const file = program.getSourceFile(path);
			if (!file) throw new Error(`Cannot scan ${filename}: TypeScript source file unavailable`);
			return file;
		} finally { snapshot.dispose(); }
	} finally { api.close(); }
}
