// Manual cloud continuation of an EXISTING reviewed batch. No catalogue seeding.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {loadEngine} from '../src/engine.mjs';
import {validateConfig,providerForUrl} from '../src/config.mjs';
import {buildPilotPlan} from '../src/pilot-plan.mjs';
import {guardImportedNavigation,openImportedDemo,dismissImportedSiteOverlays} from '../src/tester-spin.mjs';
import {clearCaptureCookies} from '../src/capture-cleanup.mjs';
import {prepareKAPublicTransport} from '../src/tester-spin-http.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('GitHub Actions only');
const runId=process.env.BRANCH_RUN_ID,minutes=Number(process.env.BRANCH_MINUTES||15),concurrency=Number(process.env.BRANCH_CONCURRENCY||8);
if(!/^[a-z0-9][a-z0-9_.-]{0,99}$/i.test(runId||'')||!Number.isInteger(minutes)||minutes<1||minutes>60||!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw Error('Invalid continuation budget');
const providers=JSON.parse(process.env.BRANCH_PROVIDERS||'["pragmatic","bgaming"]');
const games=JSON.parse(process.env.BRANCH_GAMES||'[]');
if(!Array.isArray(games)||games.length>16||games.some(g=>typeof g!=='string'||!/^[-a-z0-9_]+\/[-a-z0-9_.]+$/i.test(g)))throw Error('Invalid selected games');
const gameSet=new Set(games);
const selectedDecision=i=>providers.includes(i.provider)&&(!gameSet.size||gameSet.has(i.provider+'/'+i.gameId));
// These routes have an existing tested launcher; other provider-specific launchers
// are deliberately not replaced with a guessed URL or canvas click.
const supported=['pragmatic','bgaming','1spin4win','ka_gaming','3oaks','rubyplay','yggdrasil','redtiger','nolimit_city','playtech'];
if(!Array.isArray(providers)||!providers.length||providers.some(p=>!supported.includes(p))||new Set(providers).size!==providers.length)throw Error('Unsupported continuation providers');
const raw=JSON.parse(await fs.readFile('config/batches/catalog-300-20261021.json','utf8'));
const selected=buildPilotPlan(raw,{providers,limit:1,runId,verifiedOnly:true});
for(const p of selected.providers)p.games=raw.providers.find(r=>r.id===p.id).games;
const config=validateConfig(selected),engine=await loadEngine('engine');
const fromEngine=file=>import(pathToFileURL(path.resolve('engine/local',file)).href);
const [{CloudClient},{LoopController},{executeDemoBranch}]=await Promise.all([fromEngine('cloud-client.js'),fromEngine('loop.js'),fromEngine('branch-executor.js')]);
const cloud=new CloudClient({endpoint:process.env.HYBRID_FUZZER_URL,reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
const health=await cloud.call('/health');
if(!health.ok||health.schemaVersion<4||health.branchTransitionsVersion!==1||!health.branchCoordinationReady||!health.pacingReady||!health.workforceReady)throw Error('Updated cloud branch coordination is not ready');
const before=(await cloud.call('/v1/work/provider/policies')).policies;
if(process.env.BRANCH_PREFLIGHT==='true'){
 const decisions=(await cloud.allDecisions(runId)).filter(selectedDecision);
 const report={preflight:true,runId,engineSha:process.env.BRANCH_ENGINE_SHA,health,classifiedDecisions:decisions.length,games:new Set(decisions.map(i=>i.provider+'/'+i.gameId)).size,providers:before.filter(p=>providers.includes(p.provider)).map(({provider,enabled,minStartIntervalMs,maxActive})=>({provider,enabled,minStartIntervalMs,maxActive}))};
 await fs.writeFile('continuation-summary.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exit(0);
}
if(before.some(p=>providers.includes(p.provider)&&p.enabled))throw Error('A selected provider is already enabled; refusing overlapping fleet ownership');
let stop=false;process.on('SIGTERM',()=>{stop=true;});process.on('SIGINT',()=>{stop=true;});
const browser=await engine.chromium.launch({headless:true});
const configured=[],summary={runId,engineSha:process.env.BRANCH_ENGINE_SHA,rounds:[],health};
const deadline=Date.now()+minutes*60000;
const errorText=e=>String(e.cause?.cause?.message||e.cause?.message||e.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,300);
const filteredCloud=new Proxy(cloud,{get(target,key){
 if(key==='allDecisions')return async id=>(await target.allDecisions(id)).filter(selectedDecision);
 return typeof target[key]==='function'?target[key].bind(target):target[key];
}});
try{
 for(const p of config.providers){
  const old=before.find(row=>row.provider===p.id),policy=old||raw.providers.find(row=>row.id===p.id).pacing;
  configured.push(p.id);
  await cloud.call('/v1/work/provider/policy',{method:'POST',body:JSON.stringify({provider:p.id,enabled:true,minStartIntervalMs:policy.minStartIntervalMs,maxActive:policy.maxActive})});
 }
 const worker=new LoopController({cloud:filteredCloud,runId,outDir:'.local/continued-'+runId,limit:32,concurrency,coordinated:true,
  log:s=>console.log(String(s).replace(/https?:\/\/\S+/g,'[URL]')),
  reserve:async task=>{
   if(stop||Date.now()>=deadline)throw Error('Continuation budget ended before opening a new game');
   const p=config.providers.find(p=>p.id===task.provider),game=p?.games.find(g=>g.id===task.gameId);
   if(!game)throw Error('Reviewed game absent from approved frozen catalogue');
   providerForUrl(config,p.id,game.url);
   const owner='branch-'+process.env.GITHUB_RUN_ID+'-'+task.id.slice(0,16);
   const lease=await cloud.call('/v1/work/provider/lease',{method:'POST',body:JSON.stringify({provider:p.id,runId,gameId:game.id,workerId:owner,leaseSeconds:900})});
   return lease.granted?{p,game,owner,lease}:{deferred:true,reason:lease.reason};
  },
  release:async(_task,{owner,lease})=>cloud.call('/v1/work/provider/release',{method:'POST',body:JSON.stringify({leaseId:lease.leaseId,workerId:owner})}),
  executor:async(task,source,{p,game,owner,lease})=>{
   let transport,lastRenew=Date.now();
   const renew=async()=>{await cloud.call('/v1/work/provider/renew',{method:'POST',body:JSON.stringify({leaseId:lease.leaseId,workerId:owner,leaseSeconds:900})});lastRenew=Date.now();};
   try{
    if(p.id==='ka_gaming')transport=await prepareKAPublicTransport();
    const original=new URL(source.metadata?.url||game.url);
    const directPragmatic=p.id==='pragmatic'&&original.origin==='https://www.pragmaticplay.fun'&&original.pathname==='/en/slots/'+game.id+'/'&&!original.search;
    const url=directPragmatic?original.href:game.url;
    const wrapped={newContext:async options=>{
     const context=await browser.newContext({...options,...transport?.contextOptions});
     try{if(transport)await transport.install(context);if(!directPragmatic)await guardImportedNavigation(context,p.id,game.url,game);return context;}
     catch(e){await context.close();throw e;}
    }};
    return await executeDemoBranch(task,source,{browser:wrapped,manifest:[{provider:p.id,...game}],resolveUrl:()=>url,
     openDemo:async page=>({page:directPragmatic?(await engine.intro.openPublicDemo(page,{provider:p.id,url,confirmAdult:process.env.PILOT_CONFIRM_ADULT==='true'}),page):await openImportedDemo(page,p.id,game,{engine,confirmAdult:process.env.PILOT_CONFIRM_ADULT==='true',confirmAge21:process.env.PILOT_CONFIRM_AGE_21==='true'})}),
     cleanupOverlays:async(page,options)=>{await engine.intro.dismissCatalogueOverlays(page,options);await clearCaptureCookies(page);if(!directPragmatic)await dismissImportedSiteOverlays(page,p.id);},
     beforeClick:renew,keepAlive:async()=>{if(Date.now()-lastRenew>=30000)await renew();},loadReviewedImage:ref=>cloud.reviewedImage(ref)
    });
   }catch(e){const clean=Error(errorText(e));clean.actionIssued=e.actionIssued===true;throw clean;}
   finally{transport?.close();}
  }});
 do{
  const round=await worker.once();summary.rounds.push(round);console.log('CONTINUATION_ROUND '+JSON.stringify(round));
  if(round.waiting&&process.env.BRANCH_WAIT_FOR_REVIEW!=='true')break;
  if(!stop&&Date.now()<deadline)await sleep(5000);
 }while(!stop&&Date.now()<deadline);
}finally{
 await browser.close();
 const restoration=await Promise.allSettled(configured.map(provider=>{
  const old=before.find(p=>p.provider===provider),policy=config.providers.find(p=>p.id===provider).pacing;
  return cloud.call('/v1/work/provider/policy',{method:'POST',body:JSON.stringify({provider,enabled:old?.enabled||false,minStartIntervalMs:old?.minStartIntervalMs||policy.minStartIntervalMs,maxActive:old?.maxActive||policy.maxActive})});
 }));
 summary.policyRestorationFailed=restoration.some(r=>r.status==='rejected');
 await fs.writeFile('continuation-summary.json',JSON.stringify(summary,null,2));
 if(summary.policyRestorationFailed)throw Error('Provider policy restoration failed; operator review required');
}
