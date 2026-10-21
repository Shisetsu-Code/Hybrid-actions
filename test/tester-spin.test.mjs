import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,providerForUrl} from '../src/config.mjs';
import * as imported from '../src/tester-spin.mjs';
import {seedCatalogues} from '../src/seed.mjs';

const d1='https://gs.1spin4win.com:10443/gmh5/games.html?game=TenLuckySpins&currency=EUR&config=1&freeplay=true&language=en&exit=none';
const ka='https://gamesdemo.kaga88.com/?g=CapyGo123&p=demo&u=123&t=123&ak=accessKey&cr=USD&loc=es&l=https%3A%2F%2Fwww.kaga88.com%2F';
test('source-derived Pragmatic launch cannot bypass a visible age confirmation',async()=>{
 let navigated=false;
 const page={url:()=> 'https://www.pragmaticplay.com/en/games/example/',
  locator:()=>({count:async()=>1}),goto:async()=>{navigated=true;}};
 await assert.rejects(imported.openImportedDemo(page,'pragmatic',{
  url:page.url(),symbol:'vs20example'
 }),/Tester Spin DEMO launch failed/);
 assert.equal(navigated,false);
});
function config(id,url,launcher='tester-spin-v1'){
 const u=new URL(url);
 return {runId:'test-import',providers:[{id,enabled:true,approved:true,launcher,
  pacing:{minStartIntervalMs:20000,maxActive:1},allowlist:[{origin:u.origin,pathPrefix:'/'}],
  games:[{id:'fixture',url,symbol:id==='1spin4win'?'TenLuckySpins':'CapyGo123'}]}]};
}

test('imported 1Spin4Win DEMO keeps its required port and public freeplay parameters',()=>{
 const c=validateConfig(config('1spin4win',d1));
 assert.equal(c.providers[0].games[0].url,d1);
 assert.equal(c.providers[0].games[0].symbol,'TenLuckySpins');
 assert.equal(c.providers[0].launcher,'tester-spin-v1');
 assert.equal(providerForUrl(c,'1spin4win',d1).id,'1spin4win');
});

test('KA demo parameters survive seeding configuration without enabling real mode',()=>{
 const c=validateConfig(config('ka_gaming',ka));
 assert.equal(c.providers[0].games[0].url,ka);
 assert.throws(()=>validateConfig(config('ka_gaming',ka.replace('p=demo','p=real'))));
 assert.throws(()=>validateConfig(config('ka_gaming',ka+'&token=private')));
 assert.throws(()=>validateConfig(config('ka_gaming',ka+'&p=real')));
});

test('import-specific URL support never relaxes ordinary catalogue URLs or other provider hosts',()=>{
 assert.throws(()=>validateConfig(config('1spin4win',d1,'')));
 assert.throws(()=>validateConfig(config('1spin4win',d1.replace('freeplay=true','freeplay=false'))));
 assert.throws(()=>validateConfig(config('1spin4win',d1.replace('10443','10444'))));
 assert.throws(()=>validateConfig(config('1spin4win',d1.replace('gs.1spin4win.com','attacker.example'))));
 assert.throws(()=>validateConfig(config('ka_gaming',ka.replace('gamesdemo.kaga88.com','127.0.0.1'))));
});

test('fresh launch selection reuses Belatra and Yggdrasil demo targets and rejects real or ambiguous targets',()=>{
 assert.equal(imported.selectImportedTarget('belatra',[
  'https://attacker.example/?game=20icyfruits',
  'https://demo.bltr-static.com/belatra/demo?game=20icyfruits&language=es'
 ]),'https://demo.bltr-static.com/belatra/demo?game=20icyfruits&language=es');
 assert.equal(imported.selectImportedTarget('yggdrasil',[
  'https://staticdemo.yggdrasilgaming.com/init/launchClient.html?gameid=123&org=Demo'
 ],'123'),'https://staticdemo.yggdrasilgaming.com/init/launchClient.html?gameid=123&org=Demo');
 assert.throws(()=>imported.selectImportedTarget('yggdrasil',[
  'https://staticdemo.yggdrasilgaming.com/init/launchClient.html?gameid=999&org=Demo'
 ],'123'));
 assert.throws(()=>imported.selectImportedTarget('belatra',[
  'https://demo.bltr-static.com/belatra/demo?game=one',
  'https://demo.bltr-static.com/belatra/demo?game=two'
 ]));
});

test('RubyPlay resolves the complete FUN launcher rather than a placeholder or doubled game name',()=>{
 const base='https://prrpeu3.com/launcher?gamename=rp_71&operator=rubyplay.com&server_url=https%3A%2F%2Fsrv.prrpeu3.com';
 const full=base+'&currency=EUR&mode=fun&lang=en';
 assert.equal(imported.selectImportedTarget('rubyplay',[base,full]),full);
 assert.equal(new URL(imported.selectImportedTarget('rubyplay',[
  full.replace('rp_71','rp_71rp_71')])).searchParams.get('gamename'),'rp_71');
 assert.throws(()=>imported.selectImportedTarget('rubyplay',[full.replace('mode=fun','mode=real')]));
 assert.throws(()=>imported.selectImportedTarget('rubyplay',[full.replace('https%3A%2F%2Fsrv.prrpeu3.com','https%3A%2F%2Fattacker.example')]));
});

