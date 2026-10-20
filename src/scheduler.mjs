// One GitHub runner coordinates up to six distinct providers concurrently.
// Provider-level starts and active sessions are CAS-leased in Cloudflare D1.
import {setTimeout as sleep} from 'node:timers/promises';
import {executeTicket,classifyOne} from './execute.mjs';

const sum=counts=>Number(counts?.pending||0)+Number(counts?.leased||0);
export function remainingWork(workload){
 const providers=workload?.providers||[];
 return providers.reduce((n,p)=>n+sum(p.discovery)+sum(p.catalog),0);
}
export function chooseProvider(workload,allowed,active,newCursor=0){
 const byProvider=new Map((workload?.providers||[]).map(p=>[p.provider,p]));
 const n=allowed.length;
 if(!n)return null;
 for(let i=0;i<n;i++){
  const idx=(newCursor+i)%n,provider=allowed[idx];
  if(active.has(provider))continue;
  const work=byProvider.get(provider);
  if(!work)continue;
  if(Number(work.discovery.pending)>0)return {provider,role:'discovery',nextCursor:(idx+1)%n};
  if(Number(work.catalog.pending)>0)return {provider,role:'catalog',nextCursor:(idx+1)%n};
 }
 return null;
}
export async function runFleet({
 cloud,config,engine,browser,runnerId,lanes=5,durationMinutes=60,
 waitMs=3500,confirmAdult=false,classification=true,
 log=console.log,sleepFn=sleep,now=()=>Date.now(),
 execute=executeTicket,classify=classifyOne
}){
 if(!Number.isSafeInteger(lanes)||lanes<1||lanes>6)throw Error('runner lanes must be 1..6');
 if(!Number.isSafeInteger(durationMinutes)||durationMinutes<1||durationMinutes>60)throw Error('duration must be 1..60 minutes');
 const providers=config.providers.map(p=>p.id);
 if(!providers.length)throw Error('no approved public DEMO providers are enabled');
 const active=new Map(),deadline=now()+durationMinutes*60000;
 const results={completed:0,discovered:0,alreadyCaptured:0,failed:0,deferred:0,structured:0};
 let cursor=0,nextSnapshot=0,lastActivity=now(),snapshot={providers:[]},queue=null;
 let stopping=false,lastClassification=0,lastHeartbeat=0;
 const stop=()=>{stopping=true;};
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
 const launch=async(job)=>{
  try{
   const outcome=await execute({cloud,job,workerId:runnerId,runId:config.runId,
    browser,engine,config,deadline,waitMs,confirmAdult,log,sleepFn});
   if(outcome.status==='done'){
    results.completed++;
    if(job.role==='discovery')results.discovered++;
    if(outcome.alreadyCaptured)results.alreadyCaptured++;
   }else if(outcome.status==='deferred')results.deferred++;
   else results.failed++;
   log('TICKET',job.provider+'/'+job.subject,job.role,outcome.status);
  }catch(e){results.failed++;log('TICKET ERROR',job.id,String(e.message).slice(0,160));}
  finally{active.delete(job.provider);lastActivity=now();nextSnapshot=0;}
 };
 try{
  while(now()<deadline&&!stopping){
   if(now()>=nextSnapshot){
    try{
     [snapshot,queue]=await Promise.all([cloud.jobs(config.runId),cloud.stats(config.runId)]);
     nextSnapshot=now()+5000;
    }catch(e){
     // Temporary Cloudflare/D1 outage must not terminate a 60-minute runner.
     // Do not claim work using a potentially stale backlog snapshot.
     log('D1 BACKOFF',String(e.message).slice(0,150));
     nextSnapshot=0;
     await sleepFn(5000);
     continue;
    }
   }
   if(now()-lastHeartbeat>30000){
    await cloud.heartbeat(config.runId,runnerId,'catalog').catch(e=>log('HEARTBEAT',e.message));
    lastHeartbeat=now();
   }
   if(classification&&now()-lastClassification>3500&&now()<deadline-90000){
    lastClassification=now();
    try{
     const item=await classify({cloud,engine,runId:config.runId,workerId:runnerId,log});
     if(item.didWork){results.structured++;lastActivity=now();nextSnapshot=0;}
    }catch(e){log('STRUCTURED ERROR',String(e.message).slice(0,130));}
   }
   // Recheck the D1 backlog between claims, including tickets discovered by
   // another runner. One provider per active lane on this runner.
   let launched=false;
   while(active.size<Math.min(lanes,providers.length)&&now()<deadline-90000&&!stopping){
    const pick=chooseProvider(snapshot,providers,new Set(active.keys()),cursor);
    if(!pick)break;
    cursor=pick.nextCursor;
    // Prevent claiming the same non-ready ticket repeatedly on this poll.
    let claimed;
    try{claimed=await cloud.claim(config.runId,pick.role,pick.provider,runnerId);}
    catch(e){
     log('D1 CLAIM BACKOFF',pick.provider,String(e.message).slice(0,150));
     const row=snapshot.providers.find(p=>p.provider===pick.provider);
     if(row?.[pick.role])row[pick.role].pending=0;
     nextSnapshot=0;
     continue;
    }
    if(!claimed){
     const row=snapshot.providers.find(p=>p.provider===pick.provider);
     if(row?.[pick.role])row[pick.role].pending=0;
     continue;
    }
    active.set(pick.provider,launch(claimed));
    launched=true;
   }
   if(launched){nextSnapshot=0;lastActivity=now();}
   const noJobs=remainingWork(snapshot)===0;
   const noStructured=Number(queue?.captures?.structured||0)===0;
   if(active.size===0&&noJobs&&noStructured&&now()-lastActivity>20000){
    log('CATALOGUE EXHAUSTED: no discovery, capture or structured review tickets remain');
    break;
   }
   if(active.size){
    await Promise.race([...active.values(),sleepFn(3000)]);
   }else{
    await sleepFn(5000);
   }
  }
 }finally{
  // At 60 minutes, stop claiming and finish already-started public demos.
  // GitHub job timeout must include a grace window for this final drain.
  if(active.size)await Promise.allSettled([...active.values()]);
  process.off('SIGTERM',stop);process.off('SIGINT',stop);
 }
 const last=await cloud.stats(config.runId).catch(()=>queue);
 return {...results,runId:config.runId,runnerId,remaining:last?.jobs,
  captures:last?.captures,visualPending:Number(last?.captures?.visual||0)+Number(last?.captures?.hybrid||0),
  reviewPending:Number(last?.captures?.needsReview||0)};
}
