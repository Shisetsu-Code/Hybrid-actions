import {validateCapturedImage,requireReady} from './capture-validator.mjs';
import {createHash} from 'node:crypto';
// Small typed client for existing Hybrid Cloud Fuzzer REST contracts.
// Separate REVIEW and INGEST bearer credentials, never logged or persisted.
export class CloudClient{
 constructor({baseUrl,reviewToken,ingestToken,fetcher=fetch,timeoutMs=40000,captureValidator=validateCapturedImage}={}){
  if(!/^https:\/\//.test(baseUrl||''))throw Error('HYBRID_FUZZER_URL must be HTTPS');
  if(!reviewToken||!ingestToken)throw Error('HYBRID_REVIEW_TOKEN and HYBRID_INGEST_TOKEN required');
  this.baseUrl=baseUrl.replace(/\/$/,'');
  this.reviewToken=reviewToken;this.ingestToken=ingestToken;this.fetcher=fetcher;this.timeoutMs=timeoutMs;
  this.captureValidator=captureValidator;
 }
 async call(path,{method='GET',body=null,role='review'}={}){
  const headers={Authorization:'Bearer '+(role==='ingest'?this.ingestToken:this.reviewToken)};
  const init={method,headers,signal:AbortSignal.timeout(this.timeoutMs)};
  if(body!==null){
   if(body instanceof FormData)init.body=body;
   else{headers['Content-Type']='application/json';init.body=JSON.stringify(body);}
  }
  const response=await this.fetcher(this.baseUrl+path,init);
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const e=Error('Cloudflare '+response.status+' '+String(data.error||'request failed').slice(0,180)+' ('+path.split('?')[0]+')');
   e.status=response.status;throw e;
  }
  return data;
 }
 health(){return this.call('/health');}
 async requireReady(){
  // /health is unauthenticated and health itself does not need REVIEW_TOKEN.
  const response=await this.fetcher(this.baseUrl+'/health',{signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok||data.schemaVersion<4||data.pacingReady!==true||data.workforceReady!==true||data.captureValidationReady!==true)
   throw Error('Cloudflare schema 0004 or capture validator not deployed; refusing distributed execution');
  return data;
 }
 policies(){return this.call('/v1/work/provider/policies');}
 configurePolicy(provider,pacing){return this.call('/v1/work/provider/policy',{method:'POST',body:{provider,...pacing}});}
 jobs(runId){return this.call('/v1/work/providers?'+new URLSearchParams({runId}));}
 stats(runId){return this.call('/v1/work/stats?'+new URLSearchParams({runId}));}
 enqueue(runId,jobs){return this.call('/v1/work/jobs',{method:'POST',body:{runId,jobs}});}
 async claim(runId,role,provider,workerId){
  const result=await this.call('/v1/work/claim',{method:'POST',body:{runId,role,provider,workerId,leaseSeconds:900}});
  return result.job;
 }
 async renew(job,workerId){
  const result=await this.call('/v1/work/renew',{method:'POST',body:{id:job.id,workerId,leaseToken:job.leaseToken,leaseSeconds:900}});
  return result.job;
 }
 async complete(job,workerId,{ok,result=null,error=null}){
  const res=await this.call('/v1/work/finish',{method:'POST',body:{id:job.id,workerId,leaseToken:job.leaseToken,ok,result,error}});
  return res.job;
 }
 async defer(job,workerId,delaySeconds=15){
  const res=await this.call('/v1/work/defer',{method:'POST',body:{id:job.id,workerId,leaseToken:job.leaseToken,delaySeconds}});
  return res.job;
 }
 acquire(provider,runId,gameId,workerId){
  return this.call('/v1/work/provider/lease',{method:'POST',body:{provider,runId,gameId,workerId,leaseSeconds:900}});
 }
 renewSession(lease,workerId){
  return this.call('/v1/work/provider/renew',{method:'POST',body:{leaseId:lease.leaseId,workerId,leaseSeconds:900}});
 }
 releaseSession(lease,workerId){
  return this.call('/v1/work/provider/release',{method:'POST',body:{leaseId:lease.leaseId,workerId}});
 }
 heartbeat(runId,workerId,role='catalog'){
  return this.call('/v1/work/agent',{method:'POST',body:{runId,workerId,role,host:'github-actions',capacity:1}});
 }
 async existingCapture(runId,provider,gameId){
  try{return (await this.call('/v1/items/'+encodeURIComponent([runId,provider,gameId,'base'].join(':')))).item;}
  catch(e){if(e.status===404)return null;throw e;}
 }
 async uploadCapture(info,jpeg){
  let validation=info.metadata?.captureValidation;
  if(validation?.sourceImageSha256!==createHash('sha256').update(jpeg).digest('hex'))validation=await this.captureValidator(this,info,jpeg);
  requireReady(validation);info={...info,metadata:{...info.metadata,captureValidation:validation}};
  const form=new FormData();
  form.set('metadata',JSON.stringify(info));
  form.set('image',new Blob([jpeg],{type:'image/jpeg'}),info.gameId+'.jpg');
  const result=await this.call('/v1/items',{method:'POST',role:'ingest',body:form});
  if(result.item?.provider!==info.provider||result.item?.gameId!==info.gameId||result.item?.shotId!==info.shotId)
   throw Error('capture identity mismatch after upload');
  return result.item;
 }
 async claimStructured(runId){
  const response=await this.call('/v1/claim',{method:'POST',body:{runId,mode:'structured',leaseSeconds:900}});
  return response.item;
 }
 async saveStructured(item,decision,workerId){
  const result=await this.call('/v1/save',{method:'POST',body:{id:item.id,leaseId:item.leaseId,
   revision:item.revision,sourceSha256:item.sourceSha256,status:decision.status,
   selections:decision.selections||[],marks:[],reviewer:('gha-'+workerId).slice(0,80)}});
  return result.item;
 }
 async releaseCapture(item){
  return this.call('/v1/release',{method:'POST',body:{id:item.id,leaseId:item.leaseId,revision:item.revision}});
 }
}
