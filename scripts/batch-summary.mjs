import fs from 'node:fs/promises';
import {CloudClient} from '../src/client.mjs';
import {verifiedProviders} from '../src/pilot-plan.mjs';
const runId=process.env.PILOT_RUN_ID;
if(!/^[a-z0-9][a-z0-9_.-]{0,99}$/i.test(runId||''))throw Error('Invalid batch run ID');
const c=new CloudClient({baseUrl:process.env.HYBRID_FUZZER_URL,reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
const summary={runId,expectedProviders:12,expectedGames:600,providers:[],cleanupErrors:[],reportErrors:[]};
for(const provider of verifiedProviders){
 try{await c.configurePolicy(provider,{enabled:false,minStartIntervalMs:20000,maxActive:1});}
 catch{summary.cleanupErrors.push(provider);}
 let r;try{r=JSON.parse(await fs.readFile('batch-reports/batch50-'+provider+'/provider-report.json','utf8'));}catch{}
 if(r&&r.runId!==runId){summary.reportErrors.push(provider);r=null;}
 summary.providers.push({provider,attempts:r?.attempts?.length||0,
  stored:r?.attempts?.filter(x=>x.result==='stored'||x.result==='already-stored').length||0,
  errors:r?.attempts?.filter(x=>x.result==='error').map(x=>({gameId:x.gameId,error:x.error}))||[],
  failures:r?.failures||[],missingReport:!r});
}
summary.stored=summary.providers.reduce((n,p)=>n+p.stored,0);
summary.stats=await c.stats(runId);summary.finalPolicies=(await c.policies()).policies.filter(p=>verifiedProviders.includes(p.provider)).map(p=>({provider:p.provider,enabled:p.enabled}));
summary.finishedAt=new Date().toISOString();summary.readyForClassification=summary.stored>0;summary.complete=summary.stored===600;
await fs.writeFile('batch-summary.json',JSON.stringify(summary,null,2)+'\n');
const text='## Classification batch '+runId+'\n\n| Provider | Stored | Attempted | Errors |\n|---|---:|---:|---:|\n'+summary.providers.map(p=>`| ${p.provider} | ${p.stored} | ${p.attempts} | ${p.errors.length} |`).join('\n')+'\n\nImages are pending visual classification in private Cloudflare storage. No automatic classifications were performed.\n';
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,text);
console.log(text);
if(summary.cleanupErrors.length||summary.finalPolicies.some(p=>p.enabled)||summary.reportErrors.length)throw Error('Batch cleanup or report verification incomplete');
