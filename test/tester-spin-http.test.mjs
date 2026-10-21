import test from 'node:test';
import assert from 'node:assert/strict';
import {isKALauncherResource,prepareKAPublicTransport} from '../src/tester-spin-http.mjs';
test('KA fallback rejects other hosts, credentials, ports and non-HTTPS resources',()=>{
 assert.equal(isKALauncherResource('https://gamesdemo.kaga88.com/game.min.2080.js'),true);
 for(const url of ['http://gamesdemo.kaga88.com/','https://gamesdemo.kaga88.com.attacker.example/',
  'https://user:password@gamesdemo.kaga88.com/','https://gamesdemo.kaga88.com:444/',
  'https://127.0.0.1/','https://rmpdemo.kaga88.com/kaga/command/spin'])assert.equal(isKALauncherResource(url),false);
});
test('KA prepares its profile before the context and relays only blocked public GET resources',async()=>{
 let handler,calls=0,closed=false,fulfilled;
 const transport=await prepareKAPublicTransport({client:{ready:Promise.resolve({userAgent:'profile-agent'}),
  get:async()=>{calls++;return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<canvas></canvas>').toString('base64')};},close:()=>{closed=true;}}});
 assert.equal(transport.contextOptions.userAgent,'profile-agent');
 await transport.install({route:async(pattern,fn)=>{assert.equal(pattern,'https://gamesdemo.kaga88.com/**');handler=fn;}});
 const route={request:()=>({method:()=> 'GET',url:()=> 'https://gamesdemo.kaga88.com/',headers:()=>({})}),
  fetch:async()=>({status:()=>403}),fulfill:async body=>{fulfilled=body;},fallback:async()=>{},abort:async()=>{throw Error('unexpected abort');}};
 await handler(route);assert.equal(calls,1);assert.equal(fulfilled.body.toString(),'<canvas></canvas>');
 await handler({...route,request:()=>({method:()=> 'POST',url:()=> 'https://gamesdemo.kaga88.com/'})});
 assert.equal(calls,1,'POST is never relayed by the read-only fallback');
 transport.close();assert.equal(closed,true);
});
