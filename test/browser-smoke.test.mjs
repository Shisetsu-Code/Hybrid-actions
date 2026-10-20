import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from '../src/engine.mjs';
import {capturePublicDemo} from '../src/capture.mjs';
import {validateConfig} from '../src/config.mjs';

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
  },{config,runId:'browser-fixture',waitMs:600,runnerId:'ci-fixture',confirmAdult:false});
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
