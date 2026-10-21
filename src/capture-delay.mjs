import {setTimeout as sleep} from 'node:timers/promises';
// Count from opening the runtime, not the provider's catalogue page.
export async function waitForGameCapture(startedAt,{provider,waitMs=25000,now=Date.now,sleepFn=sleep}={}){
 const minimum=provider==='3oaks'?35000:provider==='yggdrasil'?50000:25000;
 const delay=Math.max(minimum,Math.min(Number.isFinite(waitMs)?waitMs:minimum,300000));
 const remaining=delay-Math.max(0,now()-startedAt);
 if(remaining>0)await sleepFn(remaining);
}
