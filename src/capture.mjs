import {waitForGameCapture} from './capture-delay.mjs';
// One read-only public DEMO capture using a *shared* Chromium instance.
// Six slots on a runner = six isolated browser contexts, not six Chromium launches.
import {providerForUrl} from './config.mjs';
import {TESTER_SPIN_LAUNCHER,guardImportedNavigation,openImportedDemo,isImportedRuntime} from './tester-spin.mjs';
import {capturePlayngoMobile,discoverPlayngo} from './playngo.mjs';
import {captureAmusnetDemo,discoverAmusnet} from './amusnet.mjs';

export async function capturePublicDemo(browser,engine,job,{
 config,runId,waitMs=25000,confirmAdult=false,runnerId='runner',captureWait=waitForGameCapture
}={}){
 let game=job.payload?.game;
 if(!game||game.provider!==job.provider||game.id!==job.subject)
  throw Error('catalogue ticket identity mismatch');
 const provider=providerForUrl(config,job.provider,game.url);
 const imported=provider.launcher===TESTER_SPIN_LAUNCHER;
 if(imported){
  const known=provider.games.find(row=>row.id===game.id);
  if(!known||known.url!==game.url||(known.symbol||'')!==(game.symbol||''))throw Error('imported DEMO ticket does not match configured game');
  game={...known,provider:job.provider};
 }
 if(job.provider==='playngo')return capturePlayngoMobile(browser,engine,job,{config,runId,waitMs,runnerId,captureWait});
 if(job.provider==='amusnet')return captureAmusnetDemo(browser,engine,job,{config,runId,waitMs,confirmAdult,runnerId,captureWait});

 const expectedOrigin=new URL(game.url).origin;
 const context=await browser.newContext({
  viewport:{width:1280,height:720},serviceWorkers:'block',acceptDownloads:false});
 const recorder=engine.har.createNetworkRecorder(context,{maxEntries:250,maxFrames:60});
 let recorded=false,phase='navigation';
 try{
  if(imported)await guardImportedNavigation(context,job.provider,game.url,game);
  let page=await context.newPage();
  page.setDefaultNavigationTimeout(45000);
  const response=await page.goto(game.url,{waitUntil:'domcontentloaded',timeout:45000});
  if(!response||response.status()>=400)throw Error('public DEMO returned HTTP error');
  if(imported){
   if(page.url()!==game.url&&!isImportedRuntime(job.provider,page.url(),game))throw Error('imported DEMO redirected outside provider contract');
   phase='launch';
   page=await openImportedDemo(page,job.provider,game,{engine,confirmAdult});
  }else{
   if(new URL(page.url()).origin!==expectedOrigin)throw Error('demo redirected outside approved origin');
   await engine.intro.openPublicDemo(page,{provider:job.provider,url:game.url,confirmAdult});
  }
  phase='frame inspection';
  const gameStartedAt=Date.now();
  await captureWait(gameStartedAt,{waitMs,provider:job.provider});
  let inspected=await engine['select-frame'].bestFrame(page,job.provider);
  if(!inspected)throw Error('no game iframe or DOM surface');
  if(job.provider==='pragmatic'&&inspected.data.state==='INTRO'){
   const intro=await engine.intro.dismissKnownIntro(page,inspected,{
    inspect:()=>engine['select-frame'].bestFrame(page,job.provider)});
   inspected=intro.selected;
  }
  if(!imported||new URL(game.url).hostname==='www.pragmaticplay.fun')
   await engine.intro.dismissCatalogueOverlays(page,{provider:job.provider,url:game.url,
    confirmAdult,graceMs:450,requireClear:true});
  inspected=await engine['select-frame'].bestFrame(page,job.provider);
  if(!inspected)throw Error('no frame after removing catalogue overlays');
  if(imported&&!isImportedRuntime(job.provider,inspected.frame.url(),game))throw Error('Tester Spin DEMO launch did not expose a game runtime');
  if(imported){
   const canvases=inspected.frame.locator('canvas');
   let visibleCanvas=false;
   for(let i=0;i<Math.min(await canvases.count(),8);i++){
    if(await canvases.nth(i).isVisible()){visibleCanvas=true;break;}
   }
   if(!visibleCanvas&&!(inspected.data.mode!=='visual'&&inspected.data.candidates?.length))
    throw Error('Tester Spin runtime has no visible game surface');
  }
  phase='screenshot';
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
    source:'github-actions-catalogue',...(imported?{launcher:TESTER_SPIN_LAUNCHER}:{}),runnerId:String(runnerId).slice(0,64),
    frameAligned:shot.aligned,opaqueCanvas:Boolean(inspected.data.metadata?.opaqueCanvas),
    capturedAt:new Date().toISOString(),networkDiagnostics:{format:'sanitized-har-1.2',
     summary}}};
  // Never forward a raw HAR, cookies, accounts, or browser storage. The
  // diagnostics summary contains only redacted routes and action names.
  void har;
  return {info,image};
 }catch(error){
  if(imported)throw Error('Tester Spin DEMO '+phase+' failed');
  throw error;
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
