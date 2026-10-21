import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {verifyStoredCapture} from '../src/capture-integrity.mjs';
const image=Buffer.from([255,216,1,2,255,217]),hash=createHash('sha256').update(image).digest('hex');
const cloud={baseUrl:'https://storage.example',reviewToken:'private-test',call:async()=>({item:{id:'expected',imageSha256:hash,width:10,height:20}})};
test('existing captures require D1 identity and private R2 hash verification',async()=>{
 const r=await verifyStoredCapture(cloud,'expected',{fetcher:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer private-test');return new Response(image);}});
 assert.equal(r.imageSha256,hash);assert.equal(r.bytes,image.length);
});
test('R2 corruption or a different freshly captured JPEG cannot count as stored',async()=>{
 await assert.rejects(verifyStoredCapture(cloud,'expected',{fetcher:async()=>new Response(Buffer.from([255,216,4,5,255,217]))}));
 await assert.rejects(verifyStoredCapture(cloud,'expected',{image:Buffer.from('different'),fetcher:async()=>new Response(image)}));
});
test('an incorrect D1 item identity is rejected before downloading',async()=>{
 await assert.rejects(verifyStoredCapture(cloud,'wrong',{fetcher:async()=>{assert.fail('must not fetch mismatched item');}}));
});
