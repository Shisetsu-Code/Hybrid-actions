import {setTimeout as sleep} from 'node:timers/promises';
// Count from opening the runtime, not the provider's catalogue page.
export async function waitForGameCapture(startedAt,{waitMs=25000,now=Date.now,sleepFn=sleep}={}){
 const delay=Math.max(25000,Math.min(Number.isFinite(waitMs)?waitMs:25000,300000));
 const remaining=delay-Math.max(0,now()-startedAt);
 if(remaining>0)await sleepFn(remaining);
}
