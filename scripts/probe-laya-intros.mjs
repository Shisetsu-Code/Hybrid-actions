import fs from 'node:fs/promises';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';import readline from 'node:readline';
import {CloudClient} from '../src/client.mjs';import {loadEngine} from '../src/engine.mjs';import {capturePublicDemo} from '../src/capture.mjs';import {buildPilotPlan,verifiedProviders} from '../src/pilot-plan.mjs';import {validateConfig} from '../src/config.mjs';import {probeIntro} from '../src/laya-intro-probe.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('GitHub-hosted Actions only');
const raw=JSON.parse(await fs.readFile('config/batches/catalog-300-20261021.json','utf8'));
const config=validateConfig(buildPilotPlan(raw,{providers:verifiedProviders,limit:1,runId:process.env.PILOT_RUN_ID,verifiedOnly:true}));
const cloud=new CloudClient({baseUrl:process.env.HYBRID_FUZZER_URL,reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
await cloud.requireReady();const policies=(await cloud.policies()).policies;
if(policies.some(p=>verifiedProviders.includes(p.provider)&&p.enabled))throw Error('Another provider execution may be active');
const child=spawn('python',['scripts/laya-intro.py'],{stdio:['pipe','pipe','pipe'],env:{...process.env,OMP_THREAD_LIMIT:'1'},windowsHide:true});
child.stderr.on('data',()=>{});let sequence=0;const pending=new Map();
readline.createInterface({input:child.stdout}).on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(Error('Laya analysis '+data.error)):task.resolve(data.result);});
child.on('exit',()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('Laya process exited'));}pending.clear();});
const rpc=payload=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Laya analysis timeout'));},180000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,...payload})+'\n');});
const analyze=image=>rpc({image:image.toString('base64')});
const report={runId:config.runId,executor:'github-hosted',purpose:'intro-only diagnostic; no classification ingest or balance requirement',providers:[]};
const engine=await loadEngine('engine');const browser=await engine.chromium.launch({headless:true});
const clean=error=>String(error.cause?.cause?.message||error.cause?.message||error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,250);
try{
 for(const p of config.providers){
  const game=p.games[0],owner='laya-probe-'+process.env.GITHUB_RUN_ID+'-'+p.id,previous=policies.find(x=>x.provider===p.id);let lease;
  const row={provider:p.id,gameId:game.id};
  try{
   await cloud.configurePolicy(p.id,{enabled:true,minStartIntervalMs:20000,maxActive:1});
   lease=await cloud.acquire(p.id,config.runId,game.id,owner);if(!lease.granted)throw Error('Provider busy');
   await capturePublicDemo(browser,engine,{provider:p.id,subject:game.id,payload:{game:{provider:p.id,...game}}},{config,runId:config.runId,runnerId:owner,confirmAdult:process.env.PILOT_CONFIRM_ADULT==='true',confirmAge21:process.env.PILOT_CONFIRM_AGE_21==='true',validateScreenshot:()=>{throw Error('diagnostic must not invoke catalogue gate');},
    captureScreenshots:async(snapshot,_validate,options)=>{
     const result=await probeIntro(snapshot,analyze,{advanceIntro:options.advanceIntro,verifyCurrent:async(image,action)=>rpc({image:(await snapshot()).toString('base64'),verify:{before:image.toString('base64'),rect:action.rect}}),save:async(image,step)=>{
      const metadata={runId:config.runId,provider:p.id,gameId:game.id,validatorVersion:'laya-probe-1',status:'uncertain',reasons:['laya-intro-observation-'+step],anchors:[],sourceImageSha256:createHash('sha256').update(image).digest('hex')};
      const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('image',new Blob([image],{type:'image/jpeg'}),'observation.jpg');return (await cloud.call('/v1/validation-reports',{method:'POST',role:'ingest',body:form})).report.id;
     }});Object.assign(row,result.probe);return {image:result.image};
    }});
  }catch(error){row.outcome='error';row.error=clean(error);}
  finally{
   if(lease?.granted)await cloud.releaseSession(lease,owner);
   await cloud.configurePolicy(p.id,previous?{enabled:previous.enabled,minStartIntervalMs:previous.minStartIntervalMs,maxActive:previous.maxActive}:{enabled:false,minStartIntervalMs:20000,maxActive:1});
   report.providers.push(row);await fs.writeFile('laya-intro-probe.json',JSON.stringify(report,null,2));
   console.log(JSON.stringify({provider:p.id,gameId:game.id,outcome:row.outcome,clicks:row.clicks?.length||0,error:row.error}));
  }
 }
}finally{await browser.close();child.kill();report.finalPolicies=(await cloud.policies()).policies.map(({provider,enabled})=>({provider,enabled}));report.finishedAt=new Date().toISOString();await fs.writeFile('laya-intro-probe.json',JSON.stringify(report,null,2));}
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## Laya entry-only probe\n\n'+report.providers.map(p=>`- ${p.provider}: ${p.outcome}; clicks=${p.clicks?.length||0}; ${p.error||''}`).join('\n')+'\n\nBefore/after images are private R2 diagnostics. No classifications or catalogue images were changed.\n');
