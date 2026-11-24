'use strict';
// Isolated discovery probe: no credentials, no account data, no order methods.
const http=require('node:http');
const endpoint='https://api.ibkr.com/v1/api/mcp-public';
async function discover(){
 const r=await fetch(endpoint,{method:'POST',redirect:'manual',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'vixale-data-probe',version:'0.1.0'}}}),signal:AbortSignal.timeout(15000)});
 const challenge=r.headers.get('www-authenticate');
 await r.body?.cancel();
 return {status:r.status,challenge,endpoint};
}
if(require.main===module)http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.method!=='GET'){res.writeHead(405);return res.end('{}');}
 if(req.url==='/health')return res.end(JSON.stringify({ok:true,mode:'discovery-only',orders:false}));
 if(req.url==='/discover'){try{return res.end(JSON.stringify(await discover()));}catch(e){res.writeHead(502);return res.end(JSON.stringify({error:'DISCOVERY_FAILED'}));}}
 res.writeHead(404);res.end('{}');
}).listen(process.env.PORT||10000,'0.0.0.0');
module.exports={discover};
