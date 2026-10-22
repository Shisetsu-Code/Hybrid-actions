import test from 'node:test';import assert from 'node:assert/strict';
import {eligibleEntry,probeIntro} from '../src/laya-intro-probe.mjs';
const block={text:'PRESS ANYWHERE TO START',rect:[.3,.8,.4,.05],role:'entry',confidence:.9,entryProbability:.9,wagerProbability:.05,truncated:false};
test('a Laya mistake cannot turn spins, purchases, stake selection or cookies into entry clicks',()=>{
 assert.ok(eligibleEntry(block));
 for(const text of ['SPIN','Iniciar giro automático','Confirmar compra','APUESTA 0,20','Reject all cookies','BUY FREE SPINS'])assert.equal(eligibleEntry({...block,text}),null);
 assert.equal(eligibleEntry({...block,wagerProbability:.4}),null);assert.equal(eligibleEntry({...block,truncated:true}),null);
});
test('entry-only test records before and after without requiring balance or certifying readiness',async()=>{
 let snapshots=0,clicks=0;const saved=[];
 const result=await probeIntro(async()=>Buffer.from([++snapshots]),async()=>({blocks:snapshots===1?[block]:[],visualHash:String(snapshots)}),{advanceIntro:async()=>clicks++,save:async(image,step)=>{saved.push([image[0],step]);return 'report-'+step;},sleep:async()=>{}});
 assert.equal(clicks,1);assert.deepEqual(saved,[[1,0],[2,1]]);assert.equal(result.probe.outcome,'intro-no-longer-detected');assert.equal(result.probe.gameReadyVerified,false);
});
test('same screen is never clicked twice and model failures retain the original observation',async()=>{
 let clicks=0;
 const result=await probeIntro(async()=>Buffer.from([1]),async()=>({blocks:[block],visualHash:'unchanged'}),{advanceIntro:async()=>clicks++,save:async()=> 'proof',sleep:async()=>{}});
 assert.equal(clicks,1);assert.equal(result.probe.outcome,'intro-still-visible');
 const failed=await probeIntro(async()=>Buffer.from([1]),async()=>{throw Error('model down');},{save:async()=> 'before-error'});
 assert.equal(failed.probe.observations[0].reportId,'before-error');assert.equal(failed.probe.outcome,'laya-analysis-failed');
});
