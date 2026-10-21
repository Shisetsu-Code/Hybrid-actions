import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverPlayngo,officialMobileLauncher,capturePlayngoMobile} from '../src/playngo.mjs';
import {discoverCatalogue,capturePublicDemo} from '../src/capture.mjs';
import {validateConfig} from '../src/config.mjs';

const source={id:'playngo-public',provider:'playngo',approved:true,enabled:true,verifiedDemo:true,
 indexUrls:['https://www.playngo.com/games'],gameUrlPrefix:'https://www.playngo.com/games/',
 gamePathPattern:'^/games/.*$'};
const config=validateConfig({runId:'playngo-pilot',providers:[{
 id:'playngo',enabled:true,approved:true,pacing:{minStartIntervalMs:20000,maxActive:1},
 allowlist:[{origin:'https://www.playngo.com',pathPrefix:'/games/'}],sources:[source],games:[]
}]});
const launcher='https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=amuletofdead&lang=en_GB&practice=1&channel=desktop&demo=2';
const mockHtml='<html><script>self.__next_f.push(["x",{"mobileUrl":"'+launcher.replace('channel=desktop','channel=mobile')+'"}]);</script></html>';
test('extract mobile launcher from official game detail, preserving GID instead of slug guessing',()=>{
 const out=officialMobileLauncher(mockHtml);
 assert.equal(out.hostname,'released.playngonetwork.com');
 assert.equal(out.searchParams.get('gid'),'amuletofdead');
 assert.equal(out.searchParams.get('channel'),'mobile');
 assert.equal(out.searchParams.get('practice'),'1');
 assert.throws(()=>officialMobileLauncher('<script>{"mobileUrl":"https://evil.example/casino/ContainerLauncher?pid=2&gid=amuletofdead&practice=1&demo=2"}</script>'),/unapproved|unexpected/);
 assert.throws(()=>officialMobileLauncher(mockHtml.replace('&demo=2','&ticket=supersecret&demo=2')),/sensitive|unexpected/);
 assert.throws(()=>officialMobileLauncher(mockHtml.replace('&practice=1','&practice=0')),/practice demo/);
 assert.throws(()=>officialMobileLauncher('<html>no launcher</html>'),/absent/);
});
test('discover paginates all game pages and deduplicates SKU despite apostrophes in slugs',async()=>{
 const calls=[];
 const browser={newContext:async()=>({request:{get:async url=>{
  const o=new URL(url),offset=Number(o.searchParams.get('offset'));
  calls.push(offset);
  const payload=offset===0?{games:[
   {sku:'123',slug:"wrappin'-gold"},{sku:'456',slug:'amazing-demo'}
  ],nextOffset:2}:{games:[
   {sku:'123',slug:"wrappin'-gold"},{sku:'789',slug:'last-demo'}
  ],nextOffset:null};
  return {status:()=>200,json:async()=>payload};
 }},close:async()=>{}})};
 const output=await discoverPlayngo(browser,source,{config,maxPages:2,pauseMs:0});
 assert.equal(output.complete,true);
 assert.deepEqual(calls,[0,2]);
 assert.deepEqual(output.games.map(g=>g.gameId),['123','456','789']);
 assert.ok(output.games[0].url.includes("wrappin'-gold"));
});
test('discovery rejects incomplete pagination and does not declare catalog complete',async()=>{
 const browser={newContext:async()=>({request:{get:async()=>({status:()=>200,
  json:async()=>({games:[{sku:'12',slug:'demo'}],nextOffset:24})})},close:async()=>{}})};
 await assert.rejects(()=>discoverPlayngo(browser,source,{config,maxPages:1,pauseMs:0}),/incomplete/);
});
test('shared discovery writes provider-correct unique SKU tickets to D1',async()=>{
 let queued=[];const cloud={enqueue:async(_run,batch)=>{queued.push(...batch);return {inserted:batch.length}}};
 const browser={newContext:async()=>({request:{get:async()=>({status:()=>200,
  json:async()=>({games:[{sku:'1073',slug:'unigoat'}],nextOffset:null})})},close:async()=>{}})};
 const engine={discover:{validateDiscoveryTicket:()=>source}};
 const job={role:'discovery',provider:'playngo',subject:'playngo-public-123',payload:{source}};
 const result=await discoverCatalogue(browser,engine,job,{config,cloud,runId:'playngo-pilot'});
 assert.equal(result.queued,1);
 assert.equal(queued[0].subject,'1073');
 assert.equal(queued[0].payload.game.url,'https://www.playngo.com/games/unigoat');
});
test('mobile capture has a real frame and mobile assets before emitting visual JPEG',async()=>{
 let pageEvents={},visits=[];
 const page={
  goto:async url=>{
   visits.push(url);
   if(url.includes('ContainerLauncher')){
    for(const [endpoint,status] of [
     ['https://released.playngonetwork.com/configuration/v2',200],
     ['https://cdn.playngonetwork.com/x/config_mobile.json',200],
     ['https://cdn.playngonetwork.com/x/ui_mobile_bundle.json',200]
    ])pageEvents.response?.({url:()=>endpoint,status:()=>status});
   }
   return {status:()=>200};
  },
  url:()=>visits.at(-1),
  content:async()=>mockHtml,
  on:(type,fn)=>{pageEvents[type]=fn;},
  evaluate:async()=>2,
  screenshot:async()=>Buffer.alloc(2200,0xef),
  viewportSize:()=>({width:393,height:851})
 };
 const browser={newContext:async options=>{
  assert.equal(options.isMobile,true);
  assert.equal(options.hasTouch,true);
  return {newPage:async()=>page,close:async()=>{}};
 }};
 const engine={devices:{'Pixel 7':{viewport:{width:393,height:851},isMobile:true,hasTouch:true}}};
 const job={provider:'playngo',subject:'123',payload:{game:{id:'123',provider:'playngo',url:'https://www.playngo.com/games/unigoat'}}};
 const result=await capturePublicDemo(browser,engine,job,{config,runId:'playngo-pilot',captureWait:async()=>{},waitMs:1});
 assert.equal(result.info.mode,'visual');
 assert.equal(result.info.adapter,'playngo-mobile-public-demo');
 assert.equal(result.info.metadata.mobileChannel,'mobile');
 assert.equal(result.info.metadata.networkDiagnostics.summary.canvases,2);
 assert.ok(visits[1].includes('channel=mobile'));
 assert.ok(!JSON.stringify(result.info).includes('ticket='));
});


