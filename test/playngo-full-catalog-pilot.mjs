// One GitHub-hosted runner reads ALL official Play'n GO catalogue pages
// and opens at most two public mobile practice demos, without spins/purchases.
import {chromium,devices} from '../engine/node_modules/playwright/index.mjs';
import {validateConfig} from '../src/config.mjs';
import {discoverPlayngo,capturePlayngoMobile} from '../src/playngo.mjs';

const start=Date.now();
const source={
 id:'playngo-official-catalogue',provider:'playngo',enabled:true,
 approved:true,verifiedDemo:true,
 indexUrls:['https://www.playngo.com/games'],
 gameUrlPrefix:'https://www.playngo.com/games/',
 gamePathPattern:'^/games/.*$'
};
const config=validateConfig({runId:'playngo-pilot-20261021',providers:[{
 id:'playngo',enabled:true,approved:true,
 pacing:{minStartIntervalMs:20000,maxActive:1},
 allowlist:[{origin:'https://www.playngo.com',pathPrefix:'/games/'}],
 sources:[source],games:[]
}]});
const result={runId:config.runId,runner:'github-actions',
 test:'read-full-catalog-and-open-two-practice-demos',
 catalogue:null,attempts:[],uploadedToD1:false,uploadedToR2:false};
const safe=e=>String(e?.message||e).replace(/(?:token|ticket|session|auth)=[^&\s]+/ig,'REDACTED').slice(0,250);
const show=()=>console.log('PLAYNGO_CATALOG_PILOT '+JSON.stringify(result));
const browser=await chromium.launch({headless:true,
 args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{
 const found=await discoverPlayngo(browser,source,{config,maxPages:45,pauseMs:650});
 result.catalogue={status:'complete',pages:found.pages,distinctSKUs:found.games.length,
  samples:found.games.slice(0,4).map(g=>({sku:g.gameId,slug:new URL(g.url).pathname.split('/').at(-1)}))};
 show();
 const newest=found.games[0];
 const known=found.games.find(g=>g.gameId==='475');
 const selected=[known,newest].filter((g,i,a)=>g&&a.findIndex(x=>x?.gameId===g.gameId)===i).slice(0,2);
 if(selected.length<1)throw Error('no public games in returned catalogue');
 for(const [index,game] of selected.entries()){
  if(index>0)await new Promise(resolve=>setTimeout(resolve,20000));
  const begun=Date.now();
  try{
   const job={role:'catalog',provider:'playngo',subject:game.gameId,
    payload:{game:{provider:'playngo',id:game.gameId,url:game.url}}};
   const c=await capturePlayngoMobile(browser,{devices},job,{
    config,runId:config.runId,waitMs:1500,runnerId:'github-actions-pilot'
   });
   result.attempts.push({sku:game.gameId,slug:new URL(game.url).pathname.split('/').at(-1),
    status:'captured',jpegBytes:c.image.length,mode:c.info.mode,
    pixels:{width:c.info.width,height:c.info.height},
    publicGid:c.info.metadata.publicGid,
    channel:c.info.metadata.mobileChannel,
    mobileEvidence:c.info.metadata.networkDiagnostics.summary,
    elapsedMs:Date.now()-begun});
  }catch(e){
   result.attempts.push({sku:game.gameId,slug:new URL(game.url).pathname.split('/').at(-1),
    status:'failed',error:safe(e),elapsedMs:Date.now()-begun});
  }
  show();
 }
}catch(e){
 result.error=safe(e);
}finally{
 result.elapsedMs=Date.now()-start;
 await browser.close();
 show();
}
if(result.catalogue?.status!=='complete'||!result.attempts.some(x=>x.status==='captured'))
 process.exitCode=1;
// Images stay in process memory and are not submitted to GitHub artifacts or D1.
// This is a bounded live pilot, not a complete classification or mass ingestion.
