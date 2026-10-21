import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {capturePublicDemo} from '../src/capture.mjs';
import {validateConfig} from '../src/config.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../config/providers.json',import.meta.url)));
const p=raw.providers.find(p=>p.id==='ka_gaming');
const config=validateConfig({runId:raw.runId,providers:[{...p,enabled:true,approved:true,pacing:{minStartIntervalMs:20000,maxActive:1}}]});
const game=p.games[0],job={provider:p.id,subject:game.id,payload:{game:{provider:p.id,...game}}};
test('KA transport closes when context creation fails',async()=>{
 let closed=0;
 await assert.rejects(capturePublicDemo({newContext:async()=>{throw Error('context failure');}}, {},job,
  {config,createKATransport:async()=>({close:()=>closed++})}));
 assert.equal(closed,1);
});
test('KA context and transport close when recorder creation fails',async()=>{
 let transportClosed=0,contextClosed=0;
 await assert.rejects(capturePublicDemo({newContext:async()=>({close:async()=>contextClosed++})},
  {har:{createNetworkRecorder:()=>{throw Error('recorder failure');}}},job,
  {config,createKATransport:async()=>({close:()=>transportClosed++})}));
 assert.equal(transportClosed,1);assert.equal(contextClosed,1);
});
