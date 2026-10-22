// Bounded manual pilot: explicit providers, two configured DEMOs each, no discovery.
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {verifyStoredCapture} from '../src/capture-integrity.mjs';
import {CloudClient} from '../src/client.mjs';
import {validateConfig} from '../src/config.mjs';
import {loadEngine} from '../src/engine.mjs';
import {capturePublicDemo} from '../src/capture.mjs';
import {buildPilotPlan} from '../src/pilot-plan.mjs';
import {captureWithRetries,providerAccessDenied} from '../src/capture-retry.mjs';
import {validateCapturedImage} from '../src/capture-validator.mjs';
import {reviewedScreenshot} from '../src/capture-review.mjs';

if(process.env.GITHUB_ACTIONS!=='true')throw Error('Capture executor requires GitHub-hosted Actions');
const guided=process.env.PILOT_GPT_REVIEW==='true';

const ids=(process.env.PILOT_PROVIDERS||'belatra,bgaming,ka_gaming,rubyplay,redtiger,yggdrasil,nolimit_city,playtech').split(',');
const shotId=process.env.PILOT_SHOT_ID||'launchfix-v1';
if(!/^[a-z0-9][a-z0-9_.-]{0,48}$/.test(shotId))throw Error('Invalid pilot shot ID');
const raw=JSON.parse(await fs.readFile(process.env.PILOT_CONFIG||'config/providers.json','utf8'));
const config=validateConfig(buildPilotPlan(raw,{providers:ids,limit:Number(process.env.PILOT_LIMIT||2),
 runId:process.env.PILOT_RUN_ID||raw.runId,verifiedOnly:process.env.PILOT_VERIFIED_ONLY==='true'}));
