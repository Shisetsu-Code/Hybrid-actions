// Load the pinned public-DEMO engine checked out by GitHub Actions.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';

const cache=new Map();
export async function loadEngine(root){
 const resolved=path.resolve(root);
 if(cache.has(resolved))return cache.get(resolved);
 const modules=['select-frame','intro','har','speed','discover','structured-classifier'];
 const values=await Promise.all(modules.map(name=>import(pathToFileURL(path.join(resolved,'local',name+'.js')).href)));
 const {chromium}=await import(pathToFileURL(path.join(resolved,'node_modules','playwright','index.mjs')).href);
 const engine={chromium};
 for(let i=0;i<modules.length;i++)engine[modules[i]]=values[i];
 if(typeof engine['select-frame'].bestFrame!=='function'||typeof chromium?.launch!=='function')
  throw Error('checked-out hybrid engine does not match expected API');
 cache.set(resolved,engine);
 return engine;
}
