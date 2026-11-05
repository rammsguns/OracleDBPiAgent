import { describe, expect, it } from 'vitest';
import { score } from '../../evals/scoring.js';
import type { EvalCase } from '../../evals/types.js';
const test: EvalCase = {id:'hard-p20-test',target:'p1-19c-prod',category:'security',split:'challenge',question:'test',groundTruth:{sql:'SELECT policy_name AS policy_name, success AS success, failure AS failure FROM policies',mode:'rowCells'},expect:{requiredFacts:[],requiredTools:[],forbiddenClaims:[],mustRefuse:false}};
const result = (answer: string) => ({answer,toolCalls:[],usage:{input:0,output:0}});
describe('WP21B labelled rows',()=>{
	it('groups contiguous named fields and preserves repeated values',()=>{
		expect(score(test,result('- Policy name: P\n- Successes audited: YES\n- Failures audited: YES'),[['P','YES','YES']]).pass).toBe(true);
	});
	it('rejects swapped flags and cells borrowed across blocks',()=>{
		expect(score(test,result('- Policy name: P\n- Successes audited: NO\n- Failures audited: YES'),[['P','YES','NO']]).pass).toBe(false);
		expect(score(test,result('- Policy name: P\n- Successes audited: YES\n\n- Failures audited: NO'),[['P','YES','NO']]).pass).toBe(false);
	});
	it('accepts spaced p18 keys without normalizing other suites',()=>{
		const keyed = {...test,id:'hard-p18-test',groundTruth:{sql:'SELECT problem_key AS problem_key, incident_count AS incident_count FROM incidents',mode:'rowCells' as const}};
		expect(score(keyed,result('- Problem key: ORA 800\n- Incident count: 2'),[['ORA 800',2]]).pass).toBe(true);
		expect(score({...keyed,id:'hard-other'},result('- Problem key: ORA 800\n- Incident count: 2'),[['ORA-00800',2]]).pass).toBe(false);
	});
});
