import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
// GPT owns quality decisions. No OCR/model, balance vocabulary or automatic
// approval. Keep this browser and batch alive while waiting for feedback.
export async function reviewedScreenshot(snapshot,cloud,identity,{click,heartbeat=async()=>{},sleepFn=sleep,now=Date.now,maxMs=600000,maxSteps=20}={}){
 const sessionId=randomUUID(),deadline=now()+maxMs;let revision,commandId;
 for(let step=0;step<maxSteps&&now()<deadline;step++){
  const image=await snapshot(),form=new FormData();
  form.set('metadata',JSON.stringify({...identity,sessionId,...(revision?{revision,commandId}:{})}));
  form.set('image',new Blob([image],{type:'image/jpeg'}),'review.jpg');
  let review=(await cloud.call('/v1/capture-reviews',{method:'POST',role:'ingest',body:form})).review;
  console.log('CAPTURE_REVIEW '+JSON.stringify({id:review.id,revision:review.revision,status:review.status}));
  while(now()<deadline){
   await heartbeat();
   review=(await cloud.call('/v1/capture-reviews/command',{method:'POST',role:'ingest',body:{id:review.id,sessionId}})).review;
   if(review.status==='approved')return {image,validation:{status:'ready',reviewId:review.id,revision:review.revision,sourceImageSha256:review.imageSha256,validatorVersion:'gpt-review-1'}};
   if(review.action){
    if(review.action.kind==='click'){
     if(!click)throw Error('GPT click unavailable on this screenshot surface');
     await click(review.action);
    }else if(review.action.kind!=='wait')throw Error('Unknown GPT quality command');
    await sleepFn(review.action.waitMs);revision=review.revision;commandId=review.action.id;break;
   }
   if(review.status==='executing')throw Error('Command delivery uncertain; stop without repeating click');
   await sleepFn(5000);
  }
 }
 throw Error('GPT capture review pending: session/step budget ended; image remains unapproved in Worker');
}
export async function clickReviewPoint(page,box,action){
 const {x,y}=action;
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||!box||box.width<1||box.height<1)throw Error('Invalid GPT screenshot point');
 const px=box.x+x*box.width,py=box.y+y*box.height,v=page.viewportSize();
 if(!v||px<0||py<0||px>=v.width||py>=v.height)throw Error('GPT point outside game viewport');
 await page.mouse.click(px,py);
}
