// Used by an hourly optional workflow to avoid starting eight empty runners.
// Visual/hybrid screenshots still need MCP vision, not automatic guessing.
export function hasAutomatableWork(stats){
 const roles=stats?.jobs||{};
 const pending=(x)=>Number(x?.pending||0)+Number(x?.leased||0);
 return pending(roles.discovery)+pending(roles.catalog)+
  Number(stats?.captures?.structured||0)>0;
}
export function outstandingCounts(stats){
 return {discoveryPending:Number(stats?.jobs?.discovery?.pending||0),
  cataloguePending:Number(stats?.jobs?.catalog?.pending||0),
  discoveryLeased:Number(stats?.jobs?.discovery?.leased||0),
  catalogueLeased:Number(stats?.jobs?.catalog?.leased||0),
  structuredPending:Number(stats?.captures?.structured||0),
  visualPending:Number(stats?.captures?.visual||0)+Number(stats?.captures?.hybrid||0),
  needsReview:Number(stats?.captures?.needsReview||0)};
}
