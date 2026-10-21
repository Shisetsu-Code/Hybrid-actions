import test from 'node:test';import assert from 'node:assert/strict';
import {selectVisibleImportedSurface} from '../src/imported-surface.mjs';
const frame=(url,count)=>({url:()=>url,isDetached:()=>false,locator:selector=>{assert.equal(selector,'canvas:visible');return {count:async()=>count};}});
const engine={'select-frame':{bestFrame:async page=>({frame:page.frames()[0],data:{}})}};
test('surface selection sees visible canvases beyond hidden utility canvases',async()=>{
 const runtime=frame('https://demo.bgaming-network.com/games/Test/FUN',9);
 const result=await selectVisibleImportedSurface({frames:()=>[runtime],mainFrame:()=>runtime},engine,'bgaming',{});
 assert.equal(result.frame,runtime);
});
test('surface selection excludes a wrapper and a foreign canvas before ranking frames',async()=>{
 const wrapper=frame('https://showcase.evo-games.com/frontend/evo/r2/',0),foreign=frame('https://foreign.example/',1),runtime=frame('https://gserver-evo-93212de3kbqabvry.redtiger.cash/game/index.html',1);
 const result=await selectVisibleImportedSurface({frames:()=>[wrapper,foreign,runtime],mainFrame:()=>wrapper},engine,'redtiger',{runtimeOrigins:['https://gserver-evo-93212de3kbqabvry.redtiger.cash']});
 assert.equal(result.frame,runtime);
});
