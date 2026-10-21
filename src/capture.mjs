// One read-only public DEMO capture using a *shared* Chromium instance.
// Six slots on a runner = six isolated browser contexts, not six Chromium launches.
import {providerForUrl} from './config.mjs';
import {capturePlayngoMobile,discoverPlayngo} from './playngo.mjs';
import {captureAmusnetDemo,discoverAmusnet} from './amusnet.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function capturePublicDemo(browser,engine,job,{
 config,runId,waitMs=3500,confirmAdult=false,runnerId='runner'
}={}){
 const game=job.payload?.game;
 if(!game||game.provider!==job.provider||game.id!==job.subject)
  throw Error('catalogue ticket identity mismatch');
 providerForUrl(config,job.provider,game.url);
 if(job.provider==='playngo')return capturePlayngoMobile(browser,engine,job,{config,runId,waitMs,runnerId});
 if(job.provider==='amusnet')return captureAmusnetDemo(browser,engine,job,{config,runId,waitMs,confirmAdult,runnerId});
 const expectedOrigin=new URL(game.url).origin;
 const context=await browser.newContext({
  viewport:{width:1280,height:720},serviceWorkers:'block',acceptDownloads:false});
 const recorder=engine.har.createNetworkRecorder(context,{maxEntries:250,maxFrames:60});
 let recorded=false;
 try{
  const page=await context.newPage();
  page.setDefaultNavigationTimeout(45000);
  const response=await page.goto(game.url,{waitUntil:'domcontentloaded',timeout:45000});
  if(!response||response.status()>=400)throw Error('public DEMO returned HTTP error');
  if(new URL(page.url()).origin!==expectedOrigin)throw Error('demo redirected outside approved origin');
  await engine.intro.openPublicDemo(page,{provider:job.provider,url:game.url,confirmAdult});
  await wait(Math.max(500,Math.min(waitMs,15000)));
  let inspected=await engine['select-frame'].bestFrame(page,job.provider);
  if(!inspected)throw Error('no game iframe or DOM surface');
  if(job.provider==='pragmatic'&&inspected.data.state==='INTRO'){
   const intro=await engine.intro.dismissKnownIntro(page,inspected,{
    inspect:()=>engine['select-frame'].bestFrame(page,job.provider)});
   inspected=intro.selected;
  }
  await engine.intro.dismissCatalogueOverlays(page,{provider:job.provider,url:game.url,
   confirmAdult,graceMs:450,requireClear:true});
  inspected=await engine['select-frame'].bestFrame(page,job.provider);
  if(!inspected)throw Error('no frame after removing catalogue overlays');
  const shot=await engine['select-frame'].screenshotBox(page,inspected.frame);
  const image=Buffer.from(await page.screenshot({type:'jpeg',quality:67,
   ...(shot.clip?{clip:shot.clip}:{})}));
  const {har,summary}=await recorder.finish();
  recorded=true;
  const cands=shot.aligned?inspected.data.candidates||[]:[];
  const mode=!shot.aligned||!cands.length?'visual':inspected.data.mode;
  const width=Math.round(shot.clip?.width||page.viewportSize().width);
  const height=Math.round(shot.clip?.height||page.viewportSize().height);
  const info={runId,provider:job.provider,gameId:game.id,shotId:'base',
   state:inspected.data.state,mode,adapter:shot.aligned?inspected.data.adapter:'unaligned-frame',
   adapterVersion:inspected.data.adapterVersion||'1',
   candidates:cands,width,height,metadata:{url:game.url,
    source:'github-actions-catalogue',runnerId:String(runnerId).slice(0,64),
    frameAligned:shot.aligned,opaqueCanvas:Boolean(inspected.data.metadata?.opaqueCanvas),
    capturedAt:new Date().toISOString(),networkDiagnostics:{format:'sanitized-har-1.2',
     summary}}};
  // Never forward a raw HAR, cookies, accounts, or browser storage. The
  // diagnostics summary contains only redacted routes and action names.
  void har;
  return {info,image};
 }finally{
  if(!recorded)await recorder.finish().catch(()=>{});
  await context.close().catch(()=>{});
 }
}
export async function discoverCatalogue(browser,engine,job,{config,cloud,runId}={}){
 if(job.role!=='discovery')throw Error('expected a discovery ticket');
 const source=engine.discover.validateDiscoveryTicket(job);
 const discovered=job.provider==='playngo'?
  await discoverPlayngo(browser,source,{config}):
  job.provider==='amusnet'?
  await discoverAmusnet(browser,source,{config}):
  await engine.discover.discoverPublicDemos(browser,source);
 const batch=[];
 let queued=0,skipped=0;
 for(const game of discovered.games){
  try{providerForUrl(config,game.provider,game.url);}catch{skipped++;continue;}
  batch.push({role:'catalog',provider:game.provider,subject:game.gameId,
   priority:10,payload:{game:{provider:game.provider,id:game.gameId,url:game.url}}});
  if(batch.length===20){
   queued+=(await cloud.enqueue(runId,batch)).inserted;
   batch.length=0;
  }
 }
 if(batch.length)queued+=(await cloud.enqueue(runId,batch)).inserted;
 return {sourceId:source.id,provider:job.provider,found:discovered.games.length,
  queued,skipped};
}
