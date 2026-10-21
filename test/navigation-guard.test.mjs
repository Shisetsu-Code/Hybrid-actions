import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadEngine} from '../src/engine.mjs';
import {guardDocumentNavigations} from '../src/navigation-guard.mjs';
test('native Chromium follows allowed redirects and blocks disallowed redirect before HTTP dispatch',
 {skip:process.env.INTEGRATION_BROWSER!=='1',timeout:30000},async()=>{
 const seen=[],server=http.createServer((req,res)=>{
  seen.push(req.url);
  if(req.url==='/allowed'){res.writeHead(302,{location:'/runtime'});return res.end();}
  if(req.url==='/blocked'){res.writeHead(302,{location:'/forbidden'});return res.end();}
  if(req.url==='/iframe')return res.end(`<iframe src="http://localhost:${server.address().port}/blocked"></iframe>`);
  res.end('<canvas></canvas>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const engine=await loadEngine('engine'),browser=await engine.chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext();
  await guardDocumentNavigations(ctx,url=>(url.startsWith(origin+'/')||url.startsWith('http://localhost:'+server.address().port+'/'))&&!url.endsWith('/forbidden'));
  const page=await ctx.newPage();
  await page.goto(origin+'/allowed');assert.equal(page.url(),origin+'/runtime');
  await page.goto(origin+'/blocked').catch(()=>{});
  assert.ok(seen.includes('/runtime'));assert.ok(!seen.includes('/forbidden'));
  const iframePage=await ctx.newPage();
  await iframePage.goto(origin+'/iframe');
  await iframePage.waitForTimeout(500);
  assert.ok(!seen.includes('/forbidden'),'cross-origin iframe redirect must be intercepted before dispatch');
  await iframePage.evaluate(url=>window.open(url,'guard-test'),origin+'/forbidden');
  await iframePage.waitForTimeout(500);
  assert.ok(!seen.includes('/forbidden'),'first popup request must be blocked before CDP attaches');
  await iframePage.evaluate(url=>window.open(url,'guard-redirect-test'),origin+'/blocked');
  await iframePage.waitForTimeout(500);
  assert.ok(!seen.includes('/forbidden'),'allowed popup redirect must be blocked before dispatch');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
