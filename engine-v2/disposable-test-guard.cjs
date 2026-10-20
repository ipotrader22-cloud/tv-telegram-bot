'use strict';
// Only a disposable, loopback CI PostgreSQL database may be used for schema-reset tests.
function assertDisposableTestDatabase({url,approval,ci}={}){
 if(approval!=='YES'||ci!=='true')throw Error('Explicit disposable CI approval required');
 if(typeof url!=='string'||!url)throw Error('Disposable database URL required');
 let u;try{u=new URL(url)}catch{throw Error('Invalid disposable database URL')}
 if(!['postgres:','postgresql:'].includes(u.protocol))throw Error('PostgreSQL protocol required');
 if(!['localhost','127.0.0.1','[::1]','::1'].includes(u.hostname))throw Error('Loopback-only disposable database required');
 if(u.pathname!=='/vixale_v2_test')throw Error('Refusing non-disposable database');
 if(u.search||u.hash)throw Error('No extra database URL options allowed');
 return 'vixale_v2_test';
}
module.exports={assertDisposableTestDatabase};
