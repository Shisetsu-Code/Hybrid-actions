// Keep Chromium's own TLS/cookie/redirect transport. Fetch interception checks
// every document redirect before dispatch, unlike Playwright route callbacks.
export async function guardDocumentNavigations(context,allowed,onAllowed=()=>{}){
 // A popup's first document precedes the page event. Resolve that single
 // response without automatic redirects; each next location re-enters the guard.
 await context.route('**/*',async route=>{
  const request=route.request();
  if(!request.isNavigationRequest())return route.fallback();
  if(!allowed(request.url()))return route.abort('blockedbyclient');
  let page;
  try{page=request.frame().page();}catch{}
  if(page&&attached.has(page)){
   try{await attached.get(page);return route.fallback();}
   catch{return route.abort('blockedbyclient').catch(()=>{});}
  }
  try{
   const response=await route.fetch({maxRedirects:0});
   const location=response.headers().location;
   if(response.status()>=300&&response.status()<400&&location){
    const next=new URL(location,request.url()).href;
    if(!allowed(next))return route.abort('blockedbyclient');
    const target=JSON.stringify(next).replaceAll('<','\\u003c');
    return route.fulfill({status:200,contentType:'text/html',body:`<script>location.replace(${target})</script>`});
   }
   return route.fulfill({response});
  }catch{return route.abort('failed').catch(()=>{});}
 });
 const attached=new WeakMap();
 const attach=page=>{
  if(attached.has(page))return attached.get(page);
  const promise=(async()=>{
   const session=await context.newCDPSession(page);
   session.on('Fetch.requestPaused',async event=>{
    try{
     if(!allowed(event.request.url)){
      await session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});return;
     }
     onAllowed(event.request.url,page);
     await session.send('Fetch.continueRequest',{requestId:event.requestId});
    }catch{/* A context can close while a document is paused. */}
   });
   await session.send('Fetch.enable',{patterns:[{urlPattern:'*',resourceType:'Document',requestStage:'Request'}]});
  })();
  attached.set(page,promise);return promise;
 };
 const originalNewPage=context.newPage.bind(context);
 context.newPage=async(...args)=>{const page=await originalNewPage(...args);await attach(page);return page;};
 context.on('page',page=>{attach(page).catch(()=>page.close().catch(()=>{}));});
 for(const page of context.pages())await attach(page);
}
