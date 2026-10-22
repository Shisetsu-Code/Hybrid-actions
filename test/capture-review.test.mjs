import test from 'node:test';import assert from 'node:assert/strict';import {reviewedScreenshot,clickReviewPoint} from '../src/capture-review.mjs';
import {createHash} from 'node:crypto';
test('an approval made after a runner stopped recovers the old JPEG, never the new launch image',async()=>{
 const image=Buffer.from('approved-old-image'),hash=createHash('sha256').update(image).digest('hex');let clicks=0;
 const cloud={baseUrl:'https://worker.test',reviewToken:'test-review',call:async()=>({review:{id:'same-batch:p:g:base',revision:2,status:'approved',imageSha256:hash}}),fetcher:async()=>new Response(image)};
 const result=await reviewedScreenshot(async()=>Buffer.from('different-new-image'),cloud,{},{click:async()=>clicks++});
 assert.deepEqual(result.image,image);assert.equal(result.validation.recovered,true);assert.equal(clicks,0);
});
test('GPT repairs an image in the same batch and only returns approval for last screenshot',async()=>{
 let shots=0,clicks=0,stages=0,polls=0;const ids=[];
 const cloud={call:async(path,{body})=>{if(body instanceof FormData){const p=JSON.parse(body.get('metadata'));ids.push(p);stages++;return {review:{id:'same-batch:p:g:base',revision:stages,status:'pending'}};}polls++;return {review:{id:body.id,revision:stages,imageSha256:'hash-'+stages,status:polls===1?'executing':'approved',action:polls===1?{id:'command-1',kind:'click',x:.5,y:.8,waitMs:20}:null}};}};
 const result=await reviewedScreenshot(async()=>Buffer.from('image-'+ ++shots),cloud,{runId:'same-batch',provider:'p',gameId:'g',shotId:'base'},{click:async()=>clicks++,sleepFn:async()=>{}});
 assert.equal(clicks,1);assert.equal(shots,2);assert.equal(result.image.toString(),'image-2');assert.equal(result.validation.sourceImageSha256,'hash-2');assert.equal(ids[0].sessionId,ids[1].sessionId);assert.equal(ids[1].commandId,'command-1');
});
test('lost destructive command delivery stops rather than repeating click',async()=>{
 let clicks=0;const cloud={call:async(path)=>({review:{id:'id',revision:1,status:path.endsWith('/command')?'executing':'pending',action:null}})};
 await assert.rejects(reviewedScreenshot(async()=>Buffer.from('x'),cloud,{},{click:async()=>clicks++}),/uncertain/);assert.equal(clicks,0);
});
test('GPT screenshot coordinates map inside screenshot crop only',async()=>{let point;const page={viewportSize:()=>({width:1000,height:800}),mouse:{click:async(...p)=>point=p}};
 await clickReviewPoint(page,{x:100,y:200,width:600,height:400},{x:.5,y:.75});assert.deepEqual(point,[400,500]);
 await assert.rejects(clickReviewPoint(page,{x:900,y:200,width:600,height:400},{x:.5,y:.75}));
});
