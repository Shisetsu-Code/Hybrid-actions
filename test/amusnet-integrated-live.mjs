// End-to-end smoke of the INTEGRATED Amusnet adapter.
// Public site and demo, adult-approved for this single branch test, no D1 upload.
import {chromium} from '../engine/node_modules/playwright/index.mjs';
import {validateConfig} from '../src/config.mjs';
import {discoverAmusnet,captureAmusnetDemo} from '../src/amusnet.mjs';
const source={id:'amusnet-official-catalogue',provider:'amusnet',enabled:true,approved:true,verifiedDemo:true,
 indexUrls:['https://amusnet.com/online-casino'],
 gameUrlPrefix:'https://amusnet.com/games/online-casino/',
 gamePathPattern:'^/games/online-casino/[a-z0-9-]+$'};
const config=validateConfig({runId:'amusnet-adapter-pilot',providers:[{
 id:'amusnet',enabled:true,approved:true,pacing:{minStartIntervalMs:20000,maxActive:1},
 allowlist:[{origin:'https://amusnet.com',pathPrefix:'/games/online-casino/'}],
 sources:[source],games:[]
}]});
const report={catalogue:null,capture:{state:'not_attempted'},uploadedToD1:false,uploadedToR2:false};
const safe=e=>String(e?.message||e).replace(/(?:token|ticket|session|auth)=[^&\s]+/ig,'REDACTED').slice(0,150);
const started=Date.now();
const browser=await chromium.launch({headless:true});
try{
 const found=await discoverAmusnet(browser,source,{config,maxPages:20,pauseMs:500});
 report.catalogue={complete:found.complete,pages:found.pages,
  published:found.totalPublished,visibleDemoGames:found.games.length,duplicateGinVariants:found.duplicateGinVariants};
 const selected=found.games.find(x=>x.gameId==='806')||found.games[0];
 if(!selected)throw Error('no public demo available');
 const job={role:'catalog',provider:'amusnet',subject:selected.gameId,
  payload:{game:{provider:'amusnet',id:selected.gameId,url:selected.url}}};
 try{
  const result=await captureAmusnetDemo(browser,{},job,{config,runId:config.runId,
   confirmAdult:process.env.AMUSNET_ADULT_CONFIRMED==='true',runnerId:'github-actions-test',waitMs:2000});
  report.capture={state:'captured',gin:result.info.gameId,width:result.info.width,
   height:result.info.height,jpegBytes:result.image.length,mode:result.info.mode,
   summary:result.info.metadata.networkDiagnostics.summary};
 }catch(e){report.capture={state:'error',error:safe(e)};}
}catch(e){report.error=safe(e);}
finally{await browser.close();report.elapsedMs=Date.now()-started;}
console.log('AMUSNET_INTEGRATED_ADAPTER_PILOT '+JSON.stringify(report));
if(!report.catalogue?.complete||report.capture.state!=='captured')process.exitCode=1;
