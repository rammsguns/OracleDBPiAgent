// Broad source matching is intentional: a complete live alternative is harmless
// even when AWR is mentioned incidentally. Ordinary application snapshots do not match.
const packSource = /\b(?:ASH|AWR|ADDM|advisors?|(?:DBA|CDB)_HIST\w*|\w*ACTIVE_SESSION_HISTORY|DBMS_WORKLOAD_REPOSITORY|DBMS_ADVISOR|DBMS_ADDM|awr\w*rpt|ashrpt|addmrpt)\b|\bV\$\s*(?:SYS)?METRIC\w*|\b(?:awr|ash)\w*\.sql\b/i;
const liveAlternative = /\bpiagent\s+top\b|(?:^|[\s`(])\/top\b/i;
const workaround = /\b(?:awr\w*\.sql|ash\w*\.sql|addmrpt(?:\.sql)?|DBMS_WORKLOAD_REPOSITORY(?:\.\w+)?|DBMS_ADVISOR(?:\.\w+)?|DBMS_ADDM(?:\.\w+)?|(?:create|take|generate)\s+(?:an?\s+)?(?:AWR\s+)?snapshot|(?:AWR|ASH|ADDM)\s+reports?)\b/i;

export function needsPackRefusalCorrection(question: string, answer: string): boolean {
	if (!packSource.test(`${question}\n${answer}`)) return false;
	if (!liveAlternative.test(answer)) return true;
	// Do not mistake explicit prohibitions for recommendations. Split at contrast
	// words too, so "cannot query AWR, but run awrrpt.sql" still gets corrected.
	return answer.split(/\n|[.!?](?:\s|$)|\b(?:but|however|instead)\b/i).some(clause =>
		workaround.test(clause) && !/\b(?:no|not|never|cannot|can't|unavailable|unsupported|forbidden|refuse|avoid|don't|do not)\b/i.test(clause));
}
