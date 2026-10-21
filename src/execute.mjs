import {setTimeout as sleep} from 'node:timers/promises';
import {capturePublicDemo,discoverCatalogue} from './capture.mjs';

function boundedError(error){return String(error?.message||error).slice(0,300);}
export async function executeTicket({
 cloud,job,workerId,runId,browser,engine,config,deadline,
 waitMs=3500,confirmAdult=false,log=()=>{},sleepFn=sleep,
 capture=capturePublicDemo,discover=discoverCatalogue
}){
 let session=null,done=false;
 let lostLease=false;
 // Both leases are refreshed independently, including while waiting for a
 // provider-specific start permit. Abandon immediately on ownership loss.
 const heartbeat=setInterval(()=>{
  cloud.renew(job,workerId).catch(e=>{lostLease=true;log('JOB LEASE LOST',job.id,boundedError(e));});
  if(session)cloud.renewSession(session,workerId).catch(e=>{
   lostLease=true;log('PROVIDER SESSION LOST',job.provider,boundedError(e));
  });
 },60000);
 try{
  if(job.role==='catalog'){
   const existing=await cloud.existingCapture(runId,job.provider,job.subject);
   if(existing){
    const row=await cloud.complete(job,workerId,{ok:true,result:{
     alreadyCaptured:true,itemId:existing.id,status:existing.status}});
    done=true;return {status:row.status,alreadyCaptured:true};
   }
  }
  while(Date.now()<deadline-90000&&!lostLease){
   const p=await cloud.acquire(job.provider,runId,job.subject,workerId);
   if(p.granted){session=p;break;}
   if(p.reason==='unconfigured'||p.reason==='disabled'){
    await cloud.defer(job,workerId,90);done=true;
    return {status:'deferred',reason:p.reason};
   }
   await sleepFn(Math.min(Math.max(1000,p.retryAfterMs||5000),30000));
  }
  if(!session){
   if(!lostLease){
    await cloud.defer(job,workerId,30);done=true;
    return {status:'deferred',reason:'runner deadline approaching'};
   }
   throw Error('work lease was lost before provider session');
  }
  if(lostLease)throw Error('lease lost before opening public demo');
  let result;
  if(job.role==='discovery'){
   result=await discover(browser,engine,job,{cloud,config,runId});
  }else if(job.role==='catalog'){
   const captured=await capture(browser,engine,job,{
    config,runId,waitMs,confirmAdult,runnerId:workerId});
   if(lostLease)throw Error('lease lost during DEMO capture');
   const item=await cloud.uploadCapture(captured.info,captured.image);
   result={provider:job.provider,gameId:job.subject,itemId:item.id,
    mode:captured.info.mode,bytes:captured.image.length};
  }else throw Error('unrecognized role '+job.role);
  if(lostLease)throw Error('lease lost during task');
  const row=await cloud.complete(job,workerId,{ok:true,result});
  done=true;return {status:row.status,result};
 }catch(e){
  if(!done&&e?.code==='ADULT_CONFIRMATION_REQUIRED'){
   try{await cloud.defer(job,workerId,900);done=true;return {status:'deferred',reason:'adult_confirmation_required'};}
   catch(deferError){log('JOB DEFER FAILED',job.id,boundedError(deferError));}
  }
  if(!done){
   try{await cloud.complete(job,workerId,{ok:false,error:boundedError(e)});}
   catch(completeError){log('JOB COMPLETION FAILED',job.id,boundedError(completeError));}
  }
  return {status:'error',error:boundedError(e)};
 }finally{
  clearInterval(heartbeat);
  if(session){
   try{await cloud.releaseSession(session,workerId);}
   catch(e){log('PROVIDER RELEASE FAILED',job.provider,boundedError(e));}
  }
 }
}
export async function classifyOne({cloud,engine,runId,workerId,log=()=>{}}){
 const item=await cloud.claimStructured(runId);
 if(!item)return {didWork:false};
 try{
  const decision=engine['structured-classifier'].classifyStructured(item);
  if(!decision.eligible)throw Error('received non-eligible structured capture');
  const saved=await cloud.saveStructured(item,decision,workerId);
  log('STRUCTURED',saved.provider+'/'+saved.gameId,decision.status);
  return {didWork:true,status:decision.status};
 }catch(e){
  await cloud.releaseCapture(item).catch(()=>{});
  return {didWork:false,error:boundedError(e)};
 }
}
