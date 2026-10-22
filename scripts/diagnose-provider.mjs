// Remote-only, bounded public DEMO diagnostic. Never uploads or classifies images.
import fs from 'node:fs/promises';
import {CloudClient} from '../src/client.mjs';
import {validateConfig} from '../src/config.mjs';
import {buildPilotPlan} from '../src/pilot-plan.mjs';
import {loadEngine} from '../src/engine.mjs';
import {capturePublicDemo} from '../src/capture.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('GitHub Actions only');
const provider=process.env.PILOT_PROVIDERS;
const config=validateConfig(buildPilotPlan(JSON.parse(await fs.readFile(process.env.PILOT_CONFIG,'utf8')),{providers:[provider],limit:1}));
const game=config.providers[0].games[0];
const cloud=new CloudClient({baseUrl:process.env.HYBRID_FUZZER_URL,reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
await cloud.requireReady();
const owner='diagnose-'+process.env.GITHUB_RUN_ID+'-'+provider;
const before=(await cloud.policies()).policies.find(x=>x.provider===provider);
const safeUrl=raw=>{try{const u=new URL(raw);return u.origin+u.pathname;}catch{return 'invalid';}};
const clean=s=>String(s).replace(/https?:\/\/\S+/g,'[URL]').slice(0,350);
const diagnostic={provider,gameId:game.id,httpErrors:[],failures:[],frames:[]};
let browser,lease;
try{
 await cloud.configurePolicy(provider,{enabled:true,minStartIntervalMs:20000,maxActive:1});
 lease=await cloud.acquire(provider,config.runId,game.id,owner);
 if(!lease.granted)throw Error('Provider busy; diagnostic deferred');
 const engine=await loadEngine('engine');browser=await engine.chromium.launch({headless:true});
 const wrapped={newContext:async options=>{
  const context=await browser.newContext(options),close=context.close.bind(context);
  context.on('response',r=>{if(r.status()>=400&&diagnostic.httpErrors.length<25)diagnostic.httpErrors.push({url:safeUrl(r.url()),status:r.status()});});
  context.on('requestfailed',r=>{if(diagnostic.failures.length<25)diagnostic.failures.push({url:safeUrl(r.url()),error:clean(r.failure()?.errorText)});});
  context.close=async()=>{try{for(const page of context.pages())for(const frame of page.frames().slice(0,8)){
   diagnostic.frames.push({url:safeUrl(frame.url()),canvas:await frame.locator('canvas').count(),visibleCanvas:await frame.locator('canvas:visible').count(),text:clean(await frame.locator('body').innerText({timeout:1500}).catch(()=>''))});
  }}finally{await close();}};
  return context;
 }};
 const captured=await capturePublicDemo(wrapped,engine,{provider,subject:game.id,payload:{game:{provider,...game}}},{config,runId:config.runId,confirmAdult:process.env.PILOT_CONFIRM_ADULT==='true',runnerId:owner});
 diagnostic.result={state:captured.info.state,bytes:captured.image.length};
}catch(e){diagnostic.error=clean(e.cause?.message||e.message);}
finally{
 await browser?.close();
 if(lease?.granted)await cloud.releaseSession(lease,owner);
 if(before)await cloud.configurePolicy(provider,{enabled:before.enabled,minStartIntervalMs:before.minStartIntervalMs,maxActive:before.maxActive});
 console.log('DEMO_DIAGNOSTIC '+JSON.stringify(diagnostic));
}
