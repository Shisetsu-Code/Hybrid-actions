import {selectVisibleImportedSurface} from './imported-surface.mjs';
import {prepareKAPublicTransport} from './tester-spin-http.mjs';
import {waitForGameCapture} from './capture-delay.mjs';
import {validatedScreenshot} from './capture-validator.mjs';
import {clearCaptureCookies,clickCaptureIntro} from './capture-cleanup.mjs';
// One read-only public DEMO capture using a *shared* Chromium instance.
// Six slots on a runner = six isolated browser contexts, not six Chromium launches.
import {providerForUrl} from './config.mjs';
import {TESTER_SPIN_LAUNCHER,guardImportedNavigation,openImportedDemo,isImportedRuntime,isImportedRuntimeFrame,dismissImportedSiteOverlays} from './tester-spin.mjs';
import {capturePlayngoMobile,discoverPlayngo} from './playngo.mjs';
import {captureAmusnetDemo,discoverAmusnet} from './amusnet.mjs';

export async function capturePublicDemo(browser,engine,job,{
 config,runId,waitMs=25000,confirmAdult=false,confirmAge21=false,runnerId='runner',captureWait=waitForGameCapture,createKATransport=prepareKAPublicTransport,validateScreenshot,captureScreenshots=validatedScreenshot
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
 if(job.provider==='playngo')return capturePlayngoMobile(browser,engine,job,{config,runId,waitMs,runnerId,captureWait,validateScreenshot,captureScreenshots});
 if(job.provider==='amusnet')return captureAmusnetDemo(browser,engine,job,{config,runId,waitMs,confirmAdult,runnerId,captureWait,validateScreenshot,captureScreenshots});

 const expectedOrigin=new URL(game.url).origin;
 let kaTransport,context,recorder;
 let recorded=false,phase='navigation',blockedStatus=0,failedOaksUrl;
 try{
  kaTransport=imported&&job.provider==='ka_gaming'?await createKATransport():null;
  context=await browser.newContext({...kaTransport?.contextOptions,
   viewport:{width:1280,height:720},serviceWorkers:'block',acceptDownloads:false});
  if(imported){
   context.on('response',response=>{
    if([403,429].includes(response.status())&&isImportedRuntime(job.provider,response.url(),game))blockedStatus=response.status();
   });
   context.on('requestfailed',request=>{
    const u=new URL(request.url());
    if(job.provider==='3oaks'&&u.protocol==='https:'&&u.hostname==='betman-demo.head.3oaks.com'&&u.pathname.startsWith('/betman-demo/gs/'+game.symbol+'/desktop/')&&u.pathname.endsWith('/demo/'))failedOaksUrl=request.url();
   });
  }
  recorder=engine.har.createNetworkRecorder(context,{maxEntries:250,maxFrames:60});
  if(kaTransport)await kaTransport.install(context);
  if(imported)await guardImportedNavigation(context,job.provider,game.url,game);
  let page=await context.newPage();
  page.setDefaultNavigationTimeout(45000);
  const response=await page.goto(game.url,{waitUntil:'domcontentloaded',timeout:45000});
  if(!response||response.status()>=400)throw Error('public DEMO HTTP '+(response?.status()||'unavailable'));
  if(imported){
   if(page.url().replace(/\/$/,'')!==game.url.replace(/\/$/,'')&&!isImportedRuntime(job.provider,page.url(),game))throw Error('imported DEMO redirected outside provider contract');
   phase='launch';
   page=await openImportedDemo(page,job.provider,game,{engine,confirmAdult,confirmAge21});
  }else{
   if(new URL(page.url()).origin!==expectedOrigin)throw Error('demo redirected outside approved origin');
   await engine.intro.openPublicDemo(page,{provider:job.provider,url:game.url,confirmAdult});
  }
  phase='frame inspection';
  const gameStartedAt=Date.now();
  await captureWait(gameStartedAt,{waitMs,provider:job.provider});
  let inspected=await engine['select-frame'].bestFrame(page,job.provider);
  if(!inspected)throw Error('no game iframe or DOM surface');
  if(captureScreenshots===validatedScreenshot&&job.provider==='pragmatic'&&inspected.data.state==='INTRO'){
   const intro=await engine.intro.dismissKnownIntro(page,inspected,{
    inspect:()=>engine['select-frame'].bestFrame(page,job.provider)});
   inspected=intro.selected;
  }
  if(!imported||new URL(game.url).hostname==='www.pragmaticplay.fun')
   await engine.intro.dismissCatalogueOverlays(page,{provider:job.provider,url:game.url,
    confirmAdult,graceMs:450,requireClear:true});
  if(imported)await dismissImportedSiteOverlays(page,job.provider);
  inspected=await engine['select-frame'].bestFrame(page,job.provider);
  if(!inspected)throw Error('no frame after removing catalogue overlays');
  if(imported){
   if(!blockedStatus&&failedOaksUrl){
    try{const check=await context.request.get(failedOaksUrl,{timeout:10000});if([403,429].includes(check.status()))blockedStatus=check.status();}catch{}
   }
   if(blockedStatus)throw Error('Provider DEMO HTTP '+blockedStatus+' (access denied or rate limited)');
   let visible=await selectVisibleImportedSurface(page,engine,job.provider,game);
   if(!visible){
    const extended=job.provider==='yggdrasil'?60000:job.provider==='3oaks'?45000:35000;
    await captureWait(gameStartedAt,{waitMs:Math.max(waitMs+10000,extended),provider:job.provider});
    await dismissImportedSiteOverlays(page,job.provider);
    visible=await selectVisibleImportedSurface(page,engine,job.provider,game);
   }
   if(visible)inspected=visible;
  }
  if(imported&&!await isImportedRuntimeFrame(job.provider,inspected.frame,game))throw Error('Tester Spin DEMO launch did not expose a game runtime');
  if(imported){
   const visibleCanvas=await inspected.frame.locator('canvas:visible').count()>0;
   if(!visibleCanvas&&!(inspected.data.mode!=='visual'&&inspected.data.candidates?.length))
    throw Error('Tester Spin runtime has no visible game surface');
  }
  phase='screenshot';
  let shot;
  const {image,validation}=await captureScreenshots(async()=>{
   if(validateScreenshot)await clearCaptureCookies(page);
   if(imported)await dismissImportedSiteOverlays(page,job.provider);
   if(!imported||new URL(game.url).hostname==='www.pragmaticplay.fun')
    await engine.intro.dismissCatalogueOverlays(page,{provider:job.provider,url:game.url,confirmAdult,graceMs:450,requireClear:true});
   inspected=(imported?await selectVisibleImportedSurface(page,engine,job.provider,game):null)||await engine['select-frame'].bestFrame(page,job.provider);
   if(!inspected)throw Error('game surface disappeared during cleanup');
   if(imported&&!await isImportedRuntimeFrame(job.provider,inspected.frame,game))throw Error('cleanup selected a foreign game frame');
   shot=await engine['select-frame'].screenshotBox(page,inspected.frame);
   return Buffer.from(await page.screenshot({type:'jpeg',quality:67,...(shot.clip?{clip:shot.clip}:{})}));
  },validateScreenshot,{clean:true,advanceIntro:action=>{
   if(!shot.aligned)throw Error('intro requires aligned game screenshot');
   return clickCaptureIntro(page,shot.clip||{x:0,y:0,...page.viewportSize()},action);
  }});
  const {har,summary}=await recorder.finish();
  recorded=true;
  const cands=shot.aligned?inspected.data.candidates||[]:[];
  const mode=!shot.aligned||!cands.length?'visual':inspected.data.mode;
  const width=Math.round(shot.clip?.width||page.viewportSize().width);
  const height=Math.round(shot.clip?.height||page.viewportSize().height);
  const info={runId,provider:job.provider,gameId:game.id,shotId:'base',
   state:validation?(validation.status==='intro'?'INTRO':'BASE'):inspected.data.state,mode,adapter:shot.aligned?inspected.data.adapter:'unaligned-frame',
   adapterVersion:inspected.data.adapterVersion||'1',
   candidates:cands,width,height,metadata:{url:game.url,
    source:'github-actions-catalogue',...(imported?{launcher:TESTER_SPIN_LAUNCHER}:{}),runnerId:String(runnerId).slice(0,64),
    frameAligned:shot.aligned,opaqueCanvas:Boolean(inspected.data.metadata?.opaqueCanvas),
    ...(validation?{captureValidation:validation}:{}),capturedAt:new Date().toISOString(),networkDiagnostics:{format:'sanitized-har-1.2',
     summary}}};
  // Never forward a raw HAR, cookies, accounts, or browser storage. The
  // diagnostics summary contains only redacted routes and action names.
  void har;
  return {info,image};
 }catch(error){
  if(imported)throw Error('Tester Spin DEMO '+phase+' failed',{cause:error});
  throw error;
 }finally{
  if(!recorded&&recorder)await recorder.finish().catch(()=>{});
  kaTransport?.close();
  if(context)await context.close().catch(()=>{});
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
