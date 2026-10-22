import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {capturePublicDemo} from '../src/capture.mjs';
import {clearCaptureCookies,clickCaptureIntro} from '../src/capture-cleanup.mjs';

test('cookie cleanup runs again when a banner reappears, including child frames',async()=>{
 let visible=true,clicks=0;const empty={first(){return this;},count:async()=>0,isVisible:async()=>false};
 const frame={locator:selector=>selector==='#onetrust-reject-all-handler:visible'?{first(){return this;},count:async()=>visible?1:0,isVisible:async()=>visible,click:async()=>{visible=false;clicks++;}}:empty,getByRole:()=>empty};
 const page={frames:()=>[frame]};
 await clearCaptureCookies(page);visible=true;await clearCaptureCookies(page);assert.equal(clicks,2);
});
test('intro coordinates map from screenshot into the current visible game box',async()=>{
 const points=[];const page={viewportSize:()=>({width:1200,height:800}),mouse:{click:async(x,y)=>points.push([x,y])}};
 const action={kind:'intro',text:'click to continue',rect:[.2,.6,.4,.1]};
 await clickCaptureIntro(page,{x:100,y:50,width:800,height:600},action);assert.deepEqual(points,[[420,440]]);
 await assert.rejects(clickCaptureIntro(page,{x:100,y:50,width:800,height:600},{...action,text:'buy free spins'}),/unverified/);
 assert.equal(points.length,1);
});
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
