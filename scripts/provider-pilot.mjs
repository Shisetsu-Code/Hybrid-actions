// Bounded manual pilot: explicit providers, two configured DEMOs each, no discovery.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CloudClient} from '../src/client.mjs';
import {validateConfig} from '../src/config.mjs';
import {loadEngine} from '../src/engine.mjs';
import {capturePublicDemo} from '../src/capture.mjs';
import {testerSpinProviders} from '../src/tester-spin.mjs';

const ids=(process.env.PILOT_PROVIDERS||'belatra,bgaming,ka_gaming,rubyplay,redtiger,yggdrasil,nolimit_city,playtech').split(',');
if(!ids.length||ids.length>13||new Set(ids).size!==ids.length||ids.some(id=>!testerSpinProviders.has(id)))throw Error('Explicit supported pilot providers required');
const shotId=process.env.PILOT_SHOT_ID||'launchfix-v1';
if(!/^[a-z0-9][a-z0-9_.-]{0,48}$/.test(shotId))throw Error('Invalid pilot shot ID');
const raw=JSON.parse(await fs.readFile('config/providers.json','utf8'));
const selected=ids.map(id=>{
 const p=raw.providers.find(p=>p.id===id);
 if(!p?.games?.length)throw Error('No configured DEMO games: '+id);
 return {...p,enabled:true,approved:true,pacing:{minStartIntervalMs:20000,maxActive:1},sources:[],games:p.games.slice(0,2)};
});
const config=validateConfig({runId:raw.runId,providers:selected});
const cloud=new CloudClient({baseUrl:process.env.HYBRID_FUZZER_URL||'https://hybrid-cloud-fuzzer.braian-n-l.workers.dev',reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
const health=await cloud.requireReady(),before=(await cloud.policies()).policies;
const engine=await loadEngine('engine'),browser=await engine.chromium.launch({headless:true});
const report={runId:config.runId,shotId,startedAt:new Date().toISOString(),health,attempts:[]};
let pendingSave=Promise.resolve();
function save(){
 if(!process.env.PILOT_REPORT_FILE)return Promise.resolve();
 const text=JSON.stringify(report,null,2)+'\n';
 return pendingSave=pendingSave.then(()=>fs.writeFile(process.env.PILOT_REPORT_FILE,text));
}
const safeError=error=>String(error?.cause?.cause?.message||error?.cause?.message||error?.message||error)
 .split('\n')[0].replace(/https?:\/\/\S+/g,'[URL]').slice(0,220);
try{
 for(let i=0;i<config.providers.length;i+=3)await Promise.all(config.providers.slice(i,i+3).map(async p=>{
  const previous=before.find(x=>x.provider===p.id),workerId=('pilot-'+(process.env.GITHUB_RUN_ID||'local')+'-'+p.id).slice(0,99);
  try{
   await cloud.configurePolicy(p.id,{enabled:true,minStartIntervalMs:20000,maxActive:1});
   for(const game of p.games){
   const row={provider:p.id,gameId:game.id,startedAt:new Date().toISOString()};let lease;
   try{
    const id=[config.runId,p.id,game.id,shotId].join(':');
    let existing;try{existing=(await cloud.call('/v1/items/'+encodeURIComponent(id))).item;}catch(e){if(e.status!==404)throw e;}
    if(existing){row.result='already-stored';row.itemId=id;continue;}
    const deadline=Date.now()+120000;
    while(!lease&&Date.now()<deadline){
     const x=await cloud.acquire(p.id,config.runId,game.id,workerId);
     if(x.granted)lease=x;else await new Promise(done=>setTimeout(done,Math.min(30000,Math.max(1000,x.retryAfterMs||5000))));
    }
    if(!lease)throw Error('Pilot session permit timeout');
    const captured=await capturePublicDemo(browser,engine,{provider:p.id,subject:game.id,payload:{game:{provider:p.id,...game}}},
     {config,runId:config.runId,confirmAdult:process.env.PILOT_CONFIRM_ADULT==='true',runnerId:workerId});
    captured.info.shotId=shotId;
    const item=await cloud.uploadCapture(captured.info,captured.image);
    const stored=(await cloud.call('/v1/items/'+encodeURIComponent(item.id))).item;
    const response=await fetch(cloud.baseUrl+'/v1/items/'+encodeURIComponent(item.id)+'/image',{
     headers:{Authorization:'Bearer '+process.env.HYBRID_REVIEW_TOKEN},signal:AbortSignal.timeout(40000)});
    if(!response.ok)throw Error('R2 readback HTTP '+response.status);
    const image=Buffer.from(await response.arrayBuffer()),hash=createHash('sha256').update(image).digest('hex');
    if(hash!==stored.imageSha256||hash!==createHash('sha256').update(captured.image).digest('hex')||image[0]!==255||image[1]!==216)throw Error('Cloudflare JPEG integrity mismatch');
    Object.assign(row,{result:'stored',itemId:item.id,bytes:image.length,imageSha256:hash,width:stored.width,height:stored.height,state:stored.state,mode:stored.mode,d1Verified:true,r2Verified:true});
    if(process.env.PILOT_OUTPUT_DIR){await fs.mkdir(process.env.PILOT_OUTPUT_DIR,{recursive:true});await fs.writeFile(path.join(process.env.PILOT_OUTPUT_DIR,p.id+'-'+game.id+'.jpg'),image);}
   }catch(error){row.result='error';row.error=safeError(error);}
   finally{
    if(lease)await cloud.releaseSession(lease,workerId);
    row.finishedAt=new Date().toISOString();report.attempts.push(row);await save();console.log('PILOT_RESULT '+JSON.stringify(row));
   }
  }}finally{
   await cloud.configurePolicy(p.id,previous?{enabled:previous.enabled,minStartIntervalMs:previous.minStartIntervalMs,maxActive:previous.maxActive}:{enabled:false,minStartIntervalMs:20000,maxActive:1});
  }
 }));
}finally{
 await browser.close();report.finishedAt=new Date().toISOString();report.stats=await cloud.stats(config.runId);
 report.finalPolicies=(await cloud.policies()).policies.map(x=>({provider:x.provider,enabled:x.enabled}));await save();
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## Bounded provider pilot\n\n| Provider | Game | Result |\n|---|---|---|\n'+report.attempts.map(x=>`| ${x.provider} | ${x.gameId} | ${x.result}: ${x.error||x.itemId||''} |`).join('\n')+'\n');
}
console.log('PILOT_SUMMARY '+JSON.stringify({attempts:report.attempts.length,stored:report.attempts.filter(x=>x.result==='stored').length,errors:report.attempts.filter(x=>x.result==='error').length}));
if(report.attempts.some(x=>x.result==='error'))process.exitCode=1;
