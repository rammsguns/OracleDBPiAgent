import { updateTableHints } from './tableHints.js';
import { setupPanel, execute } from './panel.js';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; };
const bytes = n => { const units = ['B','KiB','MiB','GiB','TiB','PiB']; let i=0; while(Math.abs(n)>=1024 && i<5) { n/=1024; i++; } return `${Number(n.toFixed(2))} ${units[i]}`; };
const label = k => ({sqlId:'SQL_ID',lobTable:'LOB table.column',sid:'SID'})[k] || k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
function table(parent, rows, name) {
	if (!rows.length) return;
	const keys = [...new Set(rows.flatMap(Object.keys))].filter(k => rows.some(r=>r[k]!=='' && r[k]!=null));
	const box=el('div',undefined,'table-scroll'), t=el('table'), head=el('thead'), tr=el('tr');
	box.tabIndex=0; box.setAttribute('role','region'); box.setAttribute('aria-label',name);
	for(const k of keys) { const th=el('th',label(k)); th.scope='col'; tr.append(th); } head.append(tr); t.append(head);
	const body=el('tbody'); for(const r of rows) { const row=el('tr'); for(const k of keys) row.append(el('td',r[k]==null?'—':/bytes$/i.test(k)?bytes(Number(r[k])):/percent/i.test(k)?`${Number(r[k]).toFixed(2)}%`:r[k])); body.append(row); } t.append(body); box.append(t,el('p','Scroll horizontally to see all columns.','space-scroll-hint')); parent.append(box);
}
export function renderSpace(content, result) {
	content.replaceChildren(el('h3',`Space · ${result.target}`),el('p',`Captured at ${result.capturedAt} (UTC) · ${result.status}`),el('p','Binary units (KiB, MiB, GiB, TiB). Snapshot is a short sequence of queries, not one consistent read.'),el('h4','Findings'));
	if(!result.findings.length) content.append(el('p','No findings in available evidence.'));
	for(const f of result.findings) { const card=el('div',undefined,'space-card'); card.append(el('strong',`${f.severity.toUpperCase()} · ${f.subject}`),el('p',f.detail),el('p',f.advice)); content.append(card); }
	for(const [key,title] of [['tablespaces','Tablespaces'],['segments','Top segments'],['temp','Temp'],['undo','Undo · last 24 h'],['redo','Online redo'],['recovery','Recovery area (FRA)']]) {
		const s=result.sections[key], card=el('section',undefined,'space-card'); card.append(el('h4',title)); content.append(card);
		if(s.status!=='ok' || s.note) card.append(el('p',`${s.status==='ok'?'':s.status+': '}${s.note || 'Evidence unavailable or not requested.'}`));
		for(const e of [s.evidence,...(s.supportingEvidence||[])]) { if(e.truncated) card.append(el('p','Row cap reached; evidence is partial.')); if(e.status==='unavailable') card.append(el('p',`${e.view}: unavailable ${e.attempts?.map(a=>a.code).join(', ')||''}`)); }
		if(key==='redo' && s.logMode) card.append(el('p',`Log mode: ${s.logMode}`));
		if(!s.rows.length) { if(!s.note && s.status==='ok') card.append(el('p','No rows in this snapshot.')); continue; }
		if(key==='tablespaces') {
			const legend=el('p',undefined,'space-legend'); for(const [cls,text] of [['space-used','Used'],['space-free','Allocated free'],['space-expansion','Autoextend capacity']]) { const swatch=el('span',undefined,cls); swatch.setAttribute('aria-hidden','true'); legend.append(swatch,document.createTextNode(text+' ')); } card.append(legend);
			card.append(el('p','Bar scale: autoextend maximum. Thresholds: 85% and 95% of max; fixed files: 85% of allocated.'));
			for(const t of s.rows) {
				const item=el('div',undefined,'space-usage'); item.append(el('strong',`${t.name} · ${t.contents}${t.bigfile?' · Bigfile':''}`));
				const max=Math.max(t.maxBytes,t.allocatedBytes,t.usedBytes,1), used=Math.max(0,t.usedBytes), free=Math.max(0,t.allocatedBytes-used), expansion=Math.max(0,max-t.allocatedBytes);
				const bar=el('div',undefined,'space-bar'); bar.setAttribute('role','img'); bar.setAttribute('aria-label',`${t.name}: used ${bytes(used)}, allocated ${bytes(t.allocatedBytes)}, maximum ${bytes(t.maxBytes)}`);
				for(const [n,cls] of [[used,'space-used'],[free,'space-free'],[expansion,'space-expansion']]) { const part=el('span',undefined,cls); part.style.width=`${n/max*100}%`; bar.append(part); }
				for(const n of [85,95]) { const marker=el('span',undefined,'space-threshold'); marker.style.left=`${n}%`; marker.title=`${n}% of maximum`; bar.append(marker); }
				item.append(bar,el('p',`Used ${bytes(used)} (${t.usedPercentAllocated.toFixed(1)}% of allocated; ${t.usedPercentMax.toFixed(1)}% of max)`, 'space-used-label'),el('p',`Allocated ${bytes(t.allocatedBytes)} · free ${bytes(t.freeBytes)} · Autoextend max ${bytes(t.maxBytes)} · headroom ${bytes(t.headroomBytes)}${t.autoextensible?'':' · Fixed (no autoextend)'}`)); card.append(item);
			}
			table(card,s.rows.flatMap(t=>t.files.map(f=>({tablespace:t.name,...f}))),'Tablespace files');
		} else {
			const kinds=[...new Set(s.rows.map(r=>r.kind))];
			for(const kind of kinds) { if(kind) card.append(el('h5',kind)); table(card,s.rows.filter(r=>r.kind===kind).map(({kind:_,...r})=>r),`${title}${kind?' '+kind:''}`); }
		}
	}
	updateTableHints(content, '.space-scroll-hint');
}
export function initSpace(api, targets) {
	const view=setupPanel('space','Refresh Space',targets); view.form.className='space-toolbar';
	const owner=view.field('input','owner','Segment owner'); owner.placeholder='All application owners'; owner.maxLength=128;
	const top=view.field('input','top','Top N segments'); top.type='number'; top.min='1'; top.max='100'; top.value='20';
	const all=view.field('select','all','Oracle-maintained owners'); for(const [value,text] of [['false','Exclude'],['true','Include']]) {const o=el('option',text);o.value=value;all.append(o);}
	for(const input of [view.target,owner,top,all]) {const field=el('div',undefined,'space-field');field.append(view.form.querySelector(`label[for="${input.id}"]`),input);view.form.append(field);} view.form.append(view.run);
	const download=el('button','Download Markdown');download.id='space-export';download.type='button';download.disabled=true;view.form.append(download);
	let markdown='',generation=0;
	function clear() {generation++;markdown='';download.disabled=true;view.content.replaceChildren();view.status.textContent='';}
	for(const input of [view.target,owner,top,all]) input.addEventListener('change',clear);
	view.form.addEventListener('submit',event=>{event.preventDefault();clear();const current=generation;let result;void execute(view,async()=>{const params=new URLSearchParams({target:view.target.value,top:top.value,includeOracleMaintained:all.value});if(owner.value.trim())params.set('owner',owner.value.trim());const response=await(await api('/api/space?'+params)).json();if(current!==generation)return;result=response.result;markdown=response.markdown;renderSpace(view.content,result);download.disabled=false;}).then(()=>{if(current!==generation)view.status.textContent='';else if(result)view.status.textContent=result.status==='ok'?'Loaded.':'Loaded. Some evidence is unavailable or incomplete.';});});
	download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'})),link=el('a');link.href=url;link.download='space.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
}
