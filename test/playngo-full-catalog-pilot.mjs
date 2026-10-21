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
 let found;
 try{found=await discoverPlayngo(browser,source,{config,maxPages:45,pauseMs:650});}
 catch(e){
  result.catalogue={status:'primary_failed',error:safe(e),pagination:[]};
  const ctx=await browser.newContext({serviceWorkers:'block'});
  try{
   let offset=0,all=[],seen=new Set();
   for(let i=0;i<45;i++){
    const url='https://www.playngo.com/api/games?'+new URLSearchParams({offset:String(offset),sort:'date-desc'});
    const response=await ctx.request.get(url,{timeout:25000});
    const data=await response.json();
    const games=Array.isArray(data.games)?data.games:[];
    const next=data.nextOffset;
    const rec={page:i+1,offset,count:games.length,nextOffset:next??null,nextOffsetType:typeof next};
    result.catalogue.pagination.push(rec);
    if(response.status()!==200){result.catalogue.failure='HTTP '+response.status();break;}
    for(const g of games){
     const id=String(g.sku||''),slug=String(g.slug||'');
     if(/^\d{1,12}$/.test(id)&&/^[a-z0-9][a-z0-9'-]{0,120}$/i.test(slug)&&!seen.has(id)){
      seen.add(id);all.push({gameId:id,provider:'playngo',url:'https://www.playngo.com/games/'+slug});
     }
    }
    if(next===null){result.catalogue.status='complete';break;}
    const nextNumber=Number(next);
    if(!Number.isSafeInteger(nextNumber)||nextNumber<=offset||nextNumber>5000){
     result.catalogue.failure='nextOffset invalid after last page; offset='+offset+', next='+String(next).slice(0,28);
     if(games.length<24&&games.length>0){result.catalogue.status='complete_with_terminal_offset_anomaly';}
     break;
    }
    offset=nextNumber;
    await new Promise(resolve=>setTimeout(resolve,650));
   }
   result.catalogue.distinctSKUs=all.length;
   result.catalogue.pages=result.catalogue.pagination.length;
   result.catalogue.samples=all.slice(0,3).map(g=>({sku:g.gameId,slug:g.url.split('/').at(-1)}));
   // Keep pilot actionable even when pagination is anomalous: the one-game
   // opening proves independent browser capability, but never claim completion.
   found={games:all,pages:result.catalogue.pages,complete:result.catalogue.status==='complete'};
  }finally{await ctx.close();}
 }
 result.catalogue={...result.catalogue,status:found.complete?'complete':result.catalogue?.status||'incomplete',pages:found.pages,distinctSKUs:found.games.length,
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
if(!['complete','complete_with_terminal_offset_anomaly'].includes(result.catalogue?.status)||!result.attempts.some(x=>x.status==='captured'))
 process.exitCode=1;
// Images stay in process memory and are not submitted to GitHub artifacts or D1.
// This is a bounded live pilot, not a complete classification or mass ingestion.
