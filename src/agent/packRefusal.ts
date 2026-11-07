// Keep forbidden view families shared between question detection and workaround checks.
const packView = String.raw`(?:AWR_(?:CDB|PDB|ROOT)_[\w$#]+|G?V\$\s*(?:[\w$#]*METRIC[\w$#]*|[\w$#]*ACTIVE_SESSION_HISTORY)|(?:DBA|CDB)_HIST[\w$#]*)`;
const tuningAdvisor = String.raw`(?:SQL[ _]+TUNING|(?:SQL[ _]+)?ACCESS)[ _]+ADVISOR`;
const packSource = new RegExp(String.raw`\b(?:ASH|AWR|ADDM|${packView}|\w*ACTIVE_SESSION_HISTORY|DBMS_WORKLOAD_REPOSITORY|DBMS_ADVISOR|DBMS_ADDM|DBMS_SQLTUNE|${tuningAdvisor}|awr\w*rpt|ashrpt|addmrpt)\b|\b(?:awr|ash)\w*\.sql\b`, "i");
const liveAlternative = /\bpiagent\s+top\b|(?:^|[\s`(\[])\/top\b/i;
const workaround = new RegExp(String.raw`\b(?:${packView}|awr\w*\.sql|ash\w*\.sql|addmrpt(?:\.sql)?|DBMS_(?:WORKLOAD_REPOSITORY|ADVISOR|ADDM|SQLTUNE)(?:\.\w+)?|${tuningAdvisor}|(?:create|take|generate)\s+(?:an?\s+)?(?:AWR\s+)?snapshot|(?:AWR|ASH|ADDM)\s+reports?)\b`, "i");

const prohibition = /\b(?:no|not|never|cannot|can't|unavailable|unsupported|forbidden|refuse|avoid|don't|restricted|prohibited|disallowed|blocked|outside\b[^.;!?\n]*\bscope|out\s+of\s+scope)\b/i;
const descriptiveDependency = /\b(?:requires?|rel(?:y|ies)\s+on)\b/i;
const recommendation = new RegExp(String.raw`\b(?:run|execute|call|invoke|use|generate|create|take|try|launch)\b[^.;!?\n]*${workaround.source}`, "i");

export function needsPackRefusalCorrection(question: string, answer: string, successfulCalls: number, refusal: boolean): boolean {
	if (successfulCalls > 0 && !refusal) return false;
	if (!packSource.test(question)) return false;
	if (!liveAlternative.test(answer)) return true;
	// Do not mistake explicit prohibitions for recommendations. Split at contrast
	// and causal words too, so "cannot query AWR, but run awrrpt.sql" still gets corrected.
	return answer.split(/[\n;]|[.!?](?:\s|$)|,\s*so\b|\b(?:so\s+you\s+can|therefore|but|however|instead)\b/i).some(clause =>
		workaround.test(clause) && !prohibition.test(clause)
		&& (!descriptiveDependency.test(clause) || recommendation.test(clause)));
}
