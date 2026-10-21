// Reproducible PUBLIC-DEMO Play'n GO mobile-vs-desktop browser probe.
// Sources: operator's 2026-10-21 playngo.com and preview.playngonetwork.com HARs.
// No spin/buy clicks, no session-token logs, no image/artifact uploads.
import {chromium,devices} from '../engine/node_modules/playwright/index.mjs';

const catalogue='https://www.playngo.com/games';
const released='https://released.playngonetwork.com/casino/ContainerLauncher';
const preview='https://preview.playngonetwork.com/casino/ContainerLauncher';
const results={runner:'github-actions',catalogue:{},tests:[]};
const safeError=e=>String(e?.message||e||'error').replace(/(?:token|ticket|session|auth|secret)=[^\s&]+/gi,'token=REDACTED').slice(0,200);
const summarize=(u)=>{
 try{const url=new URL(u);return {host:url.hostname,path:url.pathname.slice(0,105)};}
 catch{return {host:'unknown',path:''};}
};
const driver=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-web-security=false']});
async function catalogueProbe(){
 const ctx=await driver.newContext({...devices['Pixel 7'],serviceWorkers:'block'});
 try{
  const response=await ctx.request.get('https://www.playngo.com/api/games?sort=date-desc&offset=0',{timeout:25000});
  results.catalogue.apiStatus=response.status();
  if(response.ok()){
   const obj=await response.json();
   results.catalogue.count=Array.isArray(obj.games)?obj.games.length:0;
   results.catalogue.nextOffset=obj.nextOffset??null;
   results.catalogue.sample=Array.isArray(obj.games)?
    obj.games.slice(0,3).map(g=>({sku:String(g.sku||''),slug:String(g.slug||'').slice(0,80)})):[];
  }
  const page=await ctx.newPage();
  const r=await page.goto(catalogue,{waitUntil:'domcontentloaded',timeout:35000});
  results.catalogue.pageStatus=r?.status()||0;
  results.catalogue.title=(await page.title()).slice(0,110);
 }catch(e){results.catalogue.error=safeError(e);}
 finally{await ctx.close();}
}
async function gameProbe(name,base,query,{mobile,expectedGid}={}){
 const ctx=await driver.newContext(mobile?
  {...devices['Pixel 7'],serviceWorkers:'block',acceptDownloads:false}:
  {viewport:{width:1280,height:720},serviceWorkers:'block',acceptDownloads:false});
 const row={name,mobile,queryChannel:query.channel,http:0,elapsedMs:0,requests:[],
  assets:{configMobile:0,mobileBundle:0,desktopBundle:0,gameBundle:0,runtimeJs:0},
  errorStatuses:[],pageErrors:[],requestFailed:[],frames:[],canvases:0,bodyLength:0};
 const start=Date.now();
 try{
  const page=await ctx.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.on('pageerror',e=>{
   if(row.pageErrors.length<5)row.pageErrors.push(String(e.name||'Error').slice(0,70));
  });
  page.on('requestfailed',r=>{
   if(row.requestFailed.length<8){const u=summarize(r.url());row.requestFailed.push({host:u.host,path:u.path});}
  });
  page.on('response',r=>{
   const u=summarize(r.url()),status=r.status();
   if(row.requests.length<35&&
       (/playngonetwork\.com$/.test(u.host)||u.host==='www.playngo.com')&&
       (/configuration|games\/getgamebygid|ContainerLauncher|bundle|main\.js|config_mobile|\.wasm/.test(u.path)))
     row.requests.push({host:u.host,path:u.path,status});
   if(status>=400&&row.errorStatuses.length<12&&/playngonetwork\.com$/.test(u.host))
    row.errorStatuses.push({host:u.host,path:u.path,status});
   if(status>=200&&status<400){
    if(/config_mobile\.json$/.test(u.path))row.assets.configMobile++;
    if(/ui_mobile_bundle\.json$|_mobile\.bundle\.js$/.test(u.path))row.assets.mobileBundle++;
    if(/desktop.*\.bundle\.js$|_desktop\.bundle\.js$/.test(u.path))row.assets.desktopBundle++;
    if(/\/game_bundle\.json$/.test(u.path))row.assets.gameBundle++;
    if(/\/PlayerUI\/main\.js$|container-launcher\/.*\.js$/.test(u.path))row.assets.runtimeJs++;
   }
  });
  const url=new URL(base);
  // Public documented practice/demo launch only; no credentials/tickets.
  for(const [k,v] of Object.entries(query))url.searchParams.set(k,String(v));
  const main=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
  row.http=main?.status()||0;
  row.landHost=new URL(page.url()).hostname;
  row.landPath=new URL(page.url()).pathname;
  row.userAgentMobile=(await page.evaluate(()=>navigator.userAgent)).includes('Mobile');
  row.touch=await page.evaluate(()=>navigator.maxTouchPoints);
  for(let i=0;i<6;i++){
   await page.waitForTimeout(5000);
   const configs=row.assets.configMobile+row.assets.mobileBundle+row.assets.gameBundle;
   const desktopRuntime=row.assets.runtimeJs+row.assets.desktopBundle;
   if((mobile&&configs>=2)||(!mobile&&desktopRuntime>=2))break;
  }
  row.frames=await Promise.all(page.frames().slice(0,8).map(async frame=>{
   const u=summarize(frame.url());
   let canvases=0,textSize=0,gameRoot=false;
   try{
    const signal=await frame.evaluate(()=>({
     canvases:document.querySelectorAll('canvas').length,
     textSize:(document.body?.innerText||'').length,
     gameRoot:Boolean(document.querySelector('canvas, #game, [id*=gameContainer], [id*=game-canvas]'))
    }));
    canvases=signal.canvases;textSize=signal.textSize;gameRoot=signal.gameRoot;
   }catch{}
   return {host:u.host,path:u.path,canvases,textSize,gameRoot};
  }));
  row.canvases=row.frames.reduce((n,f)=>n+f.canvases,0);
  row.bodyLength=row.frames.reduce((n,f)=>n+f.textSize,0);
  row.expectedGid=expectedGid; // a non-secret game identifier
  row.mobileAssetsSeen=row.assets.configMobile>0 || row.assets.mobileBundle>0;
  row.runtimeEvidence=row.canvases>0||row.assets.gameBundle>0||
   (row.assets.configMobile>0&&row.assets.mobileBundle>0);
  row.launchEvidence=row.http===200&&row.runtimeEvidence;
 }catch(e){row.error=safeError(e);}
 finally{row.elapsedMs=Date.now()-start;results.tests.push(row);await ctx.close();}
}
try{
 await catalogueProbe();
 await gameProbe('public-production-mobile',released,{
  pid:'2',gid:'amuletofdead',lang:'en_GB',practice:'1',channel:'mobi',demo:'2'
 },{mobile:true,expectedGid:'amuletofdead'});
 await gameProbe('public-production-desktop-baseline',released,{
  pid:'2',gid:'amuletofdead',lang:'en_GB',practice:'1',channel:'desktop',demo:'2'
 },{mobile:false,expectedGid:'amuletofdead'});
 await gameProbe('provided-preview-mobile',preview,{
  pid:'4',gid:'wrappinmoregold',lang:'en_GB',practice:'1',channel:'mobi'
 },{mobile:true,expectedGid:'wrappinmoregold'});
}finally{await driver.close();}
console.log('PLAYNGO_MOBILE_PROBE '+JSON.stringify(results));
if(results.catalogue.apiStatus!==200 || results.catalogue.count<1)process.exitCode=1;
// Game evidence is measured independently; the job should not be called
// "game loaded" just because ContainerLauncher responded with HTTP 200.
