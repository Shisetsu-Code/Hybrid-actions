import http from 'node:http';

// Mock only the remote HTTP boundary. Chromium, route.fetch responses, redirect
// validation, DOM launch controls and screenshots remain real.
export async function fixtureTransport(browser,documents){
 const requests=[];
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost').searchParams.get('url');
  requests.push(url);
  const response=documents.get(url)||{status:404,body:'Unknown fixture'};
  res.writeHead(response.status||200,{'content-type':'text/html',...response.headers});
  res.end(response.body||'');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/`;
 return {requests,browser:{async newContext(options){
  const context=await browser.newContext(options);
  const realRoute=context.route.bind(context);
  context.route=(pattern,handler)=>realRoute(pattern,route=>handler(new Proxy(route,{
   get(target,key){
    if(key==='fetch')return ()=>context.request.get(base+'?url='+encodeURIComponent(target.request().url()),{maxRedirects:0});
    const value=Reflect.get(target,key,target);
    return typeof value==='function'?value.bind(target):value;
   }
  })));
  await context.route('**/*',async route=>{
   if(!documents.has(route.request().url()))return route.abort();
   return route.fulfill({response:await route.fetch()});
  });
  return context;
 }},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
