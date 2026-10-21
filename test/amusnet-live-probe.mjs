// One bounded live probe on GitHub-hosted Chromium.
// Reads a public catalogue and tries "Play Demo"; never spins, buys or logs
// the short-lived game launch token. No cookies/age assertions are bypassed.
import {chromium} from '../engine/node_modules/playwright/index.mjs';

const catalogue='https://amusnet.com/online-casino#online-casino-games';
const apiOrigin='https://backend.careers-amusnet.com';
const expectedHosts=new Set(['free-pod.games.amusnet.io','free.games.amusnet.io']);
const out={runner:'github-actions',catalogue:{},api:{},game:{},demo:{state:'not_attempted'}};
const message=(x)=>String(x?.message||x).slice(0,200);
const emit=()=>console.log('AMUSNET_PROBE_RESULT '+JSON.stringify(out));
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
 const page=await context.newPage();
 page.setDefaultTimeout(9000);
 page.setDefaultNavigationTimeout(45000);
 // Do not request images, media or fonts. Test only page/API/demo launch.
 await page.route('**/*',async route=>{
  const type=route.request().resourceType();
  if(['image','media','font'].includes(type))return route.abort();
  return route.continue();
 });
 const catalogResponse=await page.goto(catalogue,{waitUntil:'domcontentloaded',timeout:45000});
 out.catalogue={http:catalogResponse?.status()||0,title:(await page.title()).slice(0,110),
  urlHost:new URL(page.url()).hostname};
 const liveLinks=await page.locator('a[href*="/games/online-casino/"]')
  .evaluateAll(els=>[...new Set(els.map(a=>a.href))].slice(0,5));
 out.catalogue.domGameLinks=liveLinks.length;
 const ageButton=page.getByRole('button',{name:/yes.*over 18|i.m over 18/i}).first();
 out.catalogue.ageGateVisible=await ageButton.isVisible().catch(()=>false);

 // The HAR shows Amusnet's public Drupal JSON:API exposes full game records.
 // Probe only the first five records instead of paging through all ~490.
 const params=new URLSearchParams();
 params.set('filter[status][value]','1');
 params.set('filter[langcode][value]','en');
 params.set('fields[node--game]','title,path,field_game_gin,field__don_t_show_play_demo_butt');
 params.set('page[limit]','5');
 params.set('page[offset]','0');
 const apiUrl=apiOrigin+'/jsonapi/node/game?'+params;
 const apiResponse=await context.request.get(apiUrl,{timeout:30000});
 out.api.http=apiResponse.status();
 if(!apiResponse.ok())throw Error('catalogue API HTTP '+apiResponse.status());
 const catalog=await apiResponse.json();
 const records=Array.isArray(catalog.data)?catalog.data:[];
 out.api.gameCountTotal=Number(catalog.meta?.count||0);
 out.api.pageCount=records.length;
 out.api.exampleTitles=records.slice(0,3).map(x=>String(x.attributes?.title||'').slice(0,75));
 if(records.length===0)throw Error('public JSONAPI returned no games');
 const record=records.find(x=>{
  const a=x.attributes||{};
  return Number.isSafeInteger(a.field_game_gin)&&a.field__don_t_show_play_demo_butt===false
   && /^\/[a-z0-9-]+$/.test(a.path?.alias||'');
 });
 if(!record){
  out.demo={state:'no_eligible_demo_in_first_page'};
 } else{
  const a=record.attributes, detail='https://amusnet.com/games/online-casino'+a.path.alias;
  const detailResponse=await page.goto(detail,{waitUntil:'domcontentloaded',timeout:45000});
  out.game={title:String(a.title).slice(0,80),gin:a.field_game_gin,
   detailHttp:detailResponse?.status()||0,detailPath:new URL(page.url()).pathname};
  const age=page.getByRole('button',{name:/yes.*over 18|i.m over 18/i}).first();
  const blocked=await age.isVisible().catch(()=>false);
  out.game.ageGateVisible=blocked;
  if(blocked&&process.env.AMUSNET_ADULT_CONFIRMED!=='true'){
   out.demo={state:'age_gate_blocks_click',details:'Adult confirmation required; not clicked'};
  }else{
   if(blocked){
    await age.click({timeout:7000});
    out.game.ageConfirmedExplicitly=true;
   }
   // Catalogue tiles use .play-demo-btn; detailed game pages may use
   // .bttn (both are visible in the site's shipped JavaScript bundle).
   const play=page.getByText(/^Play Demo$/i).first();
   await play.waitFor({state:'visible',timeout:18000}).catch(()=>{});
   out.game.demoTextCount=await page.getByText(/^Play Demo$/i).count();
   out.game.catalogueButtonCount=await page.locator('.play-demo-btn').count();
   out.game.detailButtonCount=await page.locator('.bttn').count();
   out.game.demoControlVisible=await play.isVisible().catch(()=>false);
   if(!out.game.demoControlVisible){
    out.demo={state:'no_visible_play_demo_control'};
   }else{
    let lobbyHttp=null;
    page.on('response',r=>{
     const u=new URL(r.url());
     if(u.hostname==='amusnet.com'&&u.pathname==='/api/lobby')lobbyHttp=r.status();
    });
    await play.click({timeout:10000});
    const frame=page.locator('.play-popup iframe').first();
    try{
     await frame.waitFor({state:'attached',timeout:25000});
     const src=await frame.getAttribute('src');
     const hostname=src?new URL(src).hostname:null;
     out.demo={state:'iframe_attached',host:hostname,
      knownDemoHost:expectedHosts.has(hostname),lobbyHttp,
      // Never output the src: it contains an ephemeral launch token.
      iframeReadable:false};
     // Confirm that the actual iframe navigates, not only that it exists.
     const handle=await frame.elementHandle();
     const gameFrame=await handle?.contentFrame();
     if(gameFrame){
      await gameFrame.waitForLoadState('domcontentloaded',{timeout:20000}).catch(()=>{});
      out.demo.iframeReadable=Boolean(gameFrame.url()!=='about:blank');
     }
    }catch(e){
     out.demo={state:'iframe_not_attached',lobbyHttp,error:message(e)};
    }
   }
  }
 }
 await context.close();
} catch(e){
 out.error=message(e);
} finally{
 await browser.close();
 emit();
}
if(out.catalogue.http!==200||out.api.http!==200||out.api.pageCount<1)process.exitCode=1;
// Demo failure is reported distinctly. Age authorization must not be assumed.
