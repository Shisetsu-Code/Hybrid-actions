import test from 'node:test';import assert from 'node:assert/strict';import {officialMobileLauncher} from '../src/playngo.mjs';

test('official preview launcher retains public practice DEMO restrictions',()=>{
 const html='"mobileUrl":"https://preview.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=game1096&lang=en_GB&practice=1&channel=mobile&demo=2"';
 assert.equal(officialMobileLauncher(html).hostname,'preview.playngonetwork.com');
 assert.throws(()=>officialMobileLauncher(html.replace('practice=1','practice=0')));
});