const cloud=new CloudClient({baseUrl:process.env.HYBRID_FUZZER_URL||'https://hybrid-cloud-fuzzer.braian-n-l.workers.dev',reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
const health=await cloud.requireReady(),before=(await cloud.policies()).policies;
if(guided&&!health.asyncCaptureReviewReady)throw Error('GPT review coordinator is not deployed');
const engine=await loadEngine('engine'),browser=await engine.chromium.launch({headless:true});
const report={runId:config.runId,shotId,startedAt:new Date().toISOString(),health,attempts:[],failures:[]};
let pendingSave=Promise.resolve();
function save(){
 if(!process.env.PILOT_REPORT_FILE)return Promise.resolve();
 const text=JSON.stringify(report,null,2)+'\n';
 return pendingSave=pendingSave.then(()=>fs.writeFile(process.env.PILOT_REPORT_FILE,text));
}
const safeError=error=>String(error?.cause?.cause?.message||error?.cause?.message||error?.message||error)
 .split('\n')[0].replace(/https?:\/\/\S+/g,'[URL]').slice(0,220);
try{
 for(let i=0;i<config.providers.length;i+=3){
  const settled=await Promise.allSettled(config.providers.slice(i,i+3).map(async p=>{
  const previous=before.find(x=>x.provider===p.id),workerId=('pilot-'+(process.env.GITHUB_RUN_ID||'local')+'-'+p.id).slice(0,99);
  try{
   await cloud.configurePolicy(p.id,{enabled:true,minStartIntervalMs:20000,maxActive:1});
   for(const game of p.games){
   const row={provider:p.id,gameId:game.id,startedAt:new Date().toISOString()};let lease,plan;const sessionId=randomUUID();
   try{
    const id=[config.runId,p.id,game.id,shotId].join(':');
    let existing;try{existing=(await cloud.call('/v1/items/'+encodeURIComponent(id))).item;}catch(e){if(e.status!==404)throw e;}
    if(existing){
     const verified=await verifyStoredCapture(cloud,id);
     Object.assign(row,{result:'already-stored',itemId:id,bytes:verified.bytes,imageSha256:verified.imageSha256,
      width:verified.item.width,height:verified.item.height,d1Verified:true,r2Verified:true});continue;
    }
    if(guided){
     let review;try{review=(await cloud.call('/v1/capture-reviews/'+encodeURIComponent(id))).review;}catch(error){if(error.status!==404)throw error;}
     if(review&&review.status!=='command'){Object.assign(row,{result:review.status==='approved'?'approved':'awaiting-gpt',reviewId:id,revision:review.revision});continue;}
     if(review){
      const claimed=(await cloud.call('/v1/capture-reviews/command',{method:'POST',role:'ingest',body:{id,sessionId,revision:review.revision,imageSha256:review.imageSha256}})).review;
      if(!claimed.action){Object.assign(row,{result:'awaiting-gpt',reviewId:id});continue;}
      plan={...claimed,launchPath:review.launchPath||[]};
     }
    }
    const deadline=Date.now()+120000;
    while(!lease&&Date.now()<deadline){
     const x=await cloud.acquire(p.id,config.runId,game.id,workerId);
     if(x.granted)lease=x;else await new Promise(done=>setTimeout(done,Math.min(30000,Math.max(1000,x.retryAfterMs||5000))));
    }
    if(!lease)throw Error('Pilot session permit timeout');
    const timing=guided?await cloud.call('/v1/capture-timing?'+new URLSearchParams({provider:p.id,gameId:game.id})):null;
    const capture=()=>capturePublicDemo(browser,engine,{provider:p.id,subject:game.id,payload:{game:{provider:p.id,...game}}},
     {config,runId:config.runId,confirmAdult:process.env.PILOT_CONFIRM_ADULT==='true',confirmAge21:process.env.PILOT_CONFIRM_AGE_21==='true',runnerId:workerId,
      ...(guided?{waitMs:timing.waitMs,captureWait:async(start,{waitMs})=>{const remaining=waitMs-(Date.now()-start);if(remaining>0)await new Promise(r=>setTimeout(r,remaining));},captureScreenshots:(snapshot,_validator,options)=>reviewedScreenshot(snapshot,cloud,{runId:config.runId,provider:p.id,gameId:game.id,shotId},{click:options.click,plan})}:{validateScreenshot:image=>validateCapturedImage(cloud,{runId:config.runId,provider:p.id,gameId:game.id},image)})});
    const captured=guided?await capture():await captureWithRetries(capture);
    captured.info.shotId=shotId;
    if(process.env.PILOT_VISUAL_ONLY==='true'){captured.info.mode='visual';captured.info.candidates=[];}
    if(guided){
     captured.info.metadata.captureReviewPath=captured.reviewOutcome?.launchPath||[];
     const form=new FormData();form.set('metadata',JSON.stringify({runId:config.runId,provider:p.id,gameId:game.id,shotId,sessionId,item:captured.info,...(plan?{revision:plan.revision,commandId:plan.action.id,actionApplied:captured.reviewOutcome?.actionApplied!==false}:{})}));
     form.set('image',new Blob([captured.image],{type:'image/jpeg'}),'pending.jpg');
     const review=(await cloud.call('/v1/capture-reviews',{method:'POST',role:'ingest',body:form})).review;
     Object.assign(row,{result:'awaiting-gpt',reviewId:review.id,revision:review.revision,imageSha256:review.imageSha256,bytes:captured.image.length});continue;
    }
    const item=await cloud.uploadCapture(captured.info,captured.image);
    const {item:stored,image,imageSha256:hash}=await verifyStoredCapture(cloud,item.id,{image:captured.image});
    Object.assign(row,{result:'stored',itemId:item.id,bytes:image.length,imageSha256:hash,width:stored.width,height:stored.height,state:stored.state,mode:stored.mode,d1Verified:true,r2Verified:true});
    if(process.env.PILOT_OUTPUT_DIR){await fs.mkdir(process.env.PILOT_OUTPUT_DIR,{recursive:true});await fs.writeFile(path.join(process.env.PILOT_OUTPUT_DIR,p.id+'-'+game.id+'.jpg'),image);}
   }catch(error){row.result='error';row.error=safeError(error);if(providerAccessDenied(error)){row.providerBlocked=true;break;}}
   finally{
    if(lease)await cloud.releaseSession(lease,workerId);
    row.finishedAt=new Date().toISOString();report.attempts.push(row);await save();console.log('PILOT_RESULT '+JSON.stringify(row));
   }
  }}finally{
   await cloud.configurePolicy(p.id,previous?{enabled:previous.enabled,minStartIntervalMs:previous.minStartIntervalMs,maxActive:previous.maxActive}:{enabled:false,minStartIntervalMs:20000,maxActive:1});
  }
 }));
  for(const result of settled)if(result.status==='rejected')report.failures.push(safeError(result.reason));
 }
}finally{
 await browser.close();report.finishedAt=new Date().toISOString();report.stats=await cloud.stats(config.runId);
 report.finalPolicies=(await cloud.policies()).policies.map(x=>({provider:x.provider,enabled:x.enabled}));await save();
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## Bounded provider pilot\n\n| Provider | Game | Result |\n|---|---|---|\n'+report.attempts.map(x=>`| ${x.provider} | ${x.gameId} | ${x.result}: ${x.error||x.itemId||''} |`).join('\n')+'\n');
}
console.log('PILOT_SUMMARY '+JSON.stringify({attempts:report.attempts.length,stored:report.attempts.filter(x=>x.result==='stored').length,awaitingGpt:report.attempts.filter(x=>x.result==='awaiting-gpt').length,errors:report.attempts.filter(x=>x.result==='error').length}));
if(report.failures.length||report.attempts.some(x=>x.result==='error'))process.exitCode=1;
