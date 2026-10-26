import type { TargetConfig } from "../contracts.js";

/** Approved identities, independent of the editable targets file. */
export type ApprovedEndpoint = Pick<TargetConfig, "name" | "host" | "port" | "serviceName" | "username">;
export const APPROVED_TARGETS: readonly Readonly<Omit<TargetConfig, "description">>[] = Object.freeze([
	Object.freeze({ name: "d1-19c-lab", host: "localhost", port: 1522, serviceName: "ORCL", username: "HARNESS_LAB", passwordFile: "d1_lab.pw", defaultSchema: "SH", environment: "development" as const }),
	Object.freeze({ name: "p1-19c-prod", host: "localhost", port: 1523, serviceName: "PRODCDB", username: "HARNESS_RO", passwordFile: "p1_harness_ro.pw", defaultSchema: "SHOPAPP", environment: "production-like" as const }),
]);
export const APPROVED_ENDPOINTS: readonly ApprovedEndpoint[] = APPROVED_TARGETS;
