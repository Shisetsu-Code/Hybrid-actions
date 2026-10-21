// Public Play'n GO mobile adapter end-to-end smoke (one game; no D1 upload).
import {chromium,devices} from '../engine/node_modules/playwright/index.mjs';
import {validateConfig} from '../src/config.mjs';
import {capturePlayngoMobile,discoverPlayngo} from '../src/playngo.mjs';

const url='https://www.playngo.com/games/rich-wilde-and-the-amulet-of-dead';
const source={id:'playngo-official-catalogue',provider:'playngo',enabled:true,approved:true,verifiedDemo:true,
 indexUrls:['https://www.playngo.com/games'],gameUrlPrefix:'https://www.playngo.com/games/',
 gamePathPattern:'^/games/.*$'};
const config=validateConfig({runId:'playngo-adapter-test',providers:[{
 id:'playngo',enabled:true,approved:true,pacing:{minStartIntervalMs:20000,maxActive:1},
 allowlist:[{origin:'https://www.playngo.com',pathPrefix:'/games/'}],
 sources:[source],games:[{id:'475',url}]
}]});
const report={catalogue:{},capture:{state:'not_attempted'}};
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
try{
 const catalogContext=await browser.newContext({serviceWorkers:'block'});
 try{
  const response=await catalogContext.request.get('https://www.playngo.com/api/games?sort=date-desc&offset=0',{timeout:25000});
  const data=await response.json();
  report.catalogue={status:response.status(),count:Array.isArray(data.games)?data.games.length:0,nextOffset:data.nextOffset};
 }finally{await catalogContext.close();}
 const job={role:'catalog',provider:'playngo',subject:'475',
  payload:{game:{provider:'playngo',id:'475',url}}};
 try{
  const capture=await capturePlayngoMobile(browser,{devices},job,{config,runId:'playngo-adapter-test',waitMs:750,runnerId:'gha-probe'});
  const info=capture.info;
  report.capture={state:'captured',provider:info.provider,gameId:info.gameId,
   screenshotBytes:capture.image.length,mode:info.mode,
   adapter:info.adapter,channel:info.metadata.mobileChannel,
   publicGid:info.metadata.publicGid,summary:info.metadata.networkDiagnostics.summary,
   width:info.width,height:info.height};
 }catch(e){
  report.capture={state:'error',error:String(e.message||e).replace(/(?:ticket|token|session|auth)=[^&\s]+/ig,'REDACTED').slice(0,180)};
 }
}finally{await browser.close();}
console.log('PLAYNGO_ADAPTER_PROBE '+JSON.stringify(report));
if(report.catalogue.status!==200||report.capture.state!=='captured')process.exitCode=1;
