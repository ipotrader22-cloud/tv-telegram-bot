'use strict';
// Preserve input order; stop admitting work after any failure. Never retry an
// access denial or continue a partial collection as a certified whole batch.
async function boundedMap(items,limit,work){
 if(!Number.isInteger(limit)||limit<1||limit>8)throw Error('INVALID_CONCURRENCY');
 const result=new Array(items.length);let next=0,error;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(!error){const i=next++;if(i>=items.length)return;
   try{result[i]=await work(items[i],i)}catch(e){error=e;}
  }
 }));
 if(error)throw error;return result;
}
module.exports={boundedMap};
