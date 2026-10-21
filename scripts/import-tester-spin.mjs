// Offline import only: does not instantiate providers, open browsers or contact APIs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {readTesterSpinDatabase,prepareTesterSpinConfig} from '../src/tester-spin-import.mjs';
const args=new Map(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(0,i),arg.slice(i+1)];}));
const dataRoot=args.get('--data-root');
if(!dataRoot)throw Error('Usage: node scripts/import-tester-spin.mjs --data-root=PATH [--refreshed-catalogs=PATH] [--source-revision=SHA]');
const file=args.get('--config')||'config/providers.json';
const config=JSON.parse(await fs.readFile(file,'utf8'));
let rows=readTesterSpinDatabase(path.join(dataRoot,'tester-spin.sqlite3'));
const refreshed=args.get('--refreshed-catalogs');
if(refreshed){
 const existing=new Map(rows.map(row=>[row.provider+'/'+row.slug,row]));
 rows=[];
 for(const provider of config.providers){
  const report=JSON.parse(await fs.readFile(path.join(refreshed,provider.id+'.json'),'utf8'));
  if(report.status!=='updated'||!Array.isArray(report.games))throw Error('Missing refreshed catalogue: '+provider.id);
  for(const game of report.games)rows.push({...existing.get(provider.id+'/'+game.slug),...game,
   provider:provider.id,symbol:game.symbol||existing.get(provider.id+'/'+game.slug)?.symbol||''});
 }
}
// Only the Pragmatic catalogue needs a stable identifier from historical
// game.json. Read the top-level metadata, never protocol captures or secrets.
for(const key of ['pragmatic','redtiger'])try{
 const root=path.join(dataRoot,'providers',key);
 const metadata=new Map();
 for(const folder of await fs.readdir(root,{withFileTypes:true})){
  if(!folder.isDirectory())continue;
  try{
   const value=JSON.parse(await fs.readFile(path.join(root,folder.name,'game.json'),'utf8'));
   let slug=value.provider_slug||value.slug;
   if(!slug)try{slug=new URL(value.page_url||value.url||value.public_url).pathname.split('/').filter(Boolean).at(-1);}catch{}
   metadata.set(slug||folder.name,value);
  }catch{}
 }
 for(const row of rows)if(row.provider===key)row.metadata=metadata.get(row.slug)||{};
}catch{}
const result=prepareTesterSpinConfig(config,rows);
await fs.writeFile(file,JSON.stringify(result.config,null,2)+'\n');
const report={source:'Tester Spin local metadata and launch contracts',
 sourceRevision:args.get('--source-revision')||null,importedAt:new Date().toISOString(),
 executionEnabled:false,providers:result.summary};
await fs.writeFile('config/catalogs/launchers.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({providers:report.providers.length,importedProviders:report.providers.filter(p=>p.launchableGames).length,
 launchableGames:report.providers.reduce((n,p)=>n+p.launchableGames,0),enabledProviders:0}));
