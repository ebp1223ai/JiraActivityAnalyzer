const assert=require('node:assert/strict');
module.exports=async({page,report,route})=>{
 await route('integrated-results');
 const receipt=await page.evaluate(async()=>{
  const api=window.desktopApp.aiDatabase;
  const core=await api.queryIntegrated({requestId:'v049-core',pageSize:50,visibleFields:['eventTime','action','issueKey','analysisStatus','skillId','computed:["manual","state"]']});
  const heavy=await api.queryIntegrated({requestId:'v049-heavy',pageSize:50,visibleFields:['before']});
  const facets=await api.distinct({requestId:'v049-facet',kind:'integrated',field:'skillId',query:{filters:{}},search:''});
  return {core,heavy,facets};
 });
 assert.equal(receipt.core.ok,true,JSON.stringify(receipt.core));assert.equal(receipt.core.readPath.sidecar,true);assert.equal(receipt.core.readPath.heavyRowsHydrated,0);assert.equal(receipt.heavy.readPath.heavyRowsHydrated,50);assert.equal(receipt.facets.ok,true);
 report.checks.push({name:'production-sidecar-core-page-heavy-page-multiskill-facet',status:'PASS',core:receipt.core.readPath,heavy:receipt.heavy.readPath});
 assert.equal(await page.locator('[data-projection-stale="true"]').count(),0);
};
