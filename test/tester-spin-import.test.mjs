import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('Tester Spin import preserves public demo launch parameters and symbols but never copies an existing session',async()=>{
 const {prepareTesterSpinConfig}=await import('../src/tester-spin-import.mjs');
 const source={runId:'existing-run',providers:[{id:'pragmatic',enabled:true,pacing:{maxActive:5}},
  {id:'ka_gaming'},{id:'playtech'},{id:'bgaming'},{id:'1spin4win'},{id:'redtiger'},{id:'hacksaw'},{id:'amusnet'}]};
 const rows=[
  {provider:'pragmatic',slug:'game',url:'https://www.pragmaticplay.com/en/games/game/',symbol:'',
   metadata:{direct_game_link:'https://demogamesfree.pragmaticplay.net/gs2c/html5Game.do?symbol=vs_test&mgckey=PRIVATE_SESSION'}},
  {provider:'ka_gaming',slug:'test',symbol:'Test',url:'https://gamesdemo.kaga88.com/?g=Test&p=demo&u=123&t=123&ak=accessKey&cr=USD&loc=es&l=https%3A%2F%2Fwww.kaga88.com%2F'},
  {provider:'playtech',slug:'gpas-test',symbol:'gpas_test',url:'https://www.playtechone.com/game/gpas-test'},
  {provider:'bgaming',slug:'private',symbol:'Private',url:'https://demo.bgaming-network.com/play/Private/FUN?token=PRIVATE_SESSION'},
  {provider:'hacksaw',slug:'game',symbol:'123',url:'https://www.hacksawgaming.com/games/game'},
  {provider:'1spin4win',slug:'legacy',symbol:'legacy',url:'https://gs.1spin4win.com:10443/gmh5/legacy.html?currency=EUR&config=1&freeplay=true&language=en&currency=EUR&freeplay=true'},
  {provider:'redtiger',slug:'test',symbol:'123',url:'https://games.evolution.com/slots/test/',metadata:{
   runtime_bootstrap:'games_evolution_start_iframe_observed_settings',settings_url:'https://gserver-evo-93212de3kbqabvry.redtiger.cash/path/settings?token=PRIVATE_SESSION'}},
 ];
 const result=prepareTesterSpinConfig(source,rows);
 assert.equal(result.config.runId,'existing-run');
 assert.ok(result.config.providers.every(p=>p.enabled===false&&!p.pacing));
 const get=id=>result.config.providers.find(p=>p.id===id);
 assert.equal(get('pragmatic').games[0].symbol,'vs_test');
 assert.equal(get('ka_gaming').games[0].url,rows[1].url);
 assert.equal(get('playtech').games[0].url,'https://cachedownload.playtechone.com/ngmdesktop/casinoclient.html?game=gpas_test&preferedmode=offline&real=0');
 assert.equal(get('bgaming').games.length,0);
 assert.equal(new URL(get('1spin4win').games[0].url).searchParams.getAll('currency').length,1);
 assert.deepEqual(get('redtiger').games[0].runtimeOrigins,['https://gserver-evo-93212de3kbqabvry.redtiger.cash']);
 assert.equal(get('hacksaw').preparationStatus,'tester-spin-protocol-only-no-browser-launcher');
 assert.equal(get('amusnet').preparationStatus,'tester-spin-catalogue-only');
 assert.ok(!JSON.stringify(result).includes('PRIVATE_SESSION'));
 assert.equal(source.providers[0].enabled,true,'import must not mutate its input');
});

test('database import reads Tester Spin without starting providers or modifying the SQLite file',async()=>{
 const {readTesterSpinDatabase}=await import('../src/tester-spin-import.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tester-spin-import-'));
 const file=path.join(dir,'tester-spin.sqlite3');
 try{
  const db=new DatabaseSync(file);
  db.exec('CREATE TABLE games (provider TEXT, slug TEXT, name TEXT, url TEXT, symbol TEXT)');
  db.prepare('INSERT INTO games VALUES (?,?,?,?,?)').run('nolimit_city','test','Test','https://playin.com/embed/v1/demo/Test','Test');
  db.close();
  const before=await fs.readFile(file);
  const rows=readTesterSpinDatabase(file);
  assert.deepEqual(rows.map(r=>({...r})),[{provider:'nolimit_city',slug:'test',name:'Test',url:'https://playin.com/embed/v1/demo/Test',symbol:'Test'}]);
  assert.deepEqual(await fs.readFile(file),before);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
