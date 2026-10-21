import {isImportedRuntimeFrame} from './tester-spin.mjs';
export async function selectVisibleImportedSurface(page,engine,provider,game){
 const frames=[];
 for(const frame of page.frames()){
  if(frame.isDetached()||!await isImportedRuntimeFrame(provider,frame,game))continue;
  if(await frame.locator('canvas:visible').count())frames.push(frame);
 }
 if(!frames.length)return null;
 return engine['select-frame'].bestFrame({frames:()=>frames,mainFrame:()=>page.mainFrame()},provider);
}
