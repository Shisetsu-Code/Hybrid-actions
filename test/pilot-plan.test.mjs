import test from 'node:test';import assert from 'node:assert/strict';
import {buildPilotPlan,verifiedProviders} from '../src/pilot-plan.mjs';
const provider=id=>({id,enabled:false,approved:false,games:Array.from({length:60},(_,i)=>({id:String(i),url:'https://example.com/'+i})),sources:[{}]});
const raw={runId:'old-run',providers:['bgaming','amusnet','playngo','belatra'].map(provider)};
test('bounded plan selects exactly 50 distinct games and isolates its run',()=>{
 const p=buildPilotPlan(raw,{providers:['bgaming','amusnet','playngo'],limit:50,runId:'batch-50',verifiedOnly:true});
 assert.equal(p.runId,'batch-50');assert.equal(p.providers.length,3);
 for(const x of p.providers){assert.equal(x.games.length,50);assert.equal(x.enabled,true);assert.deepEqual(x.sources,[]);assert.equal(x.pacing.maxActive,1);}
 assert.equal(raw.providers[0].enabled,false);assert.equal(raw.providers[0].games.length,60);
});
test('batch refuses unverified providers, excessive limits and duplicate game identities',()=>{
 assert.equal(verifiedProviders.length,12);assert.ok(!verifiedProviders.includes('belatra'));
 assert.throws(()=>buildPilotPlan(raw,{providers:['belatra'],limit:50,verifiedOnly:true}));
 assert.throws(()=>buildPilotPlan(raw,{providers:['bgaming'],limit:101}));
 const duplicate=structuredClone(raw);duplicate.providers[0].games[1].id='0';
 assert.throws(()=>buildPilotPlan(duplicate,{providers:['bgaming'],limit:50}));
});
test('expanded plan supports 100 verified demos and still rejects insufficient catalogues',()=>{
 const expanded={runId:'same-run',providers:[{...provider('bgaming'),games:Array.from({length:100},(_,i)=>({id:String(i),url:'https://example.com/'+i}))}]};
 assert.equal(buildPilotPlan(expanded,{providers:['bgaming'],limit:100,verifiedOnly:true}).providers[0].games.length,100);
 assert.throws(()=>buildPilotPlan(raw,{providers:['bgaming'],limit:100}));
});
test('two-game pilot keeps its default and can explicitly test Belatra',()=>{
 const p=buildPilotPlan(raw,{providers:['belatra']});assert.equal(p.providers[0].games.length,2);assert.equal(p.runId,'old-run');
});
