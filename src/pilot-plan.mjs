import {testerSpinProviders} from './tester-spin.mjs';
export const verifiedProviders=['pragmatic','1spin4win','ka_gaming','bgaming','rubyplay','redtiger','3oaks','yggdrasil','nolimit_city','playtech','amusnet','playngo'];
const supported=new Set([...testerSpinProviders,'amusnet','playngo']);
export function buildPilotPlan(raw,{providers,limit=2,runId=raw.runId,verifiedOnly=false}={}){
 if(!Array.isArray(providers)||!providers.length||providers.length>13||new Set(providers).size!==providers.length||providers.some(id=>!supported.has(id)))throw Error('Explicit supported pilot providers required');
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('Pilot limit must be 1..50');
 if(!/^[a-z0-9][a-z0-9_.-]{0,99}$/i.test(runId||''))throw Error('Invalid pilot run ID');
 const selected=providers.map(id=>{
  if(verifiedOnly&&!verifiedProviders.includes(id))throw Error('Provider has no verified opening: '+id);
  const p=raw.providers.find(p=>p.id===id);
  if(!p?.games?.length)throw Error('No configured DEMO games: '+id);
  const games=p.games.slice(0,limit);
  if(new Set(games.map(g=>g.id)).size!==games.length)throw Error('Duplicate pilot game identity: '+id);
  if(games.length<limit)throw Error('Insufficient configured DEMOs: '+id);
  return {...p,enabled:true,approved:true,pacing:{minStartIntervalMs:20000,maxActive:1},sources:[],games};
 });
 return {runId,providers:selected};
}
