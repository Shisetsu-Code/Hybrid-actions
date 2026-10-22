import {validIntroAction} from './capture-validator.mjs';
export function eligibleEntry(block){
 const text=String(block.text||'').toLowerCase().trim().replace(/[.!]+$/,'');
 const action={kind:'intro',text,rect:block.rect};
 // Laya is measured, not trusted as sole click authority. The existing entry
 // contract also prevents a misclassified SPIN/purchase from being executed.
 return block.role==='entry'&&block.confidence>=.6&&block.entryProbability>=.75&&block.wagerProbability<=.15&&!block.truncated&&validIntroAction(action)?action:null;
}
export async function probeIntro(snapshot,analyze,{advanceIntro,verifyCurrent,save,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const observations=[],clicks=[];let image,previousHash;
 for(let step=0;step<4;step++){
  image=await snapshot();const reportId=await save(image,step);let result;
  try{result=await analyze(image);}catch{observations.push({step,reportId,error:'laya-analysis-failed'});return {image,probe:{outcome:'laya-analysis-failed',clicks,observations,gameReadyVerified:false}};}
  observations.push({step,reportId,...result});
  const candidates=result.blocks.filter(b=>b.role==='entry');
  if(!candidates.length)return {image,probe:{outcome:clicks.length?'intro-no-longer-detected':'no-intro-detected',clicks,observations,gameReadyVerified:false}};
  const action=candidates.map(eligibleEntry).find(Boolean);
  if(!action)return {image,probe:{outcome:'entry-detected-not-authorized',clicks,observations,gameReadyVerified:false}};
  if(step===3||result.visualHash===previousHash)return {image,probe:{outcome:'intro-still-visible',clicks,observations,gameReadyVerified:false}};
  const verification=verifyCurrent?await verifyCurrent(image,action):null;
  if(!verification?.ok)return {image,probe:{outcome:'entry-not-currently-verified',clicks,observations,gameReadyVerified:false}};
  await advanceIntro(action);clicks.push({...action,verification});previousHash=result.visualHash;await sleep(2500);
 }
}
