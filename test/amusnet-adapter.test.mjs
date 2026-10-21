import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from '../src/config.mjs';
import {discoverAmusnet,normalizeAmusnetGame,captureAmusnetDemo,dismissAmusnetOverlays} from '../src/amusnet.mjs';
import {capturePublicDemo,discoverCatalogue} from '../src/capture.mjs';
import {executeTicket} from '../src/execute.mjs';

const source={id:'amusnet-official-catalogue',provider:'amusnet',approved:true,verifiedDemo:true,
 enabled:true,indexUrls:['https://amusnet.com/online-casino'],
 gameUrlPrefix:'https://amusnet.com/games/online-casino/',
 gamePathPattern:'^/games/online-casino/[a-z0-9-]+$'};
const config=validateConfig({runId:'amusnet-pilot',providers:[{
 id:'amusnet',enabled:true,approved:true,pacing:{minStartIntervalMs:20000,maxActive:1},
 allowlist:[{origin:'https://amusnet.com',pathPrefix:'/games/online-casino/'}],
 sources:[source],games:[]
}]});
const record=(i,overrides={})=>({type:'node--game',attributes:{
 title:'Demo '+i,path:{alias:'/demo-'+i},field_game_gin:i,
 field__don_t_show_play_demo_butt:false,...overrides}});
