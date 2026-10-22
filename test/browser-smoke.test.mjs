import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from '../src/engine.mjs';
import {capturePublicDemo} from '../src/capture.mjs';
import {validateConfig} from '../src/config.mjs';
import {fixtureTransport} from './fixture-transport.mjs';
import {guardImportedNavigation,openImportedDemo} from '../src/tester-spin.mjs';
import {reviewedScreenshot} from '../src/capture-review.mjs';

test('async GPT quality loop visits a mocked game twice with no live response wait',
 {skip:process.env.INTEGRATION_BROWSER!=='1',timeout:90000},async()=>{
 const engine=await loadEngine('engine'),browser=await engine.chromium.launch({headless:true});
 const url='https://www.pragmaticplay.fun/en/slots/fixture/';
 const transport=await fixtureTransport(browser,new Map([
  [url,{body:'<iframe src="https://demogamesfree.pragmaticplay.net/fixture-game" style="width:900px;height:500px;border:0"></iframe>'}],
  ['https://demogamesfree.pragmaticplay.net/fixture-game',{body:`<html><body style="margin:0;background:#224466"><button onclick="this.remove();document.body.style.background='green'" style="position:fixed;inset:0;width:100%;height:100%">CONTINUE</button></body></html>`}]
 ]));
 const config=validateConfig({runId:'fixture-review',providers:[{id:'pragmatic',enabled:true,approved:true,pacing:{minStartIntervalMs:20000,maxActive:1},allowlist:[{origin:'https://www.pragmaticplay.fun',pathPrefix:'/en/slots/'}],games:[{id:'fixture',url}]}]});
 const job={provider:'pragmatic',subject:'fixture',payload:{game:{provider:'pragmatic',id:'fixture',url}}};
 const visit=plan=>capturePublicDemo(transport.browser,engine,job,{config,runId:config.runId,captureWait:async()=>new Promise(r=>setTimeout(r,600)),captureScreenshots:(snapshot,_validate,options)=>reviewedScreenshot(snapshot,{}, {},{plan,click:options.click,verify:async()=>true})});
 try{
  const first=await visit(null);assert.equal(first.reviewOutcome.launchPath.length,0);
  const second=await visit({id:'same-batch',imageSha256:'fixture',launchPath:[],action:{kind:'click',x:.5,y:.5,waitMs:100}});
  assert.notDeepEqual(first.image,second.image);assert.equal(second.reviewOutcome.launchPath.length,1);
 }finally{await transport.close();await browser.close();}
});

test('pinned engine captures a real Chromium JPEG from a completely mocked HTTPS DEMO',
 {skip:process.env.INTEGRATION_BROWSER!=='1',timeout:90000},async()=>{
 const engine=await loadEngine('engine');
 const browser=await engine.chromium.launch({headless:true});
 const url='https://www.pragmaticplay.fun/en/slots/candy-rush/';
 const html='<!doctype html><html><body><iframe src="https://demogamesfree.pragmaticplay.net/fixture-game" style="width:900px;height:500px;border:0"></iframe></body></html>';
 const demo='<!doctype html><html><body style="background:#224466;color:white"><button style="width:160px;height:60px">BUY FREE SPINS</button></body></html>';
 const routed={
  async newContext(options){
   const ctx=await browser.newContext(options);
   await ctx.route('**/*',async route=>{
    const target=route.request().url();
    if(target===url)return route.fulfill({status:200,contentType:'text/html',body:html});
    if(target==='https://demogamesfree.pragmaticplay.net/fixture-game')
     return route.fulfill({status:200,contentType:'text/html',body:demo});
    return route.abort();
   });
   return ctx;
  }
 };
 const config=validateConfig({runId:'browser-fixture',providers:[{
  id:'pragmatic',enabled:true,approved:true,
  pacing:{minStartIntervalMs:20000,maxActive:2},
  allowlist:[{origin:'https://www.pragmaticplay.fun',pathPrefix:'/en/slots/'}],
  games:[{id:'candy-rush',url}]
 }]});
 try{
  const result=await capturePublicDemo(routed,engine,{
   role:'catalog',provider:'pragmatic',subject:'candy-rush',
   payload:{game:{provider:'pragmatic',id:'candy-rush',url}}
  },{config,runId:'browser-fixture',captureWait:async()=>new Promise(resolve=>setTimeout(resolve,600)),waitMs:600,runnerId:'ci-fixture',confirmAdult:false});
  assert.equal(result.info.runId,'browser-fixture');
  assert.equal(result.info.provider,'pragmatic');
  assert.equal(result.info.gameId,'candy-rush');
  assert.equal(result.info.shotId,'base');
  assert.ok(['BASE','UNKNOWN','INTRO','BUY_MENU','CONFIRM','BONUS','OTHER'].includes(result.info.state));
  assert.ok(['visual','hybrid','structured'].includes(result.info.mode));
  assert.ok(result.info.width>0&&result.info.height>0);
  assert.equal(result.image[0],255);assert.equal(result.image[1],216);
  assert.ok(result.image.length>500);
  assert.equal(result.info.metadata.source,'github-actions-catalogue');
  assert.ok(result.info.metadata.networkDiagnostics?.summary);
 }finally{await browser.close();}
});