test('real Playngo terminal page can omit nextOffset after 20 entries',async()=>{
 const calls=[];
 const browser={newContext:async()=>({request:{get:async url=>{
  const offset=Number(new URL(url).searchParams.get('offset'));calls.push(offset);
  if(offset===0)return {status:()=>200,json:async()=>({
   games:Array.from({length:24},(_,i)=>({sku:String(i+1),slug:'demo-'+(i+1)})),
   nextOffset:24
  })};
  return {status:()=>200,json:async()=>({
   games:Array.from({length:20},(_,i)=>({sku:String(25+i),slug:'demo-'+(25+i)}))
   // Deliberately no nextOffset, matching live API 2026-10-21
  })};
 }},close:async()=>{}})};
 const out=await discoverPlayngo(browser,source,{config,maxPages:3,pauseMs:0});
 assert.deepEqual(calls,[0,24]);
 assert.equal(out.complete,true);
 assert.equal(out.games.length,44);
});
test('an omitted nextOffset on a full 24-game page cannot claim completion',async()=>{
 const browser={newContext:async()=>({request:{get:async()=>({
  status:()=>200,json:async()=>({
   games:Array.from({length:24},(_,i)=>({sku:String(i+1),slug:'demo-'+(i+1)}))
  })
 })},close:async()=>{}})};
 await assert.rejects(()=>discoverPlayngo(browser,source,{config,maxPages:2,pauseMs:0}),/missing nextOffset/);
});
