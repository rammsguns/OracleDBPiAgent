import { it, expect } from "vitest";
import { renderMermaid, type PlsqlGraph } from "../../src/plsql/diagram.js";

it("collapses only rendering of Oracle-supplied dependencies without mutating graph JSON", () => {
	const graph: PlsqlGraph = {
		nodes: [
			{ id: "root", kind: "object", label: "SHOPAPP.WORKLOAD" },
			{ id: "sys", kind: "object", label: "SYS.STANDARD" },
			{ id: "public", kind: "object", label: "PUBLIC.DBMS_RANDOM" },
			{ id: "hostile", kind: "object", label: 'SYS.<script>"&$#' },
			{ id: "table", kind: "table", label: "SHOPAPP.ORDERS" },
		],
		edges: ["sys", "public", "hostile", "table"].map(to => ({
			from: "root", to, kind: "depends-on", heuristic: false,
		})),
	};
	const original = structuredClone(graph);
	const mermaid = renderMermaid(graph);
	expect(mermaid).toContain('Oracle-supplied (3)');
	expect(mermaid).not.toContain('["SYS.STANDARD"]');
	expect(mermaid).toContain('href "#" "SYS.STANDARD, PUBLIC.DBMS_RANDOM, SYS._script___$#"');
	expect(mermaid).toContain('SHOPAPP.ORDERS');
	expect(mermaid.match(/depends-on/g)).toHaveLength(2);
	expect(mermaid).not.toContain("<script>");
	expect(graph).toEqual(original);
});