test('Tester Spin launchers reach mocked DEMO runtimes without spinning or contacting a live provider',
 {skip:process.env.INTEGRATION_BROWSER!=='1',timeout:90000},async()=>{
 const engine=await loadEngine('engine');
 const browser=await engine.chromium.launch({headless:true});
 const ruby='https://prrpeu3.com/launcher?gamename=rp_71&operator=rubyplay.com&server_url=https%3A%2F%2Fsrv.prrpeu3.com&currency=EUR&mode=fun&lang=en';
 const fixtures=[
  {id:'belatra',url:'https://belatragames.com/es/games/game/test',target:'https://demo.bltr-static.com/belatra/demo?game=test&language=es'},
  {id:'yggdrasil',symbol:'123',url:'https://yggdrasilgaming.com/games/test/',target:'https://staticdemo.yggdrasilgaming.com/init/launchClient.html?gameid=123&org=Demo'},
  {id:'rubyplay',url:'https://rubyplay.com/games/test/',target:ruby,
   html:`<button onclick="document.querySelector('iframe').src='${ruby}'">Play Demo</button><iframe></iframe>`},
  {id:'3oaks',url:'https://3oaks.com/game/test',target:'https://3oaks.com/api/v1/games/test/play?lang=en'},
  {id:'pragmatic',symbol:'vs_test',url:'https://www.pragmaticplay.com/en/games/test/',target:'https://demogamesfree.pragmaticplay.net/gs2c/html5Game.do?symbol=vs_test&mgckey=fresh-session'},
  {id:'redtiger',symbol:'123',url:'https://games.evolution.com/slots/test/',target:'https://gserver-evo-93212de3kbqabvry.redtiger.cash/game/index.html?token=FRESH_RED',
   runtimeOrigins:['https://gserver-evo-93212de3kbqabvry.redtiger.cash'],
   html:`<div class="game-playable" data-game-id="123"></div><form class="start-form" onsubmit="event.preventDefault();fetch('/wp-json/games/v1/start?id=123&mobile=false').then(r=>r.json()).then(data=>document.querySelector('iframe').src=data.payload)"><button id="start-game">Start demo</button></form><iframe></iframe>`},
  {id:'1spin4win',url:'https://gs.1spin4win.com:10443/gmh5/games.html?game=Test&currency=EUR&config=1&freeplay=true&language=en&exit=none'},
  {id:'ka_gaming',url:'https://gamesdemo.kaga88.com/?g=Test&p=demo&u=123&t=123&ak=accessKey&cr=USD&loc=es&l=https%3A%2F%2Fwww.kaga88.com%2F'},
  {id:'bgaming',url:'https://demo.bgaming-network.com/play/Test/FUN?server=demo',target:'https://test.demo.bgaming-network.com/hyperhive?play_token=FRESH_PRIVATE'},
  {id:'nolimit_city',url:'https://playin.com/embed/v1/demo/Test'},
  {id:'playtech',symbol:'gpas_test',url:'https://cachedownload.playtechone.com/ngmdesktop/casinoclient.html?game=gpas_test&preferedmode=offline&real=0',
   target:'https://cachedownload.playtechone.com/games/gpas_test/index.html',
   html:'<iframe src="https://cachedownload.playtechone.com/games/gpas_test/index.html" style="width:800px;height:600px"></iframe>'},
 ];
 const runtime='<html><body style="margin:0"><canvas width="800" height="600"></canvas><script>const c=document.querySelector("canvas").getContext("2d");c.fillStyle="#224466";c.fillRect(0,0,800,600);</script></body></html>';
 const documents=new Map();
 for(const f of fixtures){
  const target=f.target||f.url;
  documents.set(target,{body:runtime});
  if(target!==f.url)documents.set(f.url,f.id==='bgaming'?{status:302,headers:{location:target}}:
   {body:f.html||`<a data-iframe-src="${target}" href="${target}">Play demo</a>`});
 }
 const pragmaticOpen='https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?'+new URLSearchParams({
  gameSymbol:'vs_test',websiteUrl:'https://demogamesfree.pragmaticplay.net',jurisdiction:'99',
  lobby_url:'https://www.pragmaticplay.com/en/games/test/',lang:'en',cur:'USD'});
 documents.set(pragmaticOpen,{status:302,headers:{location:fixtures.find(f=>f.id==='pragmatic').target}});
 documents.set('https://games.evolution.com/wp-json/games/v1/start?id=123&mobile=false',{
  body:JSON.stringify({success:true,payload:'https://showcase.evo-games.com/entry?token=FRESH_EVO'})});
 documents.set('https://showcase.evo-games.com/entry?token=FRESH_EVO',{
  body:`<iframe src="${fixtures.find(f=>f.id==='redtiger').target}" style="width:800px;height:600px"></iframe>`});
 const transport=await fixtureTransport(browser,documents);
 try{
  for(const f of fixtures){
   const target=f.target||f.url;
   const offset=transport.requests.length;
   const routed=transport.browser;
   const config=validateConfig({runId:'mock-launchers',providers:[{
    id:f.id,launcher:'tester-spin-v1',enabled:true,approved:true,
    pacing:{minStartIntervalMs:20000,maxActive:1},
    allowlist:[{origin:new URL(f.url).origin,pathPrefix:'/'}],
    games:[{id:'fixture',url:f.url,symbol:f.symbol||'',...(f.runtimeOrigins?{runtimeOrigins:f.runtimeOrigins}:{})}]
   }]});
   const result=await capturePublicDemo(routed,engine,{
    role:'catalog',provider:f.id,subject:'fixture',payload:{game:{provider:f.id,id:'fixture',url:f.url,symbol:f.symbol||''}}
   },{config,runId:'mock-launchers',createKATransport:async()=>({contextOptions:{},install:async()=>{},close:()=>{}}),captureWait:async()=>new Promise(resolve=>setTimeout(resolve,600)),waitMs:500}).catch(error=>{
    throw new Error(f.id+': '+error.message);
   });
   assert.equal(result.info.metadata.launcher,'tester-spin-v1',f.id);
   assert.ok(result.image.length>500,f.id);
   assert.ok(transport.requests.slice(offset).includes(target),f.id+' must reach its actual runtime');
   assert.equal(transport.requests.slice(offset).filter(url=>url===target).length,1,f.id+' must reuse an already opened runtime');
   assert.ok(!JSON.stringify(result.info).includes('FRESH_PRIVATE'));
  }
  const source='https://belatragames.com/es/games/game/missing';
  documents.set(source,{body:'<h1>Product page, no demo available</h1>'});
  const ctxBrowser=transport.browser;
  const config=validateConfig({runId:'missing-demo',providers:[{id:'belatra',launcher:'tester-spin-v1',enabled:true,approved:true,
   pacing:{minStartIntervalMs:20000,maxActive:1},allowlist:[{origin:'https://belatragames.com',pathPrefix:'/es/games/game/'}],games:[{id:'missing',url:source}]}]});
  await assert.rejects(capturePublicDemo(ctxBrowser,engine,{provider:'belatra',subject:'missing',payload:{game:{provider:'belatra',id:'missing',url:source}}},
   {config,runId:'missing-demo',captureWait:async()=>new Promise(resolve=>setTimeout(resolve,600)),waitMs:500}),/DEMO launch/);
  const direct='https://playin.com/embed/v1/demo/Broken';
  documents.set(direct,{body:'<h1>Session unavailable</h1>'});
  const brokenConfig=validateConfig({runId:'broken-demo',providers:[{id:'nolimit_city',launcher:'tester-spin-v1',enabled:true,approved:true,
   pacing:{minStartIntervalMs:20000,maxActive:1},allowlist:[{origin:'https://playin.com',pathPrefix:'/embed/v1/demo/'}],games:[{id:'broken',url:direct}]}]});
  await assert.rejects(capturePublicDemo(ctxBrowser,engine,{provider:'nolimit_city',subject:'broken',payload:{game:{provider:'nolimit_city',id:'broken',url:direct}}},
   {config:brokenConfig,runId:'broken-demo',captureWait:async()=>new Promise(resolve=>setTimeout(resolve,600)),waitMs:500}),/DEMO frame inspection/);
  documents.set(direct,{status:302,headers:{location:'https://unapproved.example/demo'}});
  const redirected=transport.browser;
  await assert.rejects(capturePublicDemo(redirected,engine,{provider:'nolimit_city',subject:'broken',payload:{game:{provider:'nolimit_city',id:'broken',url:direct}}},
   {config:brokenConfig,runId:'broken-demo',captureWait:async()=>new Promise(resolve=>setTimeout(resolve,600)),waitMs:500}),/DEMO navigation/);
  assert.ok(!transport.requests.some(url=>new URL(url).hostname==='unapproved.example'),
   'a redirected document must be validated before its next HTTP fetch');
  const preloaded='https://rubyplay.com/games/preloaded/';
  documents.set(preloaded,{body:`<iframe src="${ruby}" style="width:800px;height:600px"></iframe>`});
  const context=await transport.browser.newContext({serviceWorkers:'block'});
  try{
   await guardImportedNavigation(context,'rubyplay',preloaded);
   const page=await context.newPage();
   await page.goto(preloaded,{waitUntil:'load'});
   const before=transport.requests.length;
   assert.equal(await openImportedDemo(page,'rubyplay',{url:preloaded,symbol:''},{engine}),page);
   assert.equal(page.url(),ruby,'RubyPlay must expose its complete launcher without the catalogue promotional cover');
   assert.equal(transport.requests.length,before+1,'RubyPlay opens the same complete launcher once in the main page');
  }finally{await context.close();}
 }finally{await browser.close();await transport.close();}
});
