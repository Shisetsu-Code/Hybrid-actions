import test from 'node:test';import assert from 'node:assert/strict';
import {captureWithRetries,providerAccessDenied} from '../src/capture-retry.mjs';
test('transient capture retries are bounded and respect provider start spacing',async()=>{
 let count=0;const waits=[];
 assert.equal(await captureWithRetries(async()=>{if(++count<3)throw Error('page.goto: Timeout 45000ms exceeded.');return 'image';},{sleep:async ms=>waits.push(ms)}),'image');
 assert.deepEqual(waits,[20000,40000]);assert.equal(count,3);
 count=0;await assert.rejects(captureWithRetries(async()=>{count++;throw Error('public DEMO HTTP 503');},{sleep:async()=>{}}));assert.equal(count,3);
});
test('provider access blocks and unsupported surfaces are never blindly retried',async()=>{
 for(const text of ['Provider DEMO HTTP 403 (access denied)','Provider DEMO HTTP 429 (rate limited)','Tester Spin runtime has no visible game surface']){
  let count=0;await assert.rejects(captureWithRetries(async()=>{count++;throw Error('capture failed',{cause:Error(text)});},{sleep:async()=>assert.fail('unexpected retry')}));assert.equal(count,1);
 }
 assert.equal(providerAccessDenied(Error('wrapper',{cause:Error('Provider DEMO HTTP 403 (access denied)')})),true);
 assert.equal(providerAccessDenied(Error('public DEMO HTTP 403')),true);
 assert.equal(providerAccessDenied(Error('public DEMO HTTP 404')),false);
});
