import * as ts from './security-typescript.js';

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
export function securitySourceStrings(source: string, filename = 'security-scan.ts'): string[] {
	const file = ts.createSourceFile(filename, source);
	const nodes: ts.Node[] = [];
	function visit(node: ts.Node): void {
		nodes.push(node);
		node.forEachChild(visit);
	}
	visit(file);
	// Resolve unambiguous local constants, including constants declared after their use.
	// Repeated/shadowed names are left unresolved; every initializer is still scanned.
	const constants = new Map<string, ts.Expression | undefined>();
	for (const node of nodes) if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const)) {
		for (const declaration of node.declarations) if (ts.isIdentifier(declaration.name)) {
			const name = declaration.name.text;
			constants.set(name, constants.has(name) ? undefined : declaration.initializer);
		}
	}
	function text(node: ts.Node, seen = new Set<ts.Node>()): string {
		if (seen.has(node)) return '';
		const next = new Set(seen).add(node);
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
		if (ts.isIdentifier(node)) {
			const init = constants.get(node.text);
			return init ? text(init, next) : '';
		}
		if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return text(node.left, next) + text(node.right, next);
		if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => text(span.expression, next) + span.literal.text).join('');
		if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node) || ts.isTypeAssertion(node)) return text(node.expression, next);
		return '';
	}
	// No SQL-keyword prefilter: inspect literals/fragments, reconstructed concatenations,
	// and complete templates, including nested interpolation expressions and escapes.
	const strings = nodes.filter(n => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n) || ts.isBinaryExpression(n)).map(n => text(n));
	for (const node of nodes) if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) strings.push(node.text);
	return strings;
}

export function scanSecuritySource(source: string, filename = 'security-scan.ts'): string[] {
	return [...new Set(securitySourceStrings(source, filename).filter(forbiddenSecuritySql))];
}
