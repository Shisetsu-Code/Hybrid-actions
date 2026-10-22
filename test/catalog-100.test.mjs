import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPilotPlan} from '../src/pilot-plan.mjs';
import {validateConfig} from '../src/config.mjs';
test('expanded batch preserves previous identities, validates public launch contracts and excludes failed providers',()=>{
 const old=JSON.parse(fs.readFileSync('config/batches/catalog-300-20261021.json'));
 const batch=JSON.parse(fs.readFileSync('config/batches/catalog-100-20261022.json'));
 assert.equal(batch.runId,old.runId);
 assert.equal(batch.providers.length,10);
 assert.equal(batch.providers.reduce((n,p)=>n+p.games.length,0),966);
 assert.ok(!batch.providers.some(p=>['redtiger','amusnet'].includes(p.id)));
 for(const p of batch.providers){
  const previous=old.providers.find(x=>x.id===p.id);
  assert.deepEqual(p.games.slice(0,previous.games.length),previous.games);
  const plan=validateConfig(buildPilotPlan(batch,{providers:[p.id],limit:p.id==='rubyplay'?66:100,verifiedOnly:true}));
  assert.equal(plan.providers[0].games.length,p.games.length);
 }
});