test('runtime navigation permits BGaming demo redirects while refusing other hosts and product pages as a game',()=>{
 assert.equal(imported.isImportedRuntime('bgaming','https://aztecs-claw-wild-dice.demo.bgaming-network.com/hyperhive?play_token=fresh'),true);
 assert.equal(imported.isImportedRuntime('bgaming','https://demo.bgaming-network.com.attacker.example/play/Test/FUN'),false);
 assert.equal(imported.isImportedRuntime('bgaming','https://bgaming.com/games/test'),false);
 assert.equal(imported.isImportedRuntime('bgaming','https://demo.bgaming-network.com/play/Test/FUN?server=real'),false);
 assert.equal(imported.isImportedRuntime('belatra','https://belatragames.com/es/games/game/test'),false);
 assert.equal(imported.isImportedRuntime('playtech','https://cachedownload.playtechone.com/ngmdesktop/casinoclient.html?game=gpas_test&preferedmode=offline&real=0'),true);
 assert.equal(imported.isImportedRuntime('playtech','https://cachedownload.playtechone.com/ngmdesktop/casinoclient.html?game=gpas_test&preferedmode=offline&real=1'),false);
 assert.equal(imported.isImportedRuntime('3oaks','https://static.3oaks.com/gs/clients_html/test/index.html'),true);
 assert.equal(imported.isImportedRuntime('3oaks','https://static.3oaks.com/marketing/index.html'),false);
});

test('provider symbols reach seeded tickets so the existing launchers receive their actual game identity',async()=>{
 const jobs=[];
 await seedCatalogues({config:validateConfig(config('ka_gaming',ka)),cloud:{
  requireReady:async()=>{},configurePolicy:async()=>{},enqueue:async(runId,chunk)=>{
   jobs.push(...chunk);return {inserted:chunk.length,existing:0,jobs:[]};
  }
 }});
 assert.equal(jobs[0].payload.game.symbol,'CapyGo123');
});

test('legacy Tester Spin links keep direct 1Spin4Win HTML clients and provider punctuation',()=>{
 const legacy='https://gs.1spin4win.com:10443/gmh5/boomingfruits20.html?currency=EUR&config=1&freeplay=true&language=en';
 assert.equal(imported.importedEntryUrl('1spin4win',legacy).href,legacy);
 assert.equal(imported.importedEntryUrl('1spin4win',d1.replace('&exit=none','')).searchParams.get('game'),'TenLuckySpins');
 assert.equal(imported.importedEntryUrl('belatra',"https://belatragames.com/es/games/game/bear's-tricks").pathname,"/es/games/game/bear's-tricks");
 assert.equal(imported.importedEntryUrl('yggdrasil','https://yggdrasilgaming.com/games/cazino_cosmos/').pathname,'/games/cazino_cosmos/');
});

test('Pragmatic uses the existing gameSymbol and extGame launch identities without accepting conflicts',()=>{
 const open='https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=vs_test&websiteUrl=https%3A%2F%2Fdemogamesfree.pragmaticplay.net&jurisdiction=99&lang=en&cur=USD';
 assert.equal(imported.selectImportedTarget('pragmatic',[open],'vs_test'),open);
 const ext='https://demogamesfree.pragmaticplay.net/gs2c/html5Game.do?extGame=vs_test&mgckey=fresh';
 assert.equal(imported.selectImportedTarget('pragmatic',[ext],'vs_test'),ext);
 assert.equal(imported.isImportedRuntime('pragmatic',open+'&symbol=different'),false);
});

test('Playtech child frames stay scoped to the saved game code',()=>{
 const game={symbol:'ashabw'};
 assert.equal(imported.isImportedRuntime('playtech','https://cachedownload.playtechone.com/games/ashabw/index.html',game),true);
 assert.equal(imported.isImportedRuntime('playtech','https://cachedownload.playtechone.com/games/other/index.html',game),false);
 assert.equal(imported.isImportedRuntime('playtech','https://cachedownload.playtechone.com/games/ashabw/index.html?real=1',game),false);
});

test('Red Tiger follows Evolution showcase and only the runtime origin recorded for that game',()=>{
 const game={runtimeOrigins:['https://gserver-evo-93212de3kbqabvry.redtiger.cash']};
 assert.equal(imported.isImportedRuntime('redtiger','https://showcase.evo-games.com/entry?token=fresh',game),true);
 assert.equal(imported.isImportedRuntime('redtiger','https://gserver-evo-93212de3kbqabvry.redtiger.cash/game/index.html?token=fresh',game),true);
 assert.equal(imported.isImportedRuntime('redtiger','https://unapproved.redtiger.cash/game/index.html',game),false);
 assert.equal(imported.isImportedRuntime('redtiger','https://attacker.example/game/index.html',game),false);
 const frame='https://gserver-evo-93212de3kbqabvry.redtiger.cash/game/index.html?token=fresh';
 assert.equal(imported.selectImportedTarget('redtiger',['https://showcase.evo-games.com/entry?token=fresh',frame],'',game),frame);
});
