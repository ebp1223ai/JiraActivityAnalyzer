const fs=require('node:fs'),assert=require('node:assert/strict');
const file='reports/JiraActivityAnalyzer_v0.3.44_Execution_Time_Ledger.json';
const ledger=JSON.parse(fs.readFileSync(file));assert.equal(ledger.version,'0.3.44');assert.ok(Number.isFinite(Date.parse(ledger.startedAt)));assert.ok(ledger.wallClockMs>=0);
for(const item of ledger.commands){assert.ok(Array.isArray(item.command)&&item.command.length);assert.ok(Number.isFinite(Date.parse(item.startedAt)));assert.ok(Number.isFinite(Date.parse(item.finishedAt)));assert.ok(item.durationMs>=0);assert.ok(Number.isInteger(item.exitCode)||item.exitCode===null);assert.ok(item.log || item.logUnavailableReason);}
assert.equal(ledger.tokenUsage,null);assert.match(ledger.tokenUsageReason,/UNAVAILABLE/);assert.ok(ledger.readonlyToolCalls);console.log('v0.3.44 execution ledger PASS: '+ledger.commands.length+' command attempts; unavailable metrics explicit');
