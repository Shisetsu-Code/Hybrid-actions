import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

export function isKALauncherResource(raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='gamesdemo.kaga88.com'&&!u.port&&!u.username&&!u.password&&!u.hash;}
 catch{return false;}
}
export class CurlChromeClient{
 constructor(){
  this.pending=new Map();this.sequence=0;
  this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
  this.child=spawn(process.env.TESTER_SPIN_PYTHON||(process.platform==='win32'?'python':'python3'),
   ['-u',fileURLToPath(new URL('../scripts/tester-spin-http.py',import.meta.url))],{stdio:['pipe','pipe','ignore'],windowsHide:true});
  const fail=()=>{const e=Error('Tester Spin curl_cffi transport unavailable');this.rejectReady(e);for(const p of this.pending.values())p.reject(e);this.pending.clear();};
  this.child.on('error',fail);this.child.on('exit',fail);
  createInterface({input:this.child.stdout}).on('line',line=>{
   let data;try{data=JSON.parse(line);}catch{return fail();}
   if(data.ready)return this.resolveReady(data);
   const pending=this.pending.get(data.id);if(!pending)return;
   this.pending.delete(data.id);data.error?pending.reject(Error(data.error)):pending.resolve(data);
  });
 }
 async get(url,headers){
  if(!isKALauncherResource(url))throw Error('KA HTTP resource outside provider scope');
  await this.ready;
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   this.pending.set(id,{resolve,reject});this.child.stdin.write(JSON.stringify({id,url,headers})+'\n');
  });
 }
 close(){this.child.kill();}
}
export async function prepareKAPublicTransport({client=new CurlChromeClient()}={}){
 let timer;
 try{
  const profile=await Promise.race([client.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('KA HTTP profile startup timeout')),5000);})]);
  clearTimeout(timer);
  return {
   contextOptions:{userAgent:profile.userAgent,locale:'es-ES'},
   close:()=>client.close(),
   async install(context){
    await context.route('https://gamesdemo.kaga88.com/**',async route=>{
     try{
      if(route.request().method()!=='GET'||!isKALauncherResource(route.request().url()))return route.fallback();
      const response=await route.fetch({maxRedirects:0,timeout:40000});
      if(response.status()!==403)return route.fulfill({response});
      const fresh=await client.get(route.request().url(),route.request().headers());
      return route.fulfill({status:fresh.status,headers:fresh.headers,body:Buffer.from(fresh.body,'base64')});
     }catch{return route.abort('failed').catch(()=>{});}
    });
   }
  };
 }catch(error){clearTimeout(timer);client.close();throw error;}
}
