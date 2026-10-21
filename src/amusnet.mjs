// Amusnet: publicly published English catalogue and read-only Play Demo iframe.
// No wager/spin, raw HAR, /api/lobby body, session token, or iframe URL in output.
import {providerForUrl} from './config.mjs';
import {acceptKnownPublicDemoOverlays} from './consent.mjs';

const site='https://amusnet.com';
const api='https://backend.careers-amusnet.com/jsonapi/node/game';
const gamePath=/^\/games\/online-casino\/[a-z0-9-]+$/;
const slug=/^[a-z0-9][a-z0-9-]{0,100}$/;
const hosts=new Set(['free-pod.games.amusnet.io','free.games.amusnet.io']);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function normalizeAmusnetGame(record){
 const a=record?.attributes;
 if(!a||a.field__don_t_show_play_demo_butt!==false)return null;
 const id=String(a.field_game_gin??'');
 const alias=a.path?.alias;
 if(!/^\d{1,12}$/.test(id)||typeof alias!=='string'||!/^\/[a-z0-9-]+$/.test(alias)||
    !slug.test(alias.slice(1)))return null;
 return {provider:'amusnet',gameId:id,url:site+'/games/online-casino'+alias};
}
export async function discoverAmusnet(browser,source,{config,maxPages=20,pauseMs=650}={}){
 if(source?.provider!=='amusnet'||source?.approved!==true||source?.verifiedDemo!==true||
   source?.enabled!==true||source.gameUrlPrefix!==site+'/games/online-casino/')
  throw Error('Amusnet public-DEMO catalogue is not approved');
 providerForUrl(config,'amusnet',site+'/games/online-casino/verified-demo');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>25)throw Error('invalid Amusnet page limit');
 const ctx=await browser.newContext({serviceWorkers:'block'});
 const seen=new Map();let pages=0,complete=false,scanned=0,total=null,variants=0;
 try{
  for(let offset=0;pages<maxPages;offset+=50){
   const q=new URLSearchParams();
   q.set('filter[status][value]','1');
   q.set('filter[langcode][value]','en');
   q.set('fields[node--game]','title,path,field_game_gin,field__don_t_show_play_demo_butt');
   q.set('page[limit]','50');q.set('page[offset]',String(offset));
   const response=await ctx.request.get(api+'?'+q,{timeout:30000});
   if(response.status()!==200)throw Error('Amusnet public JSON:API HTTP '+response.status());
   const json=await response.json();
   if(!Array.isArray(json.data)||json.data.length>50)throw Error('invalid Amusnet JSON:API page');
   if(total===null&&Number.isSafeInteger(Number(json.meta?.count))){
    total=Number(json.meta.count);
    if(total<0||total>5000)throw Error('invalid Amusnet total count');
   }
   for(const record of json.data){
    const game=normalizeAmusnetGame(record);
    if(!game)continue;
    providerForUrl(config,'amusnet',game.url);
    const prior=seen.get(game.gameId);
    // The public catalogue contains different slugs for a shared game GIN.
    // D1 ticket identity is provider+gameId, so keep the first documented
    // official variant and count later aliases without overwriting tickets.
    if(prior&&prior.url!==game.url){variants++;continue;}
    seen.set(game.gameId,game);
   }
   scanned+=json.data.length;pages++;
   if(total!==null&&scanned>=total){complete=true;break;}
   if(json.data.length<50){
    if(total!==null&&scanned<total)throw Error('Amusnet catalogue truncated before reported total');
    complete=true;break;
   }
   if(pauseMs>0)await sleep(Math.min(pauseMs,2500));
  }
 }finally{await ctx.close();}
 if(!complete)throw Error('Amusnet catalogue scan incomplete');
 if(!seen.size)throw Error('no public Amusnet games with an available DEMO');
 return {provider:'amusnet',complete,pages,recordsSeen:scanned,
  totalPublished:total,duplicateGinVariants:variants,games:[...seen.values()]};
}
export async function dismissAmusnetOverlays(page,{confirmAdult=true}={}){
 return acceptKnownPublicDemoOverlays(page,{confirmAdult,graceMs:550,requireClear:true});
}
export async function captureAmusnetDemo(browser,_engine,job,{
 config,runId,waitMs=3500,confirmAdult=true,runnerId='runner'
}={}){
 const game=job.payload?.game;
 if(job.provider!=='amusnet'||game?.provider!=='amusnet'||job.subject!==game.id)
  throw Error('Amusnet capture ticket identity mismatch');
 providerForUrl(config,'amusnet',game.url);
 const u=new URL(game.url);
 if(u.origin!==site||!gamePath.test(u.pathname))throw Error('unapproved Amusnet public game detail');
 const ctx=await browser.newContext({viewport:{width:1280,height:800},
  serviceWorkers:'block',acceptDownloads:false});
 try{
  const page=await ctx.newPage();
  page.setDefaultNavigationTimeout(45000);
  const response=await page.goto(game.url,{waitUntil:'domcontentloaded',timeout:45000});
  if(response?.status()!==200||new URL(page.url()).origin!==site||
     !gamePath.test(new URL(page.url()).pathname))
   throw Error('Amusnet official game page unavailable');
  const overlays=await dismissAmusnetOverlays(page,{confirmAdult});
  await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});
  await dismissAmusnetOverlays(page,{confirmAdult});
  const play=page.locator('#play-demo-btn').first();
  await play.waitFor({state:'visible',timeout:15000});
  if(!await play.isVisible())throw Error('Play Demo button is not visible');
  let lobbyStatus=null,lobbyRequested=false;
  page.on('request',r=>{
   const url=new URL(r.url());
   if(url.origin===site&&url.pathname==='/api/lobby'&&r.method()==='POST')
    lobbyRequested=true;
  });
  page.on('response',r=>{
   const url=new URL(r.url());
   if(url.origin===site&&url.pathname==='/api/lobby')lobbyStatus=r.status();
  });
  await play.click({timeout:12000});
  const frameElement=page.locator('.play-popup iframe').first();
  await frameElement.waitFor({state:'attached',timeout:30000});
  const frame=await (await frameElement.elementHandle())?.contentFrame();
  if(!frame)throw Error('Amusnet demo iframe not attached');
  await frame.waitForLoadState('domcontentloaded',{timeout:20000}).catch(()=>{});
  await sleep(Math.max(1000,Math.min(waitMs,8000)));
  const frameUrl=new URL(frame.url());
  if(frameUrl.protocol!=='https:'||!hosts.has(frameUrl.hostname)||
     frameUrl.pathname==='/'&&frameUrl.search==='')
   throw Error('Amusnet demo iframe host or navigation not confirmed');
  if(!lobbyRequested||lobbyStatus!==200)throw Error('Amusnet /api/lobby did not confirm public DEMO launch');
  await frameElement.waitFor({state:'visible',timeout:15000});
  const box=await frameElement.boundingBox();
  if(!box||box.width<160||box.height<140)throw Error('Amusnet visible game area too small');
  const image=Buffer.from(await frameElement.screenshot({type:'jpeg',quality:70,timeout:15000}));
  if(image.length<1600)throw Error('Amusnet demo screenshot unexpectedly small');
  return {image,info:{runId,provider:'amusnet',gameId:game.id,shotId:'base',
   state:'BASE',mode:'visual',adapter:'amusnet-public-demo',adapterVersion:'1',
   candidates:[],width:Math.round(box.width),height:Math.round(box.height),
   metadata:{url:game.url,source:'github-actions-catalogue',
    runnerId:String(runnerId).slice(0,64),frameAligned:true,
    opaqueCanvas:true,capturedAt:new Date().toISOString(),
    networkDiagnostics:{format:'summary-v1',summary:{
     lobbyHttp:lobbyStatus,iframeHost:frameUrl.hostname,
     cookiesAccepted:overlays.cookiesAccepted,ageConfirmed:overlays.ageConfirmed}}}}};
 }finally{await ctx.close();}
}
