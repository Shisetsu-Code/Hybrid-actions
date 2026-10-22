import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateConfig,providerForUrl} from '../src/config.mjs';
import {discoverySubject,seedCatalogues} from '../src/seed.mjs';
import {CloudClient} from '../src/client.mjs';
import {chooseProvider,remainingWork,runFleet} from '../src/scheduler.mjs';
import {executeTicket} from '../src/execute.mjs';

const slug=id=>({id,enabled:true,approved:true,
 pacing:{minStartIntervalMs:20000,maxActive:2},
 allowlist:[{origin:'https://www.pragmaticplay.fun',pathPrefix:'/en/slots/'}],
 games:[{id:'game-'+id,url:'https://www.pragmaticplay.fun/en/slots/game-'+id+'/'}],sources:[]});
function setup(n=6){
 return validateConfig({runId:'test-run',providers:Array.from({length:n},(_,i)=>slug('p'+(i+1)))});
}
test('configuration requires explicit provider approvals, origins and independent pacing',()=>{
 const a=setup(6);assert.equal(a.providers.length,6);
 assert.equal(providerForUrl(a,'p1','https://www.pragmaticplay.fun/en/slots/game-p1/').id,'p1');
 assert.throws(()=>providerForUrl(a,'p1','https://other.host/en/slots/evil/'),/outside/);
 assert.throws(()=>validateConfig({runId:'test-run',providers:[{...slug('bad'),approved:false}]}),/approval/);
 assert.throws(()=>validateConfig({runId:'test-run',providers:[{...slug('bad'),pacing:{minStartIntervalMs:0,maxActive:4}}]}),/minStartIntervalMs/);
 assert.throws(()=>validateConfig({runId:'test-run',providers:[{...slug('bad'),allowlist:[{origin:'http://127.0.0.1',pathPrefix:'/'}]}]}),/HTTPS|invalid/);
 assert.equal(validateConfig({runId:'test-run',providers:[{id:'unconfigured',enabled:false}]}).providers.length,0);
});
test('each provider has a durable, reusable discovery epoch and its own policy',async()=>{
 const source={id:'source-alpha',approved:true,verifiedDemo:true,enabled:true,provider:'p1',
  gameUrlPrefix:'https://www.pragmaticplay.fun/en/slots/',
  indexUrls:['https://www.pragmaticplay.fun/en/slots/'],gamePathPattern:'^/en/slots/[a-z0-9-]+/$'};
 const cfg=validateConfig({runId:'test-run',providers:[{...slug('p1'),sources:[source]}]});
 const made=[];const policies=[];
 const cloud={requireReady:async()=>({schemaVersion:4}),
  configurePolicy:async(...args)=>{policies.push(args);},
  enqueue:async(runId,jobs)=>{made.push(...jobs);return {inserted:jobs.length,existing:0,jobs:[]};}};
 const first=await seedCatalogues({cloud,config:cfg,at:1_000_000});
 assert.equal(first.catalogueTickets,1);
 assert.equal(first.discoveryTickets,1);
 assert.deepEqual(policies[0],['p1',{minStartIntervalMs:20000,maxActive:2,enabled:true}]);
 assert.equal(made.filter(x=>x.role==='discovery')[0].subject,discoverySubject('source-alpha',1_000_000));
 assert.equal(made.find(x=>x.role==='catalog').payload.game.id,'game-p1');
 assert.throws(()=>discoverySubject('../unsafe'),/invalid/);
});
test('scheduler never selects an active provider and respects fairness',()=>{
 const allowed=['pragmatic','playtech','3oaks','rubyplay','belatra','x'];
 const w={providers:allowed.map(provider=>({provider,discovery:{pending:0,leased:0},
  catalog:{pending:3,leased:0}}))};
 const active=new Set(['pragmatic','playtech']);
 assert.equal(chooseProvider(w,allowed,active,0).provider,'3oaks');
 assert.equal(chooseProvider(w,allowed,active,3).provider,'rubyplay');
 assert.equal(remainingWork(w),18);
 w.providers[0].discovery.pending=2;
 assert.equal(chooseProvider(w,allowed,new Set(),0).role,'discovery');
});
test('one runner runs six DIFFERENT providers concurrently and stops at exhausted catalogue',async()=>{
 const cfg=setup(6);const jobs=new Map(cfg.providers.map(p=>[p.id,[{role:'catalog',
  provider:p.id,subject:'game-'+p.id,id:p.id,leaseToken:'t-'+p.id}]]));
 let current=0,max=0,nowMs=1000000,starts=0;
 let finishBatch;
 const batchBarrier=new Promise(resolve=>{finishBatch=resolve;});
 const cloud={
  jobs:async()=>({providers:[...jobs].map(([provider,items])=>({provider,
   discovery:{pending:0,leased:0},catalog:{pending:items.length,leased:0}}))}),
  stats:async()=>({jobs:{catalog:{pending:0}},captures:{structured:0,visual:1,hybrid:0}}),
  heartbeat:async()=>({}),
  claim:async(_run,_role,provider)=>jobs.get(provider).shift()||null
 };
 const result=await runFleet({cloud,config:cfg,engine:{},browser:{},runnerId:'gha-01',
  lanes:6,durationMinutes:15,classification:false,
  now:()=>nowMs,sleepFn:async ms=>{nowMs+=ms;await Promise.resolve();},
  execute:async({job})=>{
   current++;starts++;max=Math.max(max,current);
   // All six contexts must be admitted before any one completes.
   if(starts===6)finishBatch();
   await batchBarrier;
   current--;return {status:'done'};
  },
  log:()=>{}});
 assert.equal(result.completed,6);
 assert.equal(result.failed,0);
 assert.equal(starts,6);
 assert.equal(max,6);
 assert.equal(result.visualPending,1);
});
test('provider permit is required BEFORE public DEMO capture; successful capture reaches R2/D1',async()=>{
 const config=setup(1);const p=config.providers[0],job={id:'j1',role:'catalog',provider:'p1',subject:'game-p1',
  payload:{game:{provider:'p1',id:'game-p1',url:p.games[0].url}},leaseToken:'lt'};
 let permitCalls=0,uploads=0,releases=0,browserCalls=0;
 const cloud={
  existingCapture:async()=>null,
  acquire:async()=>{permitCalls++;return permitCalls===1?{granted:false,reason:'pacing',retryAfterMs:1000}:{granted:true,leaseId:'lease-valid'};},
  renew:async()=>({}),renewSession:async()=>({}),
  uploadCapture:async(info,image)=>{uploads++;assert.equal(info.runId,'test-run');assert.equal(image[0],255);return {id:'test-run:p1:game-p1:base'};},
  complete:async()=>({status:'done'}),releaseSession:async()=>{releases++;}
 };
 const result=await executeTicket({cloud,job,workerId:'gha-1',runId:'test-run',
  browser:{},engine:{},config,deadline:Date.now()+15*60000,
  sleepFn:async()=>{},capture:async()=>{
   assert.equal(permitCalls,2);browserCalls++;
   return {info:{runId:'test-run',provider:'p1',gameId:'game-p1',shotId:'base'},image:Buffer.from([255,216,255,217])};
  }});
 assert.equal(result.status,'done');assert.equal(uploads,1);assert.equal(releases,1);assert.equal(browserCalls,1);
});
test('disabled/unconfigured provider never opens a game and defers without burning retries',async()=>{
 const config=setup(1),job={id:'j2',role:'catalog',provider:'p1',subject:'game-p1',
  payload:{game:{provider:'p1',id:'game-p1',url:config.providers[0].games[0].url}},leaseToken:'lt'};
 let deferred=0,started=0;
 const cloud={existingCapture:async()=>null,acquire:async()=>({granted:false,reason:'unconfigured'}),
  defer:async()=>{deferred++;return {status:'pending'};}};
 const result=await executeTicket({cloud,job,workerId:'gha-1',runId:'test-run',
  browser:{},engine:{},config,deadline:Date.now()+15*60000,
  capture:async()=>{started++;}});
 assert.equal(result.status,'deferred');assert.equal(deferred,1);assert.equal(started,0);
});
test('review and ingest bearer tokens remain segregated; existing items are not overwritten',async()=>{
 const sent=[];
 const fetcher=async(url,options)=>{
  sent.push({url,auth:options.headers.Authorization,method:options.method});
  const data=url.endsWith('/v1/items/test-run%3Ap1%3Agame-p1%3Abase')
   ?{item:{id:'test-run:p1:game-p1:base',status:'classified'}}
   :{item:{id:'test-run:p1:game-p1:base',provider:'p1',gameId:'game-p1',shotId:'base'}};
  return {ok:true,status:200,json:async()=>data};
 };
 const cloud=new CloudClient({baseUrl:'https://worker.example',reviewToken:'secret-review',
  ingestToken:'secret-ingest',fetcher,captureValidator:async()=>({status:'ready',reasons:['test'],anchors:[]})});
 const existing=await cloud.existingCapture('test-run','p1','game-p1');
 assert.equal(existing.status,'classified');
 await cloud.uploadCapture({runId:'test-run',provider:'p1',gameId:'game-p1',shotId:'base'},Buffer.from([255,216,255,217]));
 assert.equal(sent[0].auth,'Bearer secret-review');
 assert.equal(sent[1].auth,'Bearer secret-ingest');
 assert.equal(sent[1].method,'POST');
});
test('workflow defaults to eight runners, five or six slots, <=60m and pinned engine',async()=>{
 const y=await fs.readFile(new URL('../.github/workflows/catalog.yml',import.meta.url),'utf8');
 assert.match(y,/matrix:[\s\S]*runner: \[1, 2, 3, 4, 5, 6, 7, 8\]/);
 assert.match(y,/max-parallel: 8/);
 assert.match(y,/options: \['5', '6'\]/);
 assert.match(y,/options: \['15', '30', '60'\]/);
 assert.match(y,/timeout-minutes: 75/);
 assert.match(y,/a41ceed63900a6a778c6e864e0ec8e7fe44a9e9d/);
 assert.ok(!/upload-artifact/.test(y));
});

test('a temporary D1 read failure does not stop the cataloguing runner',async()=>{
 const config=setup(1),provider='p1';
 let ticks=1000,reads=0,done=0;
 const cloud={
  jobs:async()=>{
   reads++;
   if(reads===1)throw Error('temporary Cloudflare 503');
   return {providers:[{provider,discovery:{pending:0,leased:0},
    catalog:{pending:done?0:1,leased:0}}]};
  },
  stats:async()=>({captures:{structured:0,visual:0,hybrid:0}}),
  heartbeat:async()=>({}),
  claim:async()=>done?null:{id:'a',role:'catalog',provider,subject:'game-p1'}
 };
 const output=await runFleet({cloud,config,engine:{},browser:{},runnerId:'gha-1',
  lanes:1,durationMinutes:15,classification:false,
  now:()=>ticks,sleepFn:async(ms)=>{ticks+=ms;await Promise.resolve();},
  execute:async()=>{done++;return {status:'done'};},log:()=>{}});
 assert.equal(done,1);assert.equal(output.completed,1);assert.ok(reads>=2);
});
