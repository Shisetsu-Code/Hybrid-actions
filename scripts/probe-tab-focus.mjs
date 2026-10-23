// Bounded diagnostic through the real catalogue capture path. No spins, purchases,
// classification changes or D1 policy writes. Images stay in private R2.
import fs from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {CloudClient} from '../src/client.mjs';
import {loadEngine} from '../src/engine.mjs';
import {capturePublicDemo} from '../src/capture.mjs';
import {buildPilotPlan} from '../src/pilot-plan.mjs';
import {validateConfig} from '../src/config.mjs';
import {validateCapturedImage} from '../src/capture-validator.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('GitHub Actions only');
const provider=process.env.FOCUS_PROVIDER;
const realBackground=process.env.FOCUS_REAL_BACKGROUND==='true';
if(!['pragmatic','bgaming'].includes(provider))throw Error('Unsupported focus diagnostic provider');
const runId='focus-'+process.env.GITHUB_RUN_ID+'-'+provider;
const raw=JSON.parse(await fs.readFile('config/batches/catalog-300-20261021.json','utf8'));
const config=validateConfig(buildPilotPlan(raw,{providers:[provider],limit:1,runId,verifiedOnly:true}));
const game=config.providers[0].games[0];
const cloud=new CloudClient({baseUrl:process.env.HYBRID_FUZZER_URL,reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
const health=await cloud.requireReady();
const policies=(await cloud.policies()).policies;
if(policies.some(p=>p.provider===provider&&p.enabled))throw Error('Provider fleet enabled; refusing overlapping diagnostic');
const engine=await loadEngine('engine');
const report={runId,provider,gameId:game.id,realBackground,health,engineSha:'a41ceed63900a6a778c6e864e0ec8e7fe44a9e9d',trials:[]};
const clean=e=>String(e.cause?.cause?.message||e.cause?.message||e.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,250);
// Instrumentation observes real browser visibility without spoofing it.
const install=()=>{
 const probe={raf:0,ticks:0,visibilityChanges:0,focusChanges:0};
 Object.defineProperty(window,'__focusProbe',{value:probe});
 const tick=()=>{probe.raf++;requestAnimationFrame(tick);};requestAnimationFrame(tick);
 setInterval(()=>probe.ticks++,1000);
 document.addEventListener('visibilitychange',()=>probe.visibilityChanges++);
 addEventListener('focus',()=>probe.focusChanges++);addEventListener('blur',()=>probe.focusChanges++);
};
let lastStart=0;
for(const headless of (realBackground?[false]:[true,false])){
 const browser=await engine.chromium.launch({headless});
 try{
  for(const condition of ['foreground','background','restore-focus']){
   const spacing=Math.max(20000,policies.find(p=>p.provider===provider)?.minStartIntervalMs||20000);
   await sleep(Math.max(0,spacing-(Date.now()-lastStart)));lastStart=Date.now();
   const row={headless,condition,samples:[],images:[]};report.trials.push(row);
   let context,coverContext,coverPage,gamePage;
   const sample=async label=>{
    const frames=[];
    for(const [index,frame] of (gamePage?.frames()||[]).entries()){
     const value=await frame.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus(),...window.__focusProbe,canvas:document.querySelectorAll('canvas').length})).catch(()=>({detached:true}));
     frames.push({index,...value});
    }
    row.samples.push({label,elapsedMs:Date.now()-lastStart,frames});
   };
   const save=async(label,image)=>{
    const info={runId,provider,gameId:game.id};
    const validation=await validateCapturedImage(cloud,info,image,{store:false});
    // Store the original JPEG, so visual audit is not limited to OCR annotations.
    const metadata={runId,provider,gameId:game.id,validatorVersion:'focus-probe-1',status:'uncertain',reasons:['focus-diagnostic'],anchors:[],sourceImageSha256:createHash('sha256').update(image).digest('hex')};
    const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('image',new Blob([image],{type:'image/jpeg'}),'focus.jpg');
    const saved=await cloud.call('/v1/validation-reports',{method:'POST',role:'ingest',body:form});
    row.images.push({label,reportId:saved.report.id,status:validation.status,reasons:validation.reasons});
   };
   const wrapped={newContext:async options=>{
    context=await browser.newContext(options);await context.addInitScript(install);
    context.on('page',p=>{gamePage=p;});
    return context;
   }};
   try{
    coverContext=await browser.newContext();coverPage=await coverContext.newPage();
    await coverPage.setContent('<title>Focus control</title><h1>Diagnostic foreground tab</h1>');
    await capturePublicDemo(wrapped,engine,{provider,subject:game.id,payload:{game:{provider,...game}}},{
     config,runId,confirmAdult:process.env.PILOT_CONFIRM_ADULT==='true',runnerId:runId,
     captureWait:async()=>{
      // The launcher may have opened a popup; use its latest actual page.
      gamePage=context.pages().at(-1);
      if(realBackground){
       // Positive control: Playwright normally forces focus/visibility for every
       // page. Disable that CDP emulation only here and use a sibling tab.
       const runtime=gamePage;
       const session=await context.newCDPSession(runtime);
       await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});
       await coverContext.close();coverContext=null;
       coverPage=await context.newPage();
       await coverPage.setContent('<title>Real background control</title>Focus control');
       const coverSession=await context.newCDPSession(coverPage);
       await coverSession.send('Emulation.setFocusEmulationEnabled',{enabled:false});
       gamePage=runtime;
      }
      if(condition==='foreground')await gamePage.bringToFront();else await coverPage.bringToFront();
      await sample('runtime-start');
      for(let i=1;i<=3;i++){await sleep(10000);await sample('wait-'+i*10+'s');}
      if(condition==='restore-focus'){
       const selected=await engine['select-frame'].bestFrame(gamePage,provider);
       const box=await engine['select-frame'].screenshotBox(gamePage,selected.frame);
       await save('background-30s',await gamePage.screenshot({type:'jpeg',quality:67,...(box.clip?{clip:box.clip}:{})}));
       await sample('after-background-screenshot');
       await gamePage.bringToFront();await sample('focus-restored');
       for(let i=1;i<=3;i++){await sleep(10000);await sample('restored-'+i*10+'s');}
      }
     },
     captureScreenshots:async snapshot=>{
      await sample('before-final-screenshot');const image=await snapshot();
      await sample('after-final-screenshot');await save('final',image);return {image};
     }
    });row.outcome='captured';
   }catch(e){row.outcome='error';row.error=clean(e);}
   finally{
    await context?.close().catch(()=>{});await coverContext?.close().catch(()=>{});
    await fs.writeFile('focus-probe-'+provider+'.json',JSON.stringify(report,null,2));
    console.log('FOCUS_TRIAL '+JSON.stringify(row));
   }
  }
 }finally{await browser.close();}
}
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## Focus diagnostic: '+provider+'\n\n'+report.trials.map(r=>'- '+(r.headless?'headless':'headed')+' / '+r.condition+': '+r.outcome+' '+r.images.map(i=>i.label+'='+i.status).join(', ')+(r.error?' '+r.error:'')).join('\n')+'\n\nOriginal JPEGs are private R2 validation previews. No catalogue records were modified.\n');
