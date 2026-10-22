import test from 'node:test';import assert from 'node:assert/strict';import {reviewedScreenshot,clickReviewPoint} from '../src/capture-review.mjs';
test('first pass captures every game without contacting GPT or waiting for a response',async()=>{
 let shots=0;const cloud={call:()=>{throw Error('Must not poll GPT');}};
 for(let i=0;i<10;i++){const result=await reviewedScreenshot(async()=>Buffer.from('image-'+ ++shots),cloud,{});assert.equal(result.reviewOutcome.actionApplied,true);}
 assert.equal(shots,10);
});
test('next run applies saved cleanup path and one new instruction, then closes without waiting',async()=>{
 let shots=0,clicks=0,checks=0;
 const plan={id:'same-batch:p:g:base',imageSha256:'last-image',launchPath:[{imageSha256:'initial-image',action:{kind:'click',x:.5,y:.8,waitMs:20}}],action:{kind:'click',x:.3,y:.7,waitMs:30}};
 const result=await reviewedScreenshot(async()=>Buffer.from('image-'+ ++shots),{}, {},{plan,click:async()=>clicks++,verify:async()=>{checks++;return true;},sleepFn:async()=>{}});
 assert.equal(clicks,2);assert.equal(checks,2);assert.equal(shots,3);assert.equal(result.image.toString(),'image-3');assert.equal(result.reviewOutcome.launchPath.length,2);
});
test('changed reopened screen is returned for GPT instead of clicking stale coordinates',async()=>{
 let clicks=0;const result=await reviewedScreenshot(async()=>Buffer.from('new-screen'),{}, {},{plan:{id:'same-game',launchPath:[],imageSha256:'old',action:{kind:'click',x:.5,y:.5,waitMs:0}},click:async()=>clicks++,verify:async()=>false});
 assert.equal(result.reviewOutcome.actionApplied,false);assert.equal(clicks,0);assert.equal(result.image.toString(),'new-screen');
});
test('GPT screenshot coordinates map inside screenshot crop only',async()=>{let point;const page={viewportSize:()=>({width:1000,height:800}),mouse:{click:async(...p)=>point=p}};
 await clickReviewPoint(page,{x:100,y:200,width:600,height:400},{x:.5,y:.75});assert.deepEqual(point,[400,500]);
 await assert.rejects(clickReviewPoint(page,{x:900,y:200,width:600,height:400},{x:.5,y:.75}));
});
