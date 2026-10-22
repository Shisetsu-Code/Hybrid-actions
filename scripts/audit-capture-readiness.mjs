// Read existing JPEGs, store private validation diagnostics; never alter items.
import fs from 'node:fs/promises';import {CloudClient} from '../src/client.mjs';
import {validateCapturedImage} from '../src/capture-validator.mjs';import {verifyStoredCapture} from '../src/capture-integrity.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('GitHub Actions only');
const runId=process.env.PILOT_RUN_ID;
const cloud=new CloudClient({baseUrl:process.env.HYBRID_FUZZER_URL,reviewToken:process.env.HYBRID_REVIEW_TOKEN,ingestToken:process.env.HYBRID_INGEST_TOKEN});
await cloud.requireReady();
const config=JSON.parse(await fs.readFile('config/batches/catalog-300-20261021.json','utf8'));
const report={runId,items:[]};
for(const provider of config.providers)for(const game of provider.games.filter((game,index)=>index<2||provider.id==='ka_gaming'&&game.id==='777vegas')){
 const id=[runId,provider.id,game.id,'base'].join(':');
 try{
  const {item,image,imageSha256}=await verifyStoredCapture(cloud,id);
  const info={runId,provider:provider.id,gameId:game.id};
  let result=await validateCapturedImage(cloud,info,image);
  if(item.status==='classified'&&result.status==='ready'){
   result=await validateCapturedImage(cloud,info,image,{reference:{id,provider:provider.id,gameId:game.id,imageSha256,anchors:result.anchors,image:image.toString('base64')}});
  }
  report.items.push({id,status:result.status,reasons:result.reasons,previewId:result.reportId});
  console.log('VALIDATION_AUDIT '+JSON.stringify(report.items.at(-1)));
 }catch(error){if(error.status===404){report.items.push({id,status:'missing'});continue;}throw error;}
}
await fs.writeFile('validation-summary.json',JSON.stringify(report,null,2));
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'## Screenshot readiness audit\n\n'+report.items.map(x=>`- ${x.id}: ${x.status} ${(x.reasons||[]).join(', ')}`).join('\n')+'\n\nPrivate annotated images are accessible through the validation MCP tools. No classifications were changed.\n');
