import { it, expect } from "vitest";
import { layoutGraph, wrapLabel, columnGap } from "../../src/web/static/graphLayout.js";

it("wraps at identifier boundaries and splits only tokens longer than the available width", () => {
	const measure = (text: string) => text.length;
	expect(wrapLabel("NIGHTLY_PURGE_JOB", measure, 17)).toEqual(["NIGHTLY_PURGE_JOB"]);
	expect(wrapLabel("SHOPAPP.NIGHTLY_PURGE_JOB", measure, 14)).toEqual(["SHOPAPP.", "NIGHTLY_PURGE_", "JOB"]);
	expect(wrapLabel("A".repeat(20), measure, 8)).toEqual(["AAAAAAAA", "AAAAAAAA", "AAAA"]);
});

it("uses compact heights, wide gaps and neighbour ordering without changing graph data", () => {
	const graph = {
		nodes: [
			{ id: "a", kind: "job", label: "SHOPAPP.FIRST_JOB" },
			{ id: "b", kind: "job", label: "SHOPAPP.SECOND_JOB" },
			{ id: "d", kind: "table", label: "SHOPAPP.SECOND" },
			{ id: "c", kind: "table", label: "SHOPAPP.FIRST" },
		],
		edges: [{ from: "a", to: "c" }, { from: "b", to: "d" }],
	};
	const original = structuredClone(graph);
	const layout = layoutGraph(graph);
	const a = layout.positions.get("a");
	const b = layout.positions.get("b");
	const c = layout.positions.get("c");
	const d = layout.positions.get("d");
	expect(c.x - a.x - a.width).toBe(columnGap);
	expect(columnGap).toBeGreaterThanOrEqual(110);
	expect(a.height).toBeLessThan(104);
	expect(a.owner).toEqual(["SHOPAPP."]);
	expect(a.lines).toEqual(["FIRST_JOB"]);
	expect((a.y - b.y) * (c.y - d.y)).toBeGreaterThan(0);
	expect(graph).toEqual(original);
});

it("spreads outgoing and incoming edge ports along each box side", () => {
	const graph = {
		nodes: ["a", "b", "c"].map(id => ({ id, kind: "table", label: id })),
		edges: [{ from: "a", to: "b" }, { from: "a", to: "b" }, { from: "a", to: "c" }],
	};
	const layout = layoutGraph(graph);
	expect(new Set(graph.edges.map(edge => layout.outgoing.get(edge))).size).toBe(3);
	expect(layout.incoming.get(graph.edges[0])).not.toBe(layout.incoming.get(graph.edges[1]));
});
