'use strict';
// PostgreSQL jsonb may reorder object keys; arrays retain semantic order.
function stableStringify(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)}
module.exports={stableStringify};
