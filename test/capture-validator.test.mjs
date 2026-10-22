import test from 'node:test';import assert from 'node:assert/strict';
import {validatedScreenshot,validateCapturedImage} from '../src/capture-validator.mjs';
import {CloudClient} from '../src/client.mjs';
import {executeTicket} from '../src/execute.mjs';
test('regular catalogue tickets validate loading-to-ready inside their capture context',async()=>{
 let images=0,uploaded=0;
 const cloud={existingCapture:async()=>null,acquire:async()=>({granted:true,leaseId:'lease'}),renew:async()=>{},renewSession:async()=>{},releaseSession:async()=>{},complete:async()=>({status:'done'}),uploadCapture:async()=>{uploaded++;return {id:'saved'};}};
 const result=await executeTicket({cloud,job:{role:'catalog',id:'job',provider:'p',subject:'g'},workerId:'worker',runId:'r',deadline:Date.now()+600000,
  validateCapture:async()=>({status:images===1?'loading':'ready',reasons:[]}),
  capture:async(_browser,_engine,_job,options)=>{
   const shot=await validatedScreenshot(async()=>Buffer.from([++images]),options.validateScreenshot,{sleep:async()=>{}});
   return {image:shot.image,info:{runId:'r',provider:'p',gameId:'g',mode:'visual',metadata:{captureValidation:shot.validation}}};
  }});
 assert.equal(result.status,'done');assert.equal(images,2);assert.equal(uploaded,1);
});
test('a blocked capture never reaches the classification ingest endpoint',async()=>{
 let requests=0;const cloud=new CloudClient({baseUrl:'https://worker.example',reviewToken:'review',ingestToken:'ingest',fetcher:async()=>{requests++;throw Error('unexpected ingest');},captureValidator:async()=>({status:'blocked',reasons:['blocked-screen'],reportId:'proof'})});
 await assert.rejects(cloud.uploadCapture({runId:'run',provider:'one',gameId:'two'},Buffer.from([255,216,255,217])),/CAPTURE_NOT_READY blocked/);assert.equal(requests,0);
});
test('loading waits inside the existing game context, with a bounded screenshot count',async()=>{
 let snapshots=0;const waits=[];
 const result=await validatedScreenshot(async()=>Buffer.from([++snapshots]),async()=>({status:snapshots<3?'loading':'ready',reasons:[]}),{sleep:async ms=>waits.push(ms)});
 assert.equal(result.image[0],3);assert.deepEqual(waits,[8000,8000]);
 snapshots=0;await assert.rejects(validatedScreenshot(async()=>{snapshots++;return Buffer.from([1]);},async()=>({status:'loading',reasons:[]}),{sleep:async()=>{}}),/CAPTURE_NOT_READY/);assert.equal(snapshots,3);
});
test('uncertain OCR results remain rejected and validators bind evidence to the exact image',async()=>{
 const report=await validateCapturedImage(null,{runId:'r',provider:'p',gameId:'g'},Buffer.from('image'),{reference:null,store:false,analyze:async()=>{throw Error('OCR unavailable');}});
 assert.equal(report.status,'uncertain');assert.deepEqual(report.reasons,['validator-unavailable']);assert.match(report.sourceImageSha256,/^[a-f0-9]{64}$/);
});
