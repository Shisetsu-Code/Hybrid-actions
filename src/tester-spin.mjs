import {guardDocumentNavigations} from './navigation-guard.mjs';
// Launch contracts reused from Tester Spin; no spin, wager or purchase primitives.
export const TESTER_SPIN_LAUNCHER='tester-spin-v1';
export const testerSpinProviders=new Set(['pragmatic','1spin4win','ka_gaming','bgaming',
 'belatra','3oaks','rubyplay','yggdrasil','redtiger','nolimit_city','playtech']);
function check(ok){if(!ok)throw Error('unsupported Tester Spin public DEMO URL');}
function https(raw){
 const u=new URL(raw);
 check(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash);
 return u;
}
function query(u,keys){
 for(const key of u.searchParams.keys())check(keys.includes(key)&&u.searchParams.getAll(key).length===1);
}
function value(u,k,want){return u.searchParams.getAll(k).length===1&&u.searchParams.get(k)===want;}
function identifier(value){return /^[A-Za-z0-9_.-]{1,120}$/.test(value||'');}

export function importedEntryUrl(provider,raw){
 const u=https(raw),h=u.hostname,p=u.pathname,q=u.searchParams;
 check(testerSpinProviders.has(provider));
 if(provider!=='1spin4win')check(!u.port);
 switch(provider){
 case '1spin4win':
  check(h==='gs.1spin4win.com'&&u.port==='10443'&&/^\/gmh5\/[A-Za-z0-9_-]+\.html$/.test(p));
  query(u,['game','currency','config','freeplay','language','exit','lnglst']);
  check((p!=='/gmh5/games.html'||identifier(q.get('game')))&&
   value(u,'freeplay','true')&&value(u,'config','1')&&(!q.has('exit')||value(u,'exit','none'))&&
   (!q.has('lnglst')||/^[a-zA-Z,;-]+$/.test(q.get('lnglst'))));
  break;
 case 'ka_gaming':
  check(h==='gamesdemo.kaga88.com'&&p==='/');
  query(u,['g','p','u','t','ak','cr','loc','l']);
  check(identifier(q.get('g'))&&value(u,'p','demo')&&/^\d{1,10}$/.test(q.get('u')||'')&&
   value(u,'t','123')&&value(u,'ak','accessKey')&&value(u,'l','https://www.kaga88.com/'));
  break;
 case 'bgaming':
  check(['demo.bgaming-network.com','bgaming-network.com'].includes(h)&&/^\/play\/[A-Za-z0-9_-]+\/FUN\/?$/.test(p));
  query(u,['server']);check(!q.has('server')||value(u,'server','demo'));break;
 case 'playtech':
  check(h==='cachedownload.playtechone.com'&&p==='/ngmdesktop/casinoclient.html');
  query(u,['game','preferedmode','real']);
  check(identifier(q.get('game'))&&value(u,'preferedmode','offline')&&value(u,'real','0'));break;
 default:
  check(!u.search);
  check({
   pragmatic:(h==='www.pragmaticplay.com'&&/^\/en\/games\/[a-z0-9-]+\/$/.test(p))||
    (h==='www.pragmaticplay.fun'&&/^\/en\/slots\/[a-z0-9-]+\/$/.test(p)),
   belatra:h==='belatragames.com'&&/^\/[a-z]{2}\/games\/game\/[a-z0-9'!_-]+\/?$/.test(p),
   '3oaks':h==='3oaks.com'&&/^\/game\/[a-z0-9_]+\/?$/.test(p),
   rubyplay:h==='rubyplay.com'&&/^\/games\/[a-z0-9-]+\/$/.test(p),
   yggdrasil:h==='yggdrasilgaming.com'&&/^\/games\/[a-z0-9_-]+\/?$/.test(p),
   redtiger:h==='games.evolution.com'&&/^\/slots\/[a-z0-9-]+\/$/.test(p),
   nolimit_city:h==='playin.com'&&/^\/embed\/v1\/demo\/[A-Za-z0-9_-]+$/.test(p),
  }[provider]);
 }
 return u;
}

export function importedOrigin(provider,origin){
 const u=https(origin+'/');
 check(!u.search&&u.pathname==='/');
 if(u.port)check(provider==='1spin4win'&&u.origin==='https://gs.1spin4win.com:10443');
 return u.origin;
}

function pragmaticIdentity(u){
 const keys=u.searchParams.has('symbol')||u.searchParams.has('gameSymbol')?['symbol','gameSymbol']:['extGame'];
 const values=keys.flatMap(k=>u.searchParams.getAll(k));
 if(!values.length||new Set(values).size!==1||values.some(v=>!identifier(v)))return '';
 return values[0];
}

export function importedRuntimeOrigin(provider,raw){
 const u=https(raw);
 check(provider==='redtiger'&&!u.port&&!u.search&&u.pathname==='/'&&
  /^gserver-[a-z0-9-]+\.redtiger\.cash$/.test(u.hostname));
 return u.origin;
}

export function isImportedRuntime(provider,raw,game={}){
 try{
  const u=new URL(raw),h=u.hostname,p=u.pathname,q=u.searchParams;
  if(u.protocol!=='https:'||u.username||u.password)return false;
  if(provider!=='1spin4win'&&u.port)return false;
  // These launchers must never be repurposed to a real-money session.
  for(const [key,v] of q){
   if((key==='mode'&&!['demo','fun','2'].includes(v.toLowerCase()))||
      (key==='real'&&v!=='0')||(key==='freeplay'&&v!=='true'))return false;
  }
  switch(provider){
  case '1spin4win':
  case 'ka_gaming':
   return Boolean(importedEntryUrl(provider,raw));
  case 'playtech':
   if(h==='cachedownload.playtechone.com'&&/^\/ngmdesktop\/\d+\/platform\/index\.html$/.test(p)&&identifier(game.symbol)&&value(u,'game',game.symbol)&&value(u,'preferedmode','offline')&&value(u,'real','0'))return true;
   if(h==='gpas-games.playtechone.com'&&p==='/gpasclient.html'&&identifier(game.symbol)&&value(u,'game',game.symbol))return true;
   if(h==='cachedownload.playtechone.com'&&identifier(game.symbol)&&p.includes('/'+game.symbol+'/'))return true;
   return Boolean(importedEntryUrl(provider,raw));
  case 'pragmatic':return h==='demogamesfree.pragmaticplay.net'&&/^\/gs2c\/(?:html5Game|openGame)\.do$/.test(p)&&
    Boolean(pragmaticIdentity(u));
  case 'belatra':return h==='demo.bltr-static.com'&&p==='/belatra/demo'&&identifier(q.get('game'))&&q.getAll('game').length===1;
  case '3oaks':return (h==='3oaks.com'&&/^\/api\/v1\/games\/[a-z0-9_]+\/play$/.test(p)&&value(u,'lang','en'))||
    (h==='static.3oaks.com'&&/\/clients_[a-z]+\//.test(p)&&(/\.html$/.test(p)||p.endsWith('/')));
  case 'bgaming':return (!q.has('server')||value(u,'server','demo')||value(u,'server','demo_fun_curacao'))&&
    (((h==='demo.bgaming-network.com'||h==='bgaming-network.com')&&/^\/(?:play|games)\/[A-Za-z0-9_-]+\/FUN\/?$/.test(p))||
    (h.endsWith('.demo.bgaming-network.com')&&['/','/hyperhive','/hyperhive/'].includes(p)));
  case 'nolimit_city':return (h==='demo.nolimitcdn.com'&&p==='/loader/loader-desktop.html'&&identifier(game.symbol)&&value(u,'game',game.symbol)&&value(u,'operator','FANPAGE_DEMO'))||(h==='playin.com'&&/^\/embed\/v1\/demo\/[A-Za-z0-9_-]+$/.test(p))||h==='demo.nolimitcity.com';
  case 'yggdrasil':{
   const gameId=q.get('gameid');
   if(game.symbol&&!value(u,'gameid',game.symbol))return false;
   return ['staticdemo.yggdrasilgaming.com','staticpff.yggdrasilgaming.com'].includes(h)&&
    /^\d+$/.test(gameId||'')&&q.getAll('gameid').length===1&&
    (value(u,'org','Demo')||(h==='staticpff.yggdrasilgaming.com'&&!q.has('org')))&&
    (p==='/init/launchClient.html'||(h==='staticdemo.yggdrasilgaming.com'&&p===`/${gameId}/index.html`&&value(u,'appsrv','https://demo.yggdrasilgaming.com'))||(h==='staticpff.yggdrasilgaming.com'&&p===`/${gameId}/index.html`&&value(u,'appsrv','https://productionpff-mt.yggdrasilgaming.com')));
  }
  case 'rubyplay':return h==='prrpeu3.com'&&p==='/launcher'&&value(u,'mode','fun')&&
    value(u,'operator','rubyplay.com')&&value(u,'server_url','https://srv.prrpeu3.com')&&
    ['gamename','currency'].every(k=>q.getAll(k).length===1&&q.get(k))&&/^rp_[A-Za-z0-9_-]+$/.test(q.get('gamename'));
  case 'redtiger':return (h==='games.evolution.com'&&/^\/demo\/[A-Za-z0-9_-]+\/?$/.test(p))||
    h==='showcase.evo-games.com'||(game.runtimeOrigins||[]).some(origin=>{
     try{return importedRuntimeOrigin(provider,origin+'/')===u.origin;}catch{return false;}
    });
  default:return false;
  }
 }catch{return false;}
}

export function selectImportedTarget(provider,candidates,symbol='',game={}){
 const found=new Map();
 for(const raw of candidates){
  let target;
  try{
   const u=new URL(raw);
   if(provider==='rubyplay'){
    const game=u.searchParams.get('gamename')||'';
    const doubled=/^(rp_[A-Za-z0-9_-]+)\1$/.exec(game);
    if(doubled)u.searchParams.set('gamename',doubled[1]);
   }
   target=u.href;
   if(!isImportedRuntime(provider,target,game))continue;
   if(provider==='pragmatic'&&symbol&&pragmaticIdentity(u)!==symbol)continue;
   const key=provider==='yggdrasil'?'gameid':provider==='rubyplay'?'gamename':null;
   if(symbol&&key&&u.searchParams.get(key)!==symbol)continue;
   // Equivalent encodings of the same fresh URL are not ambiguity.
   const pairs=[...u.searchParams].sort((a,b)=>a[0].localeCompare(b[0]));
   found.set(u.origin+u.pathname+JSON.stringify(pairs),target);
  }catch{continue;}
 }
 let targets=[...found.values()];
 if(provider==='redtiger'){
  const terminal=targets.filter(url=>(game.runtimeOrigins||[]).includes(new URL(url).origin));
  if(terminal.length)targets=terminal;
 }
 if(targets.length!==1)throw Error('Tester Spin DEMO target missing or ambiguous');
 return targets[0];
}

export async function isImportedRuntimeFrame(provider,frame,game){
 if(isImportedRuntime(provider,frame.url(),game))return true;
 if(provider!=='nolimit_city'||!['about:blank','about:srcdoc'].includes(frame.url())||
    frame.parentFrame()?.url()!==game.url||!identifier(game.symbol))return false;
 // The official Playin loader writes a same-origin blank iframe. Bind it to
 // the configured entry and exact CDN game client, never to an arbitrary canvas.
 const scripts=await frame.evaluate(()=>Array.from(document.scripts,script=>script.src));
 return scripts.some(raw=>{
  try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='demo.nolimitcdn.com'&&
   u.pathname.startsWith('/games/'+game.symbol+'/')&&u.pathname.endsWith('/game.js');}
  catch{return false;}
 });
}

const requestedDocuments=new WeakMap();
export async function guardImportedNavigation(context,provider,entryUrl,game={}){
 const openedDocuments=new Map();requestedDocuments.set(context,openedDocuments);
 const entry=new URL(entryUrl);
 const equivalentEntry=target=>{
  try{const u=new URL(target);return u.origin===entry.origin&&u.pathname.replace(/\/$/,'')===entry.pathname.replace(/\/$/,'')&&u.search===entry.search;}catch{return false;}
 };
 await guardDocumentNavigations(context,target=>equivalentEntry(target)||isImportedRuntime(provider,target,game),
  (url,page)=>openedDocuments.set(url,page));
}
async function launcherCandidates(page,provider){
 const values=await page.locator('*').evaluateAll(elements=>elements.flatMap(el=>
  Array.from(el.attributes||[]).map(a=>String(a.value||''))));
 values.push(...page.frames().map(frame=>frame.url()));
 const html=(await page.content()).replaceAll('\\/','/').replaceAll('&amp;','&').replaceAll('\\u0026','&');
 values.push(...html.match(/https:\/\/[^\s"'<>\\]+/g)||[]);
 if(provider==='belatra'){
  // Tester Spin BelatraProvider._extract_official_demo_url; preserve page language.
  const language=new URL(page.url()).pathname.split('/')[1]||'en';
  const game=/https:\/\/demo\.bltr-static\.com\/belatra\/demo\?game=([A-Za-z0-9._~-]+)/i.exec(html)?.[1];
  if(game)values.push(`https://demo.bltr-static.com/belatra/demo?game=${game}&language=${language}`);
  // The extractor's canonical target supersedes the raw href without a language.
  return values.filter(v=>!String(v).startsWith('https://demo.bltr-static.com/belatra/demo?game=')||String(v).includes('&language='));
 }
 return values;
}

export async function dismissImportedSiteOverlays(page,provider){
 const selectors=provider==='rubyplay'?['.cky-btn-reject:visible']:
  provider==='redtiger'?['.cmplz-deny:visible','.cmplz-cookiebanner.cmplz-show .cmplz-close:visible']:[];
 for(const selector of selectors){
  const control=page.locator(selector).first();
  if(await control.count()&&await control.isVisible())await control.click({timeout:5000});
 }
}
export async function openImportedDemo(page,provider,game,{engine,confirmAdult=false,confirmAge21=false}={}){
 try{
  if(['redtiger','nolimit_city','rubyplay'].includes(provider)){
   const pattern=provider==='rubyplay'?/^Yes, I am of legal gambling age$/i:provider==='redtiger'?/^YES, I AM (?:18|21)\+$/i:/^Yes, I.m 18 or older$/i;
   const gates=page.getByText(pattern,{exact:true});
   if(provider==='nolimit_city')await gates.first().waitFor({state:'visible',timeout:7000}).catch(()=>{});
   for(let i=0;i<Math.min(await gates.count(),8);i++)if(await gates.nth(i).isVisible()){
    if(!confirmAdult)throw Error('adult confirmation required');
    if(provider==='redtiger'&&/\b21\+/.test(await gates.nth(i).innerText())&&!confirmAge21)throw Error('explicit age 21 confirmation required');
    await gates.nth(i).click({timeout:8000});break;
   }
   await dismissImportedSiteOverlays(page,provider);
  }
  if(isImportedRuntime(provider,page.url(),game))return page;
  if(provider==='pragmatic'&&new URL(game.url).hostname==='www.pragmaticplay.fun'){
   await engine.intro.openPublicDemo(page,{provider,url:game.url,confirmAdult});return page;
  }
  if(await page.locator('button[data-age-gate-confirm="true"]:visible').count())throw Error('adult confirmation required');
  if(provider==='3oaks'){
   const slug=new URL(game.url).pathname.split('/')[2];
   await page.goto(`https://3oaks.com/api/v1/games/${slug}/play?lang=en`,{waitUntil:'domcontentloaded',timeout:45000});
   return page;
  }
  if(provider==='pragmatic'&&identifier(game.symbol)){
   const query=new URLSearchParams({gameSymbol:game.symbol,websiteUrl:'https://demogamesfree.pragmaticplay.net',
    jurisdiction:'99',lobby_url:game.url,lang:'en',cur:'USD'});
   await page.goto('https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?'+query,{waitUntil:'domcontentloaded',timeout:45000});
   return page;
  }
  if(provider==='redtiger'){
   // Tester Spin _wait_for_official_loader + _submit_official_start.
   await page.locator('form.start-form').waitFor({state:'attached',timeout:15000});
   const id=await page.locator('.game-playable').getAttribute('data-game-id');
   check(game.symbol&&id===game.symbol);
   await page.locator('form.start-form').evaluate(form=>{
    const button=form.querySelector('#start-game, button[type=submit], button:not([type])');
    if(!button)throw Error('official demo start button missing');
    form.requestSubmit(button);
   });
  }
  let clicked=false;
  for(let attempt=0;attempt<24;attempt++){
   const pages=page.context().pages();
   const candidates=[];
   for(const current of pages)candidates.push(...await launcherCandidates(current,provider));
   let target;
   try{target=selectImportedTarget(provider,candidates,game.symbol||'',game);}catch{
    if(!clicked&&['rubyplay','pragmatic'].includes(provider)){
     // Only the provider's DEMO launcher, never a game control.
     const button=page.getByRole('button',{name:/^\s*(?:play demo|play for free)\s*$/i}).first();
     const link=page.getByRole('link',{name:/^\s*(?:play demo|play for free)\s*$/i}).first();
     for(const control of [button,link]){
      if(await control.count()&&await control.isVisible()){
       // Age confirmation is never inferred from the existence of a demo button.
       if(await page.locator('button[data-age-gate-confirm="true"]:visible').count())throw Error('adult confirmation required');
       await control.click({timeout:8000});clicked=true;break;
      }
     }
    }
    await page.waitForTimeout(250);continue;
   }
   // Tester Spin extracts RubyPlay's complete launcher, then opens it directly.
   // Its catalogue can keep a promotional cover over an already loaded iframe.
   if(provider==='rubyplay'&&page.url()!==target){
    await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});return page;
   }
   const requested=requestedDocuments.get(page.context())?.get(target);
   const opened=requested&&!requested.isClosed()?requested:
    pages.find(current=>current.url()===target||current.frames().some(frame=>frame.url()===target));
   if(opened)return opened;
   for(const current of pages){
    const pending=await current.locator('iframe[src]').evaluateAll(elements=>elements.map(el=>el.src));
    if(pending.includes(target))return current;
   }
   await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
   return page;
  }
  throw Error('missing DEMO target');
 }catch(error){
  // Browser errors can contain fresh launcher/session tokens. Do not persist them.
  throw Error('Tester Spin DEMO launch failed',{cause:error});
 }
}
