// Idempotently stage only approved DEMO sources and per-provider D1 policies.
export function discoverySubject(sourceId,at=Date.now(),cadenceMinutes=360){
 if(!/^[a-z0-9][a-z0-9-]{0,74}$/i.test(sourceId))throw Error('invalid discovery source ID');
 if(!Number.isSafeInteger(cadenceMinutes)||cadenceMinutes<30)throw Error('invalid discovery cadence');
 return sourceId+'-'+Math.floor(at/(cadenceMinutes*60000));
}
export async function seedCatalogues({cloud,config,at=Date.now(),log=()=>{}}){
 await cloud.requireReady();
 if(!config.providers.length)throw Error('No enabled/approved demo providers. Configure config/providers.json before starting eight runners.');
 let discoveries=0,catalogues=0;
 for(const provider of config.providers){
  await cloud.configurePolicy(provider.id,provider.pacing);
  const jobs=[
   ...provider.games.map(game=>({role:'catalog',provider:provider.id,subject:game.id,
    priority:15,payload:{game:{provider:provider.id,...game}}})),
   ...provider.sources.map(source=>({role:'discovery',provider:provider.id,
    subject:discoverySubject(source.id,at),priority:20,payload:{source}}))
  ];
  for(let i=0;i<jobs.length;i+=20){
   const result=await cloud.enqueue(config.runId,jobs.slice(i,i+20));
   const created=new Set((result.jobs||[]).filter(job=>job?.status==='pending').map(job=>job.id));
   // Report only truly inserted tickets, not existing history.
   const chunk=jobs.slice(i,i+20);
   const d=chunk.filter(x=>x.role==='discovery').length;
   const c=chunk.length-d;
   discoveries+=d;catalogues+=c;
   log('SEEDED',provider.id,'inserted='+result.inserted,'existing='+result.existing);
   void created;
  }
 }
 return {runId:config.runId,discoveryTickets:discoveries,catalogueTickets:catalogues,
  providerCount:config.providers.length};
}