test('Amusnet discovery uses approved public JSON:API pages, GINs and excludes disabled demos',async()=>{
 let offsets=[],closed=false;
 const browser={newContext:async()=>({request:{get:async(url)=>{
  const u=new URL(url),offset=Number(u.searchParams.get('page[offset]'));
  assert.equal(u.hostname,'backend.careers-amusnet.com');
  assert.equal(u.searchParams.get('page[limit]'),'50');
  offsets.push(offset);
  const data=offset===0?
   Array.from({length:50},(_,i)=>record(i+1)):
   [record(51),record(52,{field__don_t_show_play_demo_butt:true})];
  return {status:()=>200,json:async()=>({data,meta:{count:52}})};
 }},close:async()=>{closed=true;}})};
 const found=await discoverAmusnet(browser,source,{config,maxPages:2,pauseMs:0});
 assert.equal(found.complete,true);
 assert.deepEqual(offsets,[0,50]);
 assert.equal(found.totalPublished,52);
 assert.equal(found.games.length,51);
 assert.equal(found.games[0].url,'https://amusnet.com/games/online-casino/demo-1');
 assert.equal(found.games[0].gameId,'1');
 assert.ok(closed);
});
test('Amusnet refuses malformed JSON, wrong-origin paths and incomplete scan',async()=>{
 assert.equal(normalizeAmusnetGame(record(10,{field__don_t_show_play_demo_butt:true})),null);
 assert.equal(normalizeAmusnetGame(record(10,{path:{alias:'https://evil.example/'}})),null);
 assert.equal(normalizeAmusnetGame(record(10,{field_game_gin:'../../private'})),null);
 const browser={newContext:async()=>({request:{get:async()=>({status:()=>200,
  json:async()=>({data:Array.from({length:50},(_,i)=>record(i+1)),meta:{count:60}})})},
  close:async()=>{}})};
 await assert.rejects(()=>discoverAmusnet(browser,source,{config,maxPages:1,pauseMs:0}),/incomplete/);
});
test('Amusnet discovery routes verified games as provider-specific D1 catalog tickets',async()=>{
 const browser={newContext:async()=>({request:{get:async()=>({status:()=>200,
  json:async()=>({data:[record(806,{title:'Rise of RA',path:{alias:'/rise-of-ra'}})],
   meta:{count:1}})})},close:async()=>{}})};
 let tickets=[];
 const cloud={enqueue:async(_run,jobs)=>{tickets.push(...jobs);return {inserted:jobs.length}}};
 const engine={discover:{validateDiscoveryTicket:()=>source}};
 const result=await discoverCatalogue(browser,engine,{
  role:'discovery',provider:'amusnet',subject:'amusnet-official-catalogue-123',
  payload:{source}
 },{config,cloud,runId:'amusnet-pilot'});
 assert.equal(result.queued,1);
 assert.deepEqual(tickets[0],{role:'catalog',provider:'amusnet',subject:'806',priority:10,
  payload:{game:{provider:'amusnet',id:'806',url:'https://amusnet.com/games/online-casino/rise-of-ra'}}});
});
function mockPage({age=false,cookies=false}={}){
 let ageVisible=age,cookieVisible=cookies;
 const pageEvents={};
 const origin='https://amusnet.com/games/online-casino/rise-of-ra';
 const frame={
  url:()=> 'https://free-pod.games.amusnet.io/demo?ticket=VERY_SECRET',
  waitForLoadState:async()=>{}
 };
 const locator=kind=>({
  first(){return this;},
  isVisible:async()=>kind==='age'?ageVisible:kind==='cookies'?cookieVisible:true,
  waitFor:async()=>{},
  getByRole(){return locator('confirm');},
  getByText(){return locator('confirm');},
  locator(){return locator('confirm');},
  click:async()=>{
   if(kind==='confirm')ageVisible=false;
   if(kind==='reject')cookieVisible=false;
   if(kind==='play'){
    pageEvents.request?.({url:()=> 'https://amusnet.com/api/lobby',method:()=> 'POST'});
    pageEvents.response?.({url:()=> 'https://amusnet.com/api/lobby',status:()=>200});
   }
  },
  elementHandle:async()=>({contentFrame:async()=>frame}),
  boundingBox:async()=>({x:100,y:100,width:900,height:530}),
  screenshot:async()=>Buffer.alloc(4500,42)
 });
 const page={
  goto:async()=>({status:()=>200}),
  url:()=>origin,
  on:(event,cb)=>{pageEvents[event]=cb;},
  locator:selector=>selector.includes('cookiescript_injected_wrapper')?locator('cookies'):
   selector.includes('age-conf-container')?locator('age'):
   selector.includes('cookiescript_reject')?locator('reject'):
   selector.includes('play-demo-btn')?locator('play'):locator('iframe'),
  waitForLoadState:async()=>{},
 };
 return {page,ageStill:()=>ageVisible};
}
test('Amusnet capture demands age authorization, then records ONLY public iframe host and JPEG',async()=>{
 const {page}=mockPage({age:true}),contexts=[];
 const browser={newContext:async()=>{const ctx={newPage:async()=>page,close:async()=>{}};
  contexts.push(ctx);return ctx;}};
 const job={role:'catalog',provider:'amusnet',subject:'806',payload:{game:{
  provider:'amusnet',id:'806',url:'https://amusnet.com/games/online-casino/rise-of-ra'}}};
 await assert.rejects(()=>capturePublicDemo(browser,{},job,{config,runId:'amusnet-pilot'}),e=>
  e?.code==='ADULT_CONFIRMATION_REQUIRED');
 const result=await capturePublicDemo(browser,{},job,{config,runId:'amusnet-pilot',confirmAdult:true});
 assert.equal(result.info.mode,'visual');
 assert.equal(result.info.adapter,'amusnet-public-demo');
 assert.equal(result.info.metadata.networkDiagnostics.summary.lobbyHttp,200);
 assert.equal(result.info.metadata.networkDiagnostics.summary.iframeHost,'free-pod.games.amusnet.io');
 assert.equal(result.info.metadata.networkDiagnostics.summary.ageConfirmed,true);
 assert.equal(result.info.width,900);
 assert.equal(result.image.length,4500);
 assert.ok(!JSON.stringify(result.info).includes('VERY_SECRET'));
});
test('unapproved adult gate defers D1 job rather than spending a retry',async()=>{
 const job={role:'catalog',provider:'amusnet',subject:'806',id:'j1',leaseToken:'abc'};
 let deferred=0,failed=0;
 const cloud={existingCapture:async()=>null,
  acquire:async()=>({granted:true,leaseId:'session'}),
  renew:async()=>({}),renewSession:async()=>({}),releaseSession:async()=>({}),
  defer:async()=>{deferred++;return {status:'pending'};},
  complete:async()=>{failed++;return {status:'failed'};}};
 const result=await executeTicket({cloud,job,workerId:'gha-1',runId:'amusnet-pilot',
  browser:{},engine:{},config,deadline:Date.now()+600000,
  capture:async()=>{const e=Error('adult');e.code='ADULT_CONFIRMATION_REQUIRED';throw e;}});
 assert.equal(result.status,'deferred');assert.equal(deferred,1);assert.equal(failed,0);
});
