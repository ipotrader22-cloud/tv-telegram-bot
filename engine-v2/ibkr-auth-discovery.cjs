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
async function metadata(){
 const get=async u=>{
  const url=new URL(u);if(url.origin!=='https://api.ibkr.com')throw Error('UNEXPECTED_ORIGIN');
  const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}});
  if(!r.ok)return {httpStatus:r.status};
  return r.json();
 };
 const resource=await get(endpoint+'/.well-known/oauth-protected-resource');
 const servers=[];
 for(const issuer of (resource.authorization_servers||[]).slice(0,3)){
  const u=new URL(issuer);
  if(u.origin!=='https://api.ibkr.com')continue;
  const authorization=await get(u.origin+'/.well-known/oauth-authorization-server'+u.pathname.replace(/\/$/,''));
  servers.push({issuer,authorization});
 }
 return {resource,servers};
}
if(require.main===module)http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.method!=='GET'){res.writeHead(405);return res.end('{}');}
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/health')return res.end(JSON.stringify({ok:true,mode:'discovery-only',orders:false}));
 if(pathname==='/metadata'){try{return res.end(JSON.stringify(await metadata()));}catch(e){res.writeHead(502);return res.end(JSON.stringify({error:'METADATA_FAILED'}));}}
 if(pathname==='/discover'){try{return res.end(JSON.stringify(await discover()));}catch(e){res.writeHead(502);return res.end(JSON.stringify({error:'DISCOVERY_FAILED'}));}}
 res.writeHead(404);res.end(JSON.stringify({error:'NOT_FOUND'}));
}).listen(process.env.PORT||10000,'0.0.0.0');
module.exports={discover};
