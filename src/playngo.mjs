import {validatedScreenshot} from './capture-validator.mjs';
import {waitForGameCapture} from './capture-delay.mjs';
// Official Play'n GO catalogue and read-only mobile practice DEMO adapter.
// Never infer GID from a title/slug; use the official detail-page mobileUrl.
import {providerForUrl} from './config.mjs';
const origin='https://www.playngo.com',launcherHosts=new Set(['released.playngonetwork.com','preview.playngonetwork.com']);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sku=/^\d{1,12}$/,slugPattern=/^[a-z0-9][a-z0-9'-]{0,120}$/i;
function gameRecord(row){
 const id=String(row?.sku||''),slug=String(row?.slug||'');
 if(!sku.test(id)||!slugPattern.test(slug))return null;
 return {provider:'playngo',gameId:id,url:new URL('/games/'+slug,origin).href};
}
export async function discoverPlayngo(browser,source,{config,maxPages=45,pauseMs=500}={}){
 if(source?.provider!=='playngo'||source?.approved!==true||source?.verifiedDemo!==true||
  source?.enabled!==true||source?.gameUrlPrefix!==origin+'/games/')
  throw Error('Playngo source is not operator-approved');
 providerForUrl(config,'playngo',origin+'/games/example');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>60)throw Error('invalid maxPages');
 const ctx=await browser.newContext({serviceWorkers:'block'});
 let offset=0,pages=0,complete=false;const games=new Map();
 try{
  while(pages<maxPages){
   const url=origin+'/api/games?'+new URLSearchParams({offset:String(offset),sort:'date-desc'});
   const response=await ctx.request.get(url,{timeout:30000});
   if(response.status()!==200)throw Error('Playngo catalog HTTP '+response.status());
   const data=await response.json();
   if(!Array.isArray(data.games)||data.games.length>48)throw Error('invalid catalogue JSON');
   for(const item of data.games){
    const game=gameRecord(item);if(!game)continue;
    providerForUrl(config,'playngo',game.url);
    const existing=games.get(game.gameId);
    if(existing&&existing.url!==game.url)throw Error('duplicate SKU maps to different slug');
    games.set(game.gameId,game);
   }
   pages++;
   // The real public API omits nextOffset entirely on the final page
   // (offset=456, count=20 in the verified 476-game catalogue).
   // Never call an omitted nextOffset a cycle; a full page without nextOffset
   // is ambiguous, so fail safely rather than claiming completeness.
   if(data.nextOffset==null){
    if(data.games.length>=24)throw Error('missing nextOffset on full catalogue page');
    complete=true;break;
   }
   const next=Number(data.nextOffset);
   if(!Number.isSafeInteger(next)||next<=offset||next>5000)throw Error('cyclic pagination');
   offset=next;
   if(pauseMs>0)await sleep(Math.min(pauseMs,2500));
  }
 }finally{await ctx.close();}
 if(!complete||games.size===0)throw Error('incomplete or empty Playngo catalogue');
 return {provider:'playngo',games:[...games.values()],pages,complete};
}
export function officialMobileLauncher(html){
 if(typeof html!=='string'||html.length>3000000)throw Error('invalid game HTML');
 const normalized=html.replace(/\\u0026/gi,'&').replace(/&amp;/g,'&')
  .replace(/\\\//g,'/').replace(/\\"/g,'"').replace(/&quot;/g,'"');
 const raw=normalized.match(/"mobileUrl"\s*:\s*"([^"]+)"/i)?.[1]||
  normalized.match(/https:\/\/(?:released|preview)\.playngonetwork\.com\/casino\/ContainerLauncher\?[^"'\s<>]*channel=mobile[^"'\s<>]*/i)?.[0];
 if(!raw)throw Error('official mobileUrl absent from game detail');
 let url;try{url=new URL(raw);}catch{throw Error('invalid mobile demo URL');}
 if(url.protocol!=='https:'||!launcherHosts.has(url.hostname)||url.pathname!=='/casino/ContainerLauncher'||
   url.username||url.password||url.port||url.hash)throw Error('unexpected launcher origin');
 const allowed=new Set(['pid','gid','lang','practice','channel','demo']);
 for(const key of url.searchParams.keys())if(!allowed.has(key))throw Error('launcher has sensitive/unexpected parameter');
 if(!/^\d{1,6}$/.test(url.searchParams.get('pid')||'')||
  !/^[a-z0-9]{2,80}$/i.test(url.searchParams.get('gid')||'')||
  url.searchParams.get('practice')!=='1'||url.searchParams.get('demo')!=='2')
  throw Error('not a public practice demo');
 // Preview HAR used mobi; on GitHub production launcher succeeded with mobile.
 url.searchParams.set('channel','mobile');
 return url;
}
export async function capturePlayngoMobile(browser,engine,job,{config,runId,waitMs=25000,runnerId='runner',captureWait=waitForGameCapture,validateScreenshot}={}){
 const game=job.payload?.game;
 if(job.provider!=='playngo'||game?.provider!=='playngo'||game.id!==job.subject)
  throw Error('invalid Playngo ticket');
 providerForUrl(config,'playngo',game.url);
 if(new URL(game.url).origin!==origin||!new URL(game.url).pathname.startsWith('/games/'))
  throw Error('game detail not on official site');
 const mobile=engine.devices?.['Pixel 7'];
 if(!mobile)throw Error('mobile Playwright device unavailable');
 const ctx=await browser.newContext({...mobile,serviceWorkers:'block',acceptDownloads:false});
 try{
  const page=await ctx.newPage();
  const detail=await page.goto(game.url,{waitUntil:'domcontentloaded',timeout:45000});
  if(detail?.status()!==200||new URL(page.url()).origin!==origin)
   throw Error('official game detail unavailable');
  const launcher=officialMobileLauncher(await page.content());
  const assets={configMobile:0,mobileUI:0,configV2:0,errors:0};let canvases=0;
  page.on('response',r=>{
   const u=new URL(r.url());if(!u.hostname.endsWith('.playngonetwork.com'))return;
   if(r.status()>=400){assets.errors++;return;}
   if(u.pathname.endsWith('config_mobile.json'))assets.configMobile++;
   if(u.pathname.endsWith('ui_mobile_bundle.json')||/_mobile\.bundle\.js$/.test(u.pathname))assets.mobileUI++;
   if(u.pathname==='/configuration/v2')assets.configV2++;
  });
  const gameStartedAt=Date.now();
  const res=await page.goto(launcher.href,{waitUntil:'domcontentloaded',timeout:45000});
  if(res?.status()!==200)throw Error('mobile DEMO launcher HTTP error');
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){
   canvases=await page.evaluate(()=>document.querySelectorAll('canvas').length).catch(()=>0);
   if(canvases>0&&assets.configMobile>0&&assets.mobileUI>0&&assets.configV2>0)break;
   await sleep(2500);
  }
  if(!(canvases>0&&assets.configMobile>0&&assets.mobileUI>0&&assets.configV2>0))
   throw Error('mobile game not initialized; not uploading a misleading screenshot');
  await captureWait(gameStartedAt,{waitMs});
  const {image,validation}=await validatedScreenshot(async()=>Buffer.from(await page.screenshot({type:'jpeg',quality:70,fullPage:false})),validateScreenshot);
  if(image.length<1200)throw Error('screenshot unexpectedly small');
  const viewport=page.viewportSize();
  return {image,info:{runId,provider:'playngo',gameId:game.id,shotId:'base',
   state:validation?.status==='intro'?'INTRO':'BASE',mode:'visual',adapter:'playngo-mobile-public-demo',adapterVersion:'1',
   candidates:[],width:viewport.width,height:viewport.height,
   metadata:{url:game.url,source:'github-actions-catalogue',runnerId:String(runnerId).slice(0,64),
    mobileChannel:'mobile',launcherHost:launcher.hostname,publicGid:launcher.searchParams.get('gid'),
    ...(validation?{captureValidation:validation}:{}),frameAligned:true,opaqueCanvas:true,capturedAt:new Date().toISOString(),
    networkDiagnostics:{format:'summary-v1',summary:{...assets,canvases}}}}};
 }finally{await ctx.close();}
}
