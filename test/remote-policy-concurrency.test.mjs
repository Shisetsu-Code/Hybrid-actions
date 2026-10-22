import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('catalogue, recovery and diagnostics cannot race provider policy restoration',()=>{
 const groups=['catalog-100','catalog-300','recover-catalog-300','diagnose-demo'].map(name=>{
  const source=fs.readFileSync(new URL('../.github/workflows/'+name+'.yml',import.meta.url),'utf8');
  assert.match(source,/cancel-in-progress: false/);
  return /group: ([^\r\n]+)/.exec(source)?.[1];
 });
 assert.ok(groups[0]);assert.equal(new Set(groups).size,1);
});
