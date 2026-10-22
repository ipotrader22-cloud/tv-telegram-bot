'use strict';
// Explicit, auditable new-epoch universe. Never inherit the old active portfolio.
const BENCHMARKS=['SPY','QQQ','SMH','XLK','XLE'];
function parseV2Universe(value,{min=1,max=40}={}){
 if(typeof value!=='string'||!value.trim())throw Error('ENGINE2_UNIVERSE_NOT_CONFIGURED');
 const items=value.split(',').map(x=>x.trim().toUpperCase());
 if(items.some(x=>!/^[A-Z][A-Z0-9.-]{0,14}$/.test(x)))throw Error('ENGINE2_UNIVERSE_INVALID_TICKER');
 if(new Set(items).size!==items.length)throw Error('ENGINE2_UNIVERSE_DUPLICATED');
 const candidates=items.filter(x=>!BENCHMARKS.includes(x));
 if(candidates.length<min||candidates.length>max)throw Error('ENGINE2_UNIVERSE_OUT_OF_BOUNDS');
 return {candidates,benchmarks:[...BENCHMARKS],symbols:[...new Set([...candidates,...BENCHMARKS])],
   source:'VIXALE_V2_RESEARCH_UNIVERSE',legacyPortfolioUsed:false};
}
module.exports={parseV2Universe,BENCHMARKS};
