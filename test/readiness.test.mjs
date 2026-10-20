import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {hasAutomatableWork,outstandingCounts} from '../src/readiness.mjs';

const empty={jobs:{discovery:{pending:0,leased:0},catalog:{pending:0,leased:0}},
 captures:{structured:0,visual:29,hybrid:3,needsReview:2}};
test('an exhausted catalogue does not launch eight runners solely for visual review',()=>{
 assert.equal(hasAutomatableWork(empty),false);
 assert.equal(outstandingCounts(empty).visualPending,32);
 assert.equal(outstandingCounts(empty).needsReview,2);
});
test('pending catalogue, discovery or structured review always requires work',()=>{
 assert.equal(hasAutomatableWork({...empty,jobs:{...empty.jobs,catalog:{pending:1}}}),true);
 assert.equal(hasAutomatableWork({...empty,jobs:{...empty.jobs,discovery:{leased:1}}}),true);
 assert.equal(hasAutomatableWork({...empty,captures:{...empty.captures,structured:1}}),true);
});
test('the scheduled continuation is opt-in, serialized and gated on real D1 demand',async()=>{
 const y=await fs.readFile(new URL('../.github/workflows/catalog.yml',import.meta.url),'utf8');
 assert.match(y,/cron: '0 \* \* \* \*'/);
 assert.match(y,/ENABLE_RECURRING_CATALOG/);
 assert.match(y,/if: needs\.prepare\.outputs\.hasWork == 'true'/);
 assert.match(y,/steps\.readiness\.outputs\.hasWork/);
 assert.match(y,/cancel-in-progress: false/);
 assert.match(y,/max-parallel: 8/);
 assert.match(y,/SLOTS: \$\{\{ inputs\.per_runner \|\| '5' \}\}/);
 assert.match(y,/MINUTES: \$\{\{ inputs\.duration_minutes \|\| '60' \}\}/);
 assert.match(y,/ADULT: \$\{\{ inputs\.confirm_adult \|\| 'false' \}\}/);
});
