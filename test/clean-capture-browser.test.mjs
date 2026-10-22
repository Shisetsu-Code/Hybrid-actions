import test from 'node:test';import assert from 'node:assert/strict';
import {loadEngine} from '../src/engine.mjs';
import {cleanScreenshot,validateCapturedImage} from '../src/capture-validator.mjs';
import {clearCaptureCookies,clickCaptureIntro} from '../src/capture-cleanup.mjs';

test('real runner OCR clears recurring cookies and intro, then captures stable balance without game actions',
 {skip:process.env.CAPTURE_OCR_INTEGRATION!=='1',timeout:180000},async()=>{
 const engine=await loadEngine('engine');const browser=await engine.chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:720}});
  await page.route('**/*',route=>route.abort());
  await page.setContent(`<html><body style="margin:0;background:#234;color:white;font:32px Arial">
   <div style="margin:70px;height:420px;background:#754">GAME DEMO</div>
   <div id="intro" style="position:absolute;top:520px;left:150px"><button style="font:32px Arial" onclick="this.parentNode.remove();document.querySelector('#base').hidden=false;document.querySelector('#cookies').hidden=false;window.entries++">PRESS ANYWHERE TO CONTINUE</button></div>
   <div id="base" hidden style="position:absolute;top:600px;left:35px">BALANCE 1000.00 &nbsp; BET 0.20 <button style="font:30px Arial" onclick="window.spins++">SPIN</button><button onclick="window.buys++">BUY</button></div>
   <div id="cookies" style="position:absolute;inset:0;background:#111e"><button id="onetrust-reject-all-handler" style="font:30px Arial" onclick="this.parentNode.hidden=true;window.rejections++">Reject all cookies</button></div>
   <script>window.entries=0;window.spins=0;window.buys=0;window.rejections=0;</script></body></html>`);
  const result=await cleanScreenshot(async()=>{await clearCaptureCookies(page);return Buffer.from(await page.screenshot({type:'jpeg'}));},image=>validateCapturedImage(null,{runId:'fixture',provider:'fixture',gameId:'one'},image,{reference:null,store:false}),{
   sleep:async()=>{},advanceIntro:action=>clickCaptureIntro(page,{x:0,y:0,width:1200,height:720},action)});
  assert.equal(result.validation.status,'ready');assert.equal(result.validation.cleanCapture.stableBalance,true);
  assert.deepEqual(await page.evaluate(()=>[window.entries,window.rejections,window.spins,window.buys]),[1,2,0,0]);
 }finally{await browser.close();}
});
