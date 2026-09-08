const {spawnSync}=require('node:child_process');
// Reuse the unchanged oracles against current source and compiled workers.
for(const file of ['test-v0343-correctness.cjs','test-v0344-correctness.cjs','test-v0344-diagnostics.cjs','test-v0344-faults.cjs']) {
  const result=spawnSync(process.execPath,['scripts/v0345-command.cjs',process.execPath,'scripts/'+file],{stdio:'inherit',windowsHide:true});
  if(result.status!==0) process.exit(result.status||1);
}
