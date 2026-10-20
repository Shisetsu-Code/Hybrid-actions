// No implicit provider rates: every enabled provider supplies its own policy
// and allowlisted public DEMO origins. No credentials or personal sessions.
import fs from 'node:fs/promises';

const id=/^[a-z0-9][a-z0-9_.-]{0,99}$/i;
const privateHost=/^(?:localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;
function must(ok,why){if(!ok)throw Error('catalogue configuration: '+why);}
export function demoUrl(raw){
 let u;try{u=new URL(raw);}catch{throw Error('invalid public DEMO URL');}
 must(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&!u.search,'canonical HTTPS DEMO URL required');
 must(u.hostname.includes('.')&&!privateHost.test(u.hostname)&&!u.hostname.endsWith('.local')&&!u.hostname.endsWith('.internal')&&!u.hostname.includes(':'),'private demo host not allowed');
 return u;
}
export function validateConfig(raw){
 must(raw&&typeof raw==='object'&&!Array.isArray(raw),'JSON object required');
 must(id.test(raw.runId||''),'runId required');
 must(Array.isArray(raw.providers)&&raw.providers.length<=64,'providers must be <=64 array');
 const seen=new Set(),providers=[];
 for(const p of raw.providers){
  must(p&&id.test(p.id||''),'provider ID required');
  must(!seen.has(p.id),'duplicate provider '+p.id);seen.add(p.id);
  if(p.enabled!==true)continue;
  must(p.approved===true,'explicit public-demo approval required: '+p.id);
  const rate=p.pacing||{};
  must(Number.isSafeInteger(rate.minStartIntervalMs)&&rate.minStartIntervalMs>=1000&&rate.minStartIntervalMs<=300000,
   'provider-specific minStartIntervalMs required: '+p.id);
  must(Number.isSafeInteger(rate.maxActive)&&rate.maxActive>=1&&rate.maxActive<=32,
   'provider-specific maxActive required: '+p.id);
  must(Array.isArray(p.allowlist)&&p.allowlist.length>0&&p.allowlist.length<=16,
   'allowlisted DEMO origins required: '+p.id);
  const allowlist=p.allowlist.map(row=>{
   must(row&&typeof row.origin==='string'&&typeof row.pathPrefix==='string','allowlist origin/pathPrefix required');
   let origin=demoUrl(row.origin+'/').origin;
   must(row.origin===origin,'allowlist entry must be a canonical HTTPS origin');
   must(row.pathPrefix.startsWith('/')&&row.pathPrefix.endsWith('/')&&!row.pathPrefix.includes('..'),'allowlist pathPrefix must be a directory');
   return {origin,pathPrefix:row.pathPrefix};
  });
  const validateGame=(game)=>{
   must(game&&id.test(game.id||''),'invalid DEMO game ID');
   const url=demoUrl(game.url);
   must(allowlist.some(x=>url.origin===x.origin&&url.pathname.startsWith(x.pathPrefix)),
    'game outside provider allowlist: '+p.id+'/'+game.id);
   return {id:game.id,url:url.href};
  };
  const games=Array.isArray(p.games)?p.games.map(validateGame):[];
  const sources=Array.isArray(p.sources)?p.sources.filter(x=>x.enabled===true).map(s=>{
   must(s.approved===true&&s.verifiedDemo===true,'only approved, verified demo discovery sources allowed');
   must(id.test(s.id||''),'source ID required');
   must(Array.isArray(s.indexUrls)&&s.indexUrls.length>0&&s.indexUrls.length<=12,'source index URLs required');
   const gamePrefix=demoUrl(s.gameUrlPrefix);
   must(allowlist.some(x=>x.origin===gamePrefix.origin&&gamePrefix.pathname.startsWith(x.pathPrefix)),
    'discovery URL outside allowlist');
   for(const u of s.indexUrls){
    const index=demoUrl(u);
    must(index.origin===gamePrefix.origin,'discovery index outside source origin');
   }
   return {...s,provider:p.id,enabled:true,approved:true,verifiedDemo:true};
  }):[];
  providers.push({id:p.id,pacing:{minStartIntervalMs:rate.minStartIntervalMs,
   maxActive:rate.maxActive,enabled:true},allowlist,games,sources});
 }
 return {runId:raw.runId,providers};
}
export async function loadConfig(file){
 return validateConfig(JSON.parse(await fs.readFile(file,'utf8')));
}
export function providerForUrl(config,providerId,gameUrl){
 const entry=config.providers.find(p=>p.id===providerId);
 if(!entry)throw Error('unknown or disabled provider '+providerId);
 const url=demoUrl(gameUrl);
 if(!entry.allowlist.some(x=>url.origin===x.origin&&url.pathname.startsWith(x.pathPrefix)))
  throw Error('game outside approved provider origin/path: '+providerId);
 return entry;
}
