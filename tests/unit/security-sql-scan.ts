import { parseSync } from 'rolldown/utils';

interface Node { type: string; [key: string]: unknown }
const isNode = (value: unknown): value is Node => !!value && typeof value === 'object' && 'type' in value;
const forbidden = /(?:^|[^A-Z0-9_$#])(?:SPARE4|AUTHENTICATION_TYPE|PASSWORD_VERSIONS|[A-Z0-9_$#]*HASH[A-Z0-9_$#]*|UNIFIED_AUDIT_TRAIL|G?V_?\$SQL_BIND_CAPTURE|VALUE_STRING|USER\$)(?=$|[^A-Z0-9_$#])/;

export function forbiddenSecuritySql(text: string): boolean {
	// Prose is inspected too, but a word such as “password” in advice is not a column.
	// Identifier-only fragments are checked even without SELECT/FROM/JOIN keywords.
	const sql = /\b(?:SELECT|FROM|JOIN)\b/i.test(text);
	let normalized = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
	if (sql) normalized = normalized.replace(/'(?:''|[^'])*'/g, "''");
	normalized = normalized.replace(/"/g, '').replace(/\s+/g, ' ').replace(/\s*\.\s*/g, '.').trim().toUpperCase();
	if (forbidden.test(normalized)) return true;
	return /(?:^|[^A-Z0-9_$#])PASSWORD(?=$|[^A-Z0-9_$#])/.test(normalized)
		&& (sql || /^[A-Z0-9_$#.]+(?:\s+(?:AS\s+)?[A-Z0-9_$#]+)?(?:\s*,\s*[A-Z0-9_$#.]+(?:\s+(?:AS\s+)?[A-Z0-9_$#]+)?)*$/.test(normalized));
}

/** Static test gate only: parse without evaluating or importing the inspected source. */
export function scanSecuritySource(source: string, filename = 'security-scan.ts'): string[] {
	const parsed = parseSync(filename, source);
	if (parsed.errors.length) throw new Error(`Cannot scan ${filename}: ${JSON.stringify(parsed.errors)}`);
	const nodes: Node[] = [];
	function visit(value: unknown): void {
		if (Array.isArray(value)) { value.forEach(visit); return; }
		if (!isNode(value)) return;
		nodes.push(value);
		for (const child of Object.values(value)) visit(child);
	}
	visit(parsed.program);
	// Resolve unambiguous local constants, including constants declared after their use.
	// Repeated/shadowed names are left unresolved; every initializer is still scanned.
	const constants = new Map<string, Node | undefined>();
	for (const node of nodes) if (node.type === 'VariableDeclaration' && node.kind === 'const') {
		for (const declaration of node.declarations as Node[]) {
			const id = declaration.id as Node;
			if (id.type === 'Identifier') {
				const name = String(id.name);
				constants.set(name, constants.has(name) ? undefined : isNode(declaration.init) ? declaration.init : undefined);
			}
		}
	}
	function text(node: Node, seen = new Set<Node>()): string {
		if (seen.has(node)) return '';
		const next = new Set(seen).add(node);
		if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
		if (node.type === 'Identifier') {
			const init = constants.get(String(node.name));
			return init ? text(init, next) : '';
		}
		if (node.type === 'BinaryExpression' && node.operator === '+') return text(node.left as Node, next) + text(node.right as Node, next);
		if (node.type === 'TemplateLiteral') {
			const quasis = node.quasis as Node[], expressions = node.expressions as Node[];
			return quasis.map((q, i) => {
				const value = q.value as { cooked: string | null; raw: string };
				return (value.cooked ?? value.raw) + (expressions[i] ? text(expressions[i]!, next) : '');
			}).join('');
		}
		if (['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(node.type)) return text(node.expression as Node, next);
		return '';
	}
	// No SQL-keyword prefilter: inspect literals/fragments, reconstructed concatenations,
	// and complete templates, including nested interpolation expressions and escapes.
	const strings = nodes.filter(n => n.type === 'Literal' || n.type === 'TemplateLiteral' || n.type === 'BinaryExpression').map(n => text(n));
	for (const node of nodes.filter(n => n.type === 'TemplateElement')) {
		const value = node.value as { cooked: string | null; raw: string };
		strings.push(value.cooked ?? value.raw);
	}
	return [...new Set(strings.filter(forbiddenSecuritySql))];
}
