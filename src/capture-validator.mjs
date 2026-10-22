import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const cache=new WeakMap();
const sha=image=>createHash('sha256').update(image).digest('hex');
function runImageCheck(payload){
 if(process.env.GITHUB_ACTIONS!=='true'&&process.env.HYBRID_LOCAL_OCR_TEST!=='true')throw Error('Capture validation requires GitHub Actions or explicit offline OCR test');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.TESTER_SPIN_PYTHON||'python3',[fileURLToPath(new URL('../scripts/validate-capture.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,OMP_THREAD_LIMIT:process.env.OMP_THREAD_LIMIT||'1'}});
  const failure=code=>Object.assign(Error('image validation '+code),{code});
  let output='',size=0;const timer=setTimeout(()=>{child.kill();reject(failure('validator-timeout'));},45000);
  child.stdout.on('data',bytes=>{size+=bytes.length;if(size>9*1024*1024){child.kill();reject(failure('validator-output-limit'));return;}output+=bytes;});
  child.stderr.on('data',()=>{});child.on('error',e=>{clearTimeout(timer);reject(failure(e.code==='ENOENT'?'python-missing':'validator-start-failed'));});
  child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw failure('validator-exit-failed');let data;try{data=JSON.parse(output);}catch{throw failure('validator-invalid-json');}resolve(data);}catch(e){reject(e);}});
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
 catch(error){result={status:'uncertain',reasons:['validator-unavailable'],ocr:{errorCode:/^(?:validator-[a-z-]+|python-missing)$/.test(error.code||'')?error.code:'validator-processing-error'},anchors:[],validatorVersion:'3',preview:image.toString('base64')};}
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
export async function validatedScreenshot(snapshot,validate,{sleep=ms=>new Promise(done=>setTimeout(done,ms)),clean=false,advanceIntro}={}){
 if(clean&&validate)return cleanScreenshot(snapshot,validate,{sleep,advanceIntro});
 let image,validation;
 for(let attempt=0;attempt<3;attempt++){
  image=await snapshot();if(!validate)return {image};
  validation=await validate(image);
  if(['ready','intro','blocked','overlay'].includes(validation.status)||validation.reasons?.includes('validator-unavailable'))break;
  if(attempt<2)await sleep(8000);
 }
 requireReady(validation);return {image,validation};
}

export async function cleanScreenshot(snapshot,validate,{sleep=ms=>new Promise(done=>setTimeout(done,ms)),advanceIntro}={}){
 let previous=null,validation,image,clicks=0;const prompts=new Set();
 for(let attempt=0;attempt<8;attempt++){
  image=await snapshot();validation=await validate(image);
  if(validation.status==='blocked'||validation.reasons?.includes('validator-unavailable'))break;
  if(validation.status==='intro'){
   previous=null;const action=validation.introAction;
   const key=action&&JSON.stringify([action.text,action.rect.map(n=>Math.round(n*100))]);
   if(!advanceIntro||!validIntroAction(action)||clicks>=3||prompts.has(key))break;
   prompts.add(key);clicks++;await advanceIntro(action);await sleep(2000);continue;
  }
  const balance=validation.balanceEvidence;
  if(validation.status==='ready'&&validBalance(balance)){
   if(previous&&balance.rect.every((n,i)=>Math.abs(n-previous.rect[i])<.025))
    return {image,validation:{...validation,cleanCapture:{version:'1',stableBalance:true,introClicks:clicks,observations:2}}};
   previous=balance;await sleep(2000);continue;
  }
  previous=null;
  if(validation.status==='overlay')break;
  if(attempt<7)await sleep(8000);
 }
 const error=Error('CAPTURE_NOT_CLEAN '+(validation?.status||'unknown')+': '+(validation?.reasons||[]).join(',')+'; stable balance and unobstructed interface required'+(validation?.reportId?' report='+validation.reportId:''));
 error.code='CAPTURE_NOT_READY';throw error;
}
function validRect(rect){return Array.isArray(rect)&&rect.length===4&&rect.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&rect[2]>0&&rect[3]>0&&rect[0]+rect[2]<=1.001&&rect[1]+rect[3]<=1.001;}
function validBalance(balance){return balance&&validRect(balance.rect)&&/^\d+(?:[.,]\d+)*$/.test(balance.amount||'');}
export function validIntroAction(action){
 return action?.kind==='intro'&&validRect(action.rect)&&/^(?:(?:click|tap|press)(?: anywhere)? to (?:continue|start|begin)|(?:click|tap|press) anywhere(?: to (?:continue|start|begin))?|(?:haz clic|pulsa|toca|presiona)(?: en cualquier (?:parte|lugar))? para (?:continuar|comenzar|iniciar)|start|continue|continuar|comenzar|iniciar)$/.test(action.text||'');
}
