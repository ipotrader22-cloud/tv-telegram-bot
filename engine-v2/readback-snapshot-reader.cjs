'use strict';
// Pin only a short-lived HTTP verification pair; ordinary visitors read live.
function createReadbackSnapshotReader({read,clock=()=>Date.now(),ttl=45000,limit=32}={}){
 const cache=new Map();
 return function readSnapshot(token){
  const now=clock();
  for(const [key,value] of cache)if(now-value.at>=ttl)cache.delete(key);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(token||''))return read();
  if(cache.has(token))return cache.get(token).promise;
  if(cache.size>=limit)cache.delete(cache.keys().next().value);
  const entry={at:now};
  entry.promise=Promise.resolve().then(read).catch(error=>{
   if(cache.get(token)===entry)cache.delete(token);
   throw error;
  });
  cache.set(token,entry);
  return entry.promise;
 };
}
module.exports={createReadbackSnapshotReader};
