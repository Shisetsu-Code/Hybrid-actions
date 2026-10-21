// Shared public-DEMO consent handler. Operator confirmed age >18.
// Only known CMP/age-gate surfaces are clicked; never a game button.
// Cookie policy: ACCEPT all, as explicitly requested by operator.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cookies=[
 {root:'#cookiescript_injected_wrapper',buttons:'#cookiescript_accept, #cookiescript_accept_all',
  names:/^(?:accept all(?: cookies)?|allow all(?: cookies)?|aceptar todas?(?: las cookies)?|accept cookies|i accept)$/i,api:true},
 {root:'#onetrust-banner-sdk',buttons:'#onetrust-accept-btn-handler',
  names:/^(?:accept all(?: cookies)?|allow all(?: cookies)?)$/i},
 {root:'#CybotCookiebotDialog',buttons:'#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  names:/^(?:allow all(?: cookies)?|accept all(?: cookies)?)$/i},
 {root:'#didomi-host',buttons:'button[id*="agree" i],button[id*="accept" i]',
  names:/^(?:agree (?:and close)?|accept all(?: cookies)?|agree to all)$/i},
 {root:'.qc-cmp2-container',buttons:'button[mode="primary"]',
  names:/^(?:accept all|agree|accept cookies)$/i}
];
const ages=[
 {root:'.age-conf-container',buttons:'[id*="yes" i], [class*="confirm" i]',
  names:/^(?:yes|yes,? i(?:'|’)m (?:over|above) 18|i(?:'|’)m (?:over|above) 18|i am (?:over|above) 18)$/i},
 {root:'[data-testid="age-verification"]',buttons:'button[data-age-gate-confirm="true"]',
  names:/^(?:i am (?:18|over 18)|yes,? i am (?:18|over 18)|enter)$/i},
 {root:'#age-verification',buttons:'button[data-age-gate-confirm="true"]',
  names:/^(?:i am (?:18|over 18)|yes,? i am (?:18|over 18)|enter)$/i},
 {root:'[data-age-gate="true"]',buttons:'button[data-age-gate-confirm="true"]',
  names:/^(?:i am (?:18|over 18)|yes,? i am (?:18|over 18)|enter)$/i}
];
async function visible(target){return Boolean(await target.isVisible().catch(()=>false));}
async function clickVerified(root,definition){
 const action=root.locator(definition.buttons).first();
 if(await visible(action)){
  await action.click({timeout:6000});
  return true;
 }
 const named=root.getByRole('button',{name:definition.names}).first();
 if(await visible(named)){await named.click({timeout:6000});return true;}
 const fallback=root.getByText(definition.names).first();
 if(await visible(fallback)){await fallback.click({timeout:6000});return true;}
 return false;
}
export async function acceptKnownPublicDemoOverlays(page,{
 confirmAdult=true,graceMs=250,requireClear=false
}={}){
 const status={cookiesAccepted:0,ageConfirmed:false};
 // Re-check after hydration: cookie and age dialogs may appear separately.
 for(let pass=0;pass<3;pass++){
  if(pass>0&&graceMs>0)await sleep(Math.min(900,graceMs));
  let acted=false;
  for(const def of cookies){
   const root=page.locator(def.root).first();
   if(!await visible(root))continue;
   let clicked=await clickVerified(root,def);
   if(!clicked&&def.api){
    // CookieScript documented action, equivalent to Accept All in its UI.
    clicked=await page.evaluate(()=>{
     const instance=window.CookieScript?.instance;
     if(typeof instance?.acceptAllAction!=='function')return false;
     instance.acceptAllAction();return true;
    }).catch(()=>false);
   }
   if(!clicked)throw Error('Visible cookie consent dialog has no verified Accept All control: '+def.root);
   await root.waitFor({state:'hidden',timeout:8000});
   status.cookiesAccepted++;acted=true;
  }
  for(const def of ages){
   const root=page.locator(def.root).first();
   if(!await visible(root))continue;
   if(confirmAdult!==true){
    const e=Error('Adult confirmation was not authorized');e.code='ADULT_CONFIRMATION_REQUIRED';throw e;
   }
   if(!await clickVerified(root,def))throw Error('Visible age verification has no verified adult-YES control: '+def.root);
   await root.waitFor({state:'hidden',timeout:8000});
   status.ageConfirmed=true;acted=true;
  }
  // Pragmatic's age gate sometimes appears as a standalone explicit button.
  const inline=page.locator('button[data-age-gate-confirm="true"]').first();
  if(await visible(inline)){
   if(confirmAdult!==true){
    const e=Error('Adult confirmation was not authorized');e.code='ADULT_CONFIRMATION_REQUIRED';throw e;
   }
   await inline.click({timeout:6000});status.ageConfirmed=true;acted=true;
  }
  if(!acted&&pass>0)break;
 }
 if(requireClear){
  for(const def of [...cookies,...ages]){
   if(await visible(page.locator(def.root).first()))
    throw Error('Consent/age overlay still blocks public DEMO: '+def.root);
  }
 }
 return status;
}
