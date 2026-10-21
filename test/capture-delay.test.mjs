import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForGameCapture} from '../src/capture-delay.mjs';
test('3 Oaks waits 35 seconds while other providers keep the 25-second minimum',async()=>{
 const sleeps=[];
 await waitForGameCapture(1000,{provider:'3oaks',waitMs:3500,now:()=>6000,sleepFn:async ms=>sleeps.push(ms)});
 await waitForGameCapture(1000,{provider:'playngo',now:()=>6000,sleepFn:async ms=>sleeps.push(ms)});
 assert.deepEqual(sleeps,[30000,20000]);
});
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

test('Yggdrasil extends the observed loading window to 50 seconds',async()=>{
 const sleeps=[];await waitForGameCapture(1000,{provider:'yggdrasil',now:()=>6000,sleepFn:async ms=>sleeps.push(ms)});assert.deepEqual(sleeps,[45000]);
});
