#!/usr/bin/env node
'use strict';
// Synthetic semantic rows, not production SQL. Use the real Raw schema seed adapter in JAA tests.
const rows=Array.from({length:10001},(_,i)=>({id:`stress-${i}`,issue:`FIX-${String(i).padStart(5,'0')}`,actor:i%2?'B':'A',status:i%3?'CLASSIFIED':'EXCLUDED',skills:i%3?['DEBUG_004','DEBUG_004','SYSTEM_003']:[],eventTime:new Date(Date.UTC(2026,8,7,0,0,i)).toISOString(),number:i-1,enabled:i%2===0,...(i===10000?{extension:{lateOnly:'last-10001',nullable:null,literalKeys:{'a.b':'literal-dot','a/b~c':'pointer-escape'}}}:{})}));
console.log(JSON.stringify({synthetic:true,rows,expected:{totalRows:10001,issueDistinct:10001,lookupLastIssue:{value:'FIX-10000',rowIds:['stress-10000']},lookupLateField:{path:['extension','lateOnly'],value:'last-10001',rowIds:['stress-10000']},debugSkillDistinctRowCount:6667,note:'Duplicate DEBUG_004 within a row counts once. Never limit candidates to first10000 or current page.'}},null,2));
