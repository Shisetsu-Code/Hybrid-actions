import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const cache=new WeakMap();
const sha=image=>createHash('sha256').update(image).digest('hex');
function runImageCheck(payload){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('Capture validation runs exclusively in GitHub Actions');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.TESTER_SPIN_PYTHON||'python3',[fileURLToPath(new URL('../scripts/validate-capture.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  let output='',size=0;const timer=setTimeout(()=>{child.kill();reject(Error('image validation timed out'));},45000);
  child.stdout.on('data',bytes=>{size+=bytes.length;if(size>9*1024*1024){child.kill();return;}output+=bytes;});
  child.stderr.on('data',()=>{});child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error('image validator failed');resolve(JSON.parse(output));}catch(e){reject(e);}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
 });
}
async function approvedReference(cloud,info){
 let entries=cache.get(cloud);if(!entries){entries=new Map();cache.set(cloud,entries);}
 const key=JSON.stringify([info.provider,info.gameId]);
 if(!entries.has(key))entries.set(key,(async()=>{
  const {reference}=await cloud.call('/v1/validation-reference?'+new URLSearchParams({provider:info.provider,gameId:info.gameId}));
  if(!reference)return null;
  const response=await fetch(cloud.baseUrl+'/v1/items/'+encodeURIComponent(reference.id)+'/image',{headers:{Authorization:'Bearer '+cloud.reviewToken},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('approved reference unavailable');const bytes=Buffer.from(await response.arrayBuffer());
  if(sha(bytes)!==reference.imageSha256)throw Error('approved reference image hash mismatch');
  return {...reference,image:bytes.toString('base64')};
 })());
 return entries.get(key);
}
export async function validateCapturedImage(cloud,info,image,{analyze=runImageCheck,reference,store=true}={}){
 if(reference===undefined)reference=await approvedReference(cloud,info);
 let result;
 try{result=await analyze({provider:info.provider,gameId:info.gameId,image:image.toString('base64'),reference});}
 catch{result={status:'uncertain',reasons:['validator-unavailable'],anchors:[],validatorVersion:'1',preview:image.toString('base64')};}
 const {preview,...details}=result;
 const report={...details,runId:info.runId,provider:info.provider,gameId:info.gameId,sourceImageSha256:sha(image),...(reference?{referenceId:reference.id,referenceSha256:reference.imageSha256}:{})};
 if(store){
  const form=new FormData();form.set('metadata',JSON.stringify(report));form.set('image',new Blob([Buffer.from(preview,'base64')],{type:'image/jpeg'}),'comparison.jpg');
  const saved=await cloud.call('/v1/validation-reports',{method:'POST',body:form,role:'ingest'});report.reportId=saved.report.id;
 }
 return report;
}
export function requireReady(validation){
 if(!['ready','intro'].includes(validation?.status)){
  const error=Error('CAPTURE_NOT_READY '+(validation?.status||'unknown')+': '+(validation?.reasons||[]).join(',')+(validation?.reportId?' report='+validation.reportId:''));error.code='CAPTURE_NOT_READY';throw error;
 }
}
export async function validatedScreenshot(snapshot,validate,{sleep=ms=>new Promise(done=>setTimeout(done,ms))}={}){
 let image,validation;
 for(let attempt=0;attempt<3;attempt++){
  image=await snapshot();if(!validate)return {image};
  validation=await validate(image);
  if(['ready','intro','blocked','overlay'].includes(validation.status))break;
  if(attempt<2)await sleep(8000);
 }
 requireReady(validation);return {image,validation};
}
