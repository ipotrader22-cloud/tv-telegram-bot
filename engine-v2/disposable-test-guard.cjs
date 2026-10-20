'use strict';
function assertDisposableTestDatabase({url,approval,ci}={}){
 if(approval!=='YES'||ci!=='true')throw Error('Explicit CI authorization required');
 const u=new URL(url);
 if(!['localhost','127.0.0.1','[::1]','::1'].includes(u.hostname)||u.pathname!=='/vixale_v2_test')throw Error('Only local disposable test database allowed');
 return true;
}
module.exports={assertDisposableTestDatabase};
