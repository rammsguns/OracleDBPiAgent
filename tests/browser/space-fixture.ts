import type { SpaceReport } from '../../src/space/index.js';
export function spaceFixture(): SpaceReport {
	const evidence={label:'fixture',sql:'private-sql',binds:{owner:'private-bind'},view:'DBA_DATA_FILES',status:'ok' as const,columns:[],rows:[],truncated:false,attempts:[]};
	const section=() => ({status:'ok' as const,rows:[],evidence,supportingEvidence:[]});
	return {target:'d1-19c-lab',capturedAt:'2026-11-06T12:00:00.000Z',status:'ok',findings:[{id:'capacity',severity:'medium',subject:'Capacity',detail:'Review capacity',advice:'For a human DBA: review storage.'}],sections:{
		tablespaces:{...section(),rows:[{name:'<img src=x onerror=alert(1)>',contents:'PERMANENT',bigfile:true,fileCount:1,files:[{path:'/a/very/long/path/'+ 'x'.repeat(200),bytes:1024,maxBytes:2048,autoextensible:true}],allocatedBytes:1024,usedBytes:900,freeBytes:124,maxBytes:2048,headroomBytes:1148,usedPercentAllocated:87.89,usedPercentMax:43.95,autoextensible:true}]},
		segments:{...section(),rows:[{owner:'APP',name:'ORDERS',type:'LOBSEGMENT',bytes:900,lobTable:'APP.ORDERS.DOCUMENT'},{owner:'OTHER',name:'OTHER_TABLE',bytes:50}]},
		temp:{...section(),rows:[{kind:'Consumer',sid:10,username:'APP',sqlId:'0123456789abc',bytes:1024}]},
		undo:{...section(),rows:[{kind:'Last 24 h',snapshotTooOldCount:0,noSpaceCount:0,retentionSeconds:900}]},
		redo:{...section(),logMode:'NOARCHIVELOG',rows:[{kind:'Member',group:1,path:'/redo/'+ 'y'.repeat(200),status:'',type:'ONLINE'}]},
		recovery:{...section(),note:'no recovery area configured'},
	}};
}
