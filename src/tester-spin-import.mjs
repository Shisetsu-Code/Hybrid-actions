import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {TESTER_SPIN_LAUNCHER,testerSpinProviders,importedEntryUrl,importedRuntimeOrigin} from './tester-spin.mjs';

export function readTesterSpinDatabase(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{return db.prepare('SELECT provider,slug,name,url,symbol FROM games ORDER BY provider,slug').all();}
 finally{db.close();}
}

export function prepareTesterSpinConfig(original,rows){
 const config=structuredClone(original),summary=[];
 for(const provider of config.providers){
  const source=rows.filter(row=>row.provider===provider.id);
  provider.enabled=false;
  provider.approved=false;
  delete provider.pacing;
  if(['amusnet','playngo'].includes(provider.id)&&provider.sources?.length){
   summary.push({provider:provider.id,sourceGames:source.length,launchableGames:0,
    omittedGames:0,status:'native-adapter-preserved-disabled'});
   continue;
  }
  delete provider.allowlist;
  delete provider.launcher;
  provider.games=[];provider.sources=[];
  let omitted=0;
  const allowlist=new Map(),seen=new Set();
  if(testerSpinProviders.has(provider.id)){
   provider.launcher=TESTER_SPIN_LAUNCHER;
   for(const row of source){
    const metadata=row.metadata||{};
    let symbol=String(row.symbol||metadata.provider_internal_id||metadata.identifier||'');
    // Existing Pragmatic metadata carries a session URL. Reuse only its stable
    // symbol; the session itself is resolved again from the public game page.
    if(provider.id==='pragmatic'&&!symbol){
     try{symbol=new URL(metadata.direct_game_link).searchParams.get('symbol')||'';}catch{}
    }
    let candidates=[metadata.demo_url,row.url,metadata.page_url,metadata.public_url].filter(Boolean);
    if(provider.id==='playtech'){
     if(!/^[A-Za-z0-9_.-]{1,120}$/.test(symbol)){omitted++;continue;}
     candidates=[`https://cachedownload.playtechone.com/ngmdesktop/casinoclient.html?game=${encodeURIComponent(symbol)}&preferedmode=offline&real=0`];
    }
    let url;
    for(const candidate of candidates){
     try{
      const normalized=new URL(candidate);
      for(const key of [...normalized.searchParams.keys()]){
       const values=normalized.searchParams.getAll(key);
       if(values.length>1&&new Set(values).size===1)normalized.searchParams.set(key,values[0]);
      }
      url=importedEntryUrl(provider.id,normalized.href);break;
     }catch{}
    }
    if(!url||symbol&&!/^[A-Za-z0-9_.-]{1,120}$/.test(symbol)){omitted++;continue;}
    if(provider.id==='redtiger'&&!/^\d+$/.test(symbol)){omitted++;continue;}
    if(!symbol){
     const key={'1spin4win':'game',ka_gaming:'g',playtech:'game'}[provider.id];
     if(key)symbol=url.searchParams.get(key)||'';
    }
    const id=/^[a-z0-9][a-z0-9_.-]{0,99}$/i.test(row.slug)?row.slug:
     'tester-'+createHash('sha256').update(String(row.slug)).digest('hex').slice(0,32);
    if(seen.has(id))throw Error('duplicate Tester Spin game identity');
    seen.add(id);
    const game={id,url:url.href,symbol};
    if(provider.id==='redtiger'&&metadata.runtime_bootstrap==='games_evolution_start_iframe_observed_settings'){
     try{
      const origin=new URL(metadata.settings_url).origin;
      game.runtimeOrigins=[importedRuntimeOrigin(provider.id,origin+'/')];
     }catch{}
    }
    provider.games.push(game);
    const prefix=provider.id==='ka_gaming'?'/':
     provider.id==='1spin4win'?'/gmh5/':
     provider.id==='bgaming'?'/play/':
     provider.id==='playtech'?'/ngmdesktop/':
     provider.id==='belatra'?'/'+url.pathname.split('/').slice(1,4).join('/')+'/':
     provider.id==='nolimit_city'?'/embed/v1/demo/':
     provider.id==='pragmatic'?'/en/'+(url.hostname.endsWith('.fun')?'slots':'games')+'/':
     provider.id==='redtiger'?'/slots/':provider.id==='3oaks'?'/game/':'/games/';
    allowlist.set(url.origin+prefix,{origin:url.origin,pathPrefix:prefix});
   }
   provider.allowlist=[...allowlist.values()];
   provider.preparationStatus=provider.games.length?'tester-spin-launcher-imported-disabled':'tester-spin-launcher-no-eligible-game';
  }else provider.preparationStatus=provider.id==='hacksaw'?
   'tester-spin-protocol-only-no-browser-launcher':'tester-spin-catalogue-only';
  summary.push({provider:provider.id,sourceGames:source.length,launchableGames:provider.games.length,
   omittedGames:omitted,status:provider.preparationStatus});
 }
 return {config,summary};
}
