import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
// One visit per game. GPT reviews later; never poll or hold a browser open.
export async function reviewedScreenshot(snapshot,cloud,identity,{plan=null,click,sleepFn=sleep,verify=verifyReplay}={}){
 let image=await snapshot();const launchPath=[];
 if(plan){
  const steps=[...(plan.launchPath||[]),{action:plan.action,imageSha256:plan.imageSha256}];
  for(const step of steps){
   const action=step.action;if(!action)continue;
   if(action.kind==='click'){
    if(!click)throw Error('GPT click unavailable on this screenshot surface');
    if(!await verify(cloud,plan.id,step.imageSha256,image,action))return {image,reviewOutcome:{actionApplied:false,launchPath,reason:'reopened-screen-differs'}};
    await click(action);
   }else if(action.kind!=='wait')throw Error('Unknown GPT quality command');
   await sleepFn(action.waitMs);launchPath.push(step);image=await snapshot();
  }
 }
 return {image,reviewOutcome:{actionApplied:true,launchPath}};
}
async function verifyReplay(cloud,id,hash,image,action){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('Replay image comparison requires GitHub-hosted Actions');
 const response=await cloud.fetcher(cloud.baseUrl+'/v1/capture-review-images/'+encodeURIComponent(id)+'?sha256='+hash,{headers:{Authorization:'Bearer '+cloud.reviewToken},signal:AbortSignal.timeout(40000)});
 if(!response.ok)throw Error('Original command image unavailable');
 const reference=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(reference).digest('hex')!==hash)throw Error('Command reference hash mismatch');
 return new Promise((resolve,reject)=>{
  const child=spawn('python',['scripts/compare-capture.py'],{stdio:['pipe','pipe','ignore'],windowsHide:true});let output='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Replay comparison timeout'));},20000);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4096)child.kill();});
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('Replay comparison failed'));try{resolve(JSON.parse(output).match===true);}catch{reject(Error('Replay comparison invalid'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({reference:reference.toString('base64'),current:image.toString('base64'),x:action.x,y:action.y}));
 });
}
export async function clickReviewPoint(page,box,action){
 const {x,y}=action;
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||!box||box.width<1||box.height<1)throw Error('Invalid GPT screenshot point');
 const px=box.x+x*box.width,py=box.y+y*box.height,v=page.viewportSize();
 if(!v||px<0||py<0||px>=v.width||py>=v.height)throw Error('GPT point outside game viewport');
 await page.mouse.click(px,py);
}
