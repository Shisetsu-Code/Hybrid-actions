import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForGameCapture} from '../src/capture-delay.mjs';
test('capture waits until 25 seconds after game launch even with a legacy short delay',async()=>{
 const sleeps=[];
 await waitForGameCapture(1000,{waitMs:3500,now:()=>6000,sleepFn:async ms=>sleeps.push(ms)});
 assert.deepEqual(sleeps,[20000]);
});
test('loading work counts toward elapsed time and longer configured waits remain supported',async()=>{
 const sleeps=[];
 await waitForGameCapture(1000,{now:()=>27000,sleepFn:async ms=>sleeps.push(ms)});
 assert.deepEqual(sleeps,[]);
 await waitForGameCapture(1000,{waitMs:45000,now:()=>27000,sleepFn:async ms=>sleeps.push(ms)});
 assert.deepEqual(sleeps,[19000]);
});
