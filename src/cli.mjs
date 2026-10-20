#!/usr/bin/env node
import path from 'node:path';
import {CloudClient} from './client.mjs';
import {loadConfig} from './config.mjs';
import {seedCatalogues} from './seed.mjs';
import {loadEngine} from './engine.mjs';
import {runFleet} from './scheduler.mjs';

const [mode,...argv]=process.argv.slice(2);
const args=Object.fromEntries(argv.map(x=>{
 if(!/^--[a-z-]+(?:=.+)?$/.test(x))throw Error('invalid argument '+x);
 const index=x.indexOf('=');
 return [x.slice(2,index<0?undefined:index),index<0?true:x.slice(index+1)];
}));
const config=await loadConfig(path.resolve(String(args.config||'config/providers.json')));
const cloud=new CloudClient({baseUrl:process.env.HYBRID_FUZZER_URL,
 reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
const log=(...msg)=>console.log(new Date().toISOString(),...msg);
if(mode==='seed'){
 const result=await seedCatalogues({cloud,config,log});
 log('SEED RESULT',JSON.stringify(result));
}else if(mode==='report'){
 await cloud.requireReady();
 const [jobs,stats,policies]=await Promise.all([cloud.jobs(config.runId),cloud.stats(config.runId),cloud.policies()]);
 const report={runId:config.runId,providers:jobs.providers,
  activePolicies:policies.policies.filter(x=>x.enabled).map(x=>({
   provider:x.provider,minStartIntervalMs:x.minStartIntervalMs,maxActive:x.maxActive})),
  captures:stats.captures,jobs:stats.jobs,activeAgents:stats.activeAgents};
 console.log(JSON.stringify(report,null,2));
}else if(mode==='worker'){
 await cloud.requireReady();
 const engine=await loadEngine(path.resolve(String(args.engine||'engine')));
 const runner=Number(args.runner||1);
 const slots=Number(args.slots||5),minutes=Number(args.minutes||60);
 if(!Number.isSafeInteger(runner)||runner<1||runner>64)throw Error('invalid runner index');
 if(!Number.isSafeInteger(slots)||slots<1||slots>6)throw Error('slots must be 1..6');
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>60)throw Error('duration must be 1..60 minutes');
 const runnerId='gha-'+String(process.env.GITHUB_RUN_ID||'local')+'-'+runner+'-'+
  String(process.env.GITHUB_RUN_ATTEMPT||1);
 const browser=await engine.chromium.launch({headless:true});
 try{
  const result=await runFleet({cloud,config,engine,browser,runnerId,
   lanes:slots,durationMinutes:minutes,waitMs:3500,
   confirmAdult:args['confirm-adult']===true,log});
  log('RUNNER RESULT',JSON.stringify(result));
 }finally{await browser.close();}
}else{
 throw Error('Usage: node src/cli.mjs seed|worker|report --config=config/providers.json [--slots=5 --minutes=60 --runner=1 --engine=engine]');
}
