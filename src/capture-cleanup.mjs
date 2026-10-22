import {validIntroAction} from './capture-validator.mjs';

// Recheck every observation, including after intro clicks. Only recognizable
// cookie controls are dismissed; game menus and stake choices belong to GPT.
export async function clearCaptureCookies(page){
 const selectors=['#onetrust-reject-all-handler','.cky-btn-reject','#cookiescript_reject','#cookiescript_reject_all','.cmplz-deny'];
 for(const frame of page.frames()){
  for(const selector of selectors){
   const button=frame.locator(selector+':visible').first();
   if(await button.count()&&await button.isVisible())await button.click({timeout:3000});
  }
  for(const name of [/^(?:reject|decline) all(?: cookies)?$/i,/^(?:rechazar todas las cookies|rechazar todas|solo necesarias|only necessary cookies)$/i]){
   const button=frame.getByRole('button',{name,exact:true}).first();
   if(await button.count()&&await button.isVisible())await button.click({timeout:3000});
  }
 }
}
export async function clickCaptureIntro(page,box,action){
 if(!validIntroAction(action)||!box||box.width<160||box.height<140)throw Error('unverified capture intro');
 const [x,y,w,h]=action.rect;const viewport=page.viewportSize();
 const left=box.x+(x+w/2)*box.width,top=box.y+(y+h/2)*box.height;
 if(!viewport||left<0||top<0||left>=viewport.width||top>=viewport.height)throw Error('intro outside visible game surface');
 await page.mouse.click(left,top);
}
