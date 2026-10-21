import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildPilotPlan,verifiedProviders} from '../src/pilot-plan.mjs';import {validateConfig} from '../src/config.mjs';
test('frozen batch contains 600 unique approved DEMO identities from refreshed provider configuration',()=>{
 const batch=JSON.parse(fs.readFileSync(new URL('../config/batches/verified-50-20261021.json',import.meta.url)));
 const source=JSON.parse(fs.readFileSync(new URL('../config/providers.json',import.meta.url)));
 const plan=validateConfig(buildPilotPlan(batch,{providers:verifiedProviders,limit:50,verifiedOnly:true}));
 assert.equal(plan.providers.length,12);assert.equal(plan.providers.reduce((n,p)=>n+p.games.length,0),600);
 for(const p of plan.providers){
  const original=source.providers.find(x=>x.id===p.id);
  for(const g of p.games){const fromSource=original.games.find(x=>x.id===g.id);assert.ok(fromSource,p.id+'/'+g.id);assert.equal(fromSource.url,g.url);}
  assert.deepEqual(p.sources,[]);assert.equal(p.pacing.maxActive,1);
 }
 assert.ok(batch.providers.every(p=>p.enabled===false),'batch never silently changes operational approval');
});
