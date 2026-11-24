'use strict';
// Isolated read-only proof of concept. No production dependencies or persistent credentials.
const http=require('node:http');
const crypto=require('node:crypto');
const endpoint='https://api.ibkr.com/v1/api/mcp-public';
const issuer='https://api.ibkr.com';
const redirect='https://vixale-ibkr-auth-probe.onrender.com/callback';
const scope='mcp.read';
const random=()=>crypto.randomBytes(32).toString('base64url');
const hash=x=>crypto.createHash('sha256').update(x).digest();
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&crypto.timingSafeEqual(hash(a),hash(b));
const challenge=x=>hash(x).toString('base64url');
const owner=process.env.IBKR_PROBE_OWNER_SECRET||'';
const enabled=()=>owner.length>=32;
let pending=null, session=null, busy=false;
const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
async function request(url,options={}){
 if(new URL(url).origin!==issuer)throw fail('UNEXPECTED_ORIGIN',502);
 return fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});
}
async function jsonRequest(url,options={}){
 const r=await request(url,options);
 if(!r.ok){await r.body?.cancel();throw fail('IBKR_HTTP_'+r.status,502);}
 return r.json();
}
async function discover(){
 const r=await request(endpoint,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'vixale-data-probe',version:'0.2.0'}}})});
 const challenge=r.headers.get('www-authenticate');await r.body?.cancel();
 return {status:r.status,challenge,endpoint};
}
async function metadata(){
 const resource=await jsonRequest(endpoint+'/.well-known/oauth-protected-resource');
 const authorization=await jsonRequest(issuer+'/.well-known/oauth-authorization-server');
 return {resource,servers:[{issuer,authorization}]};
}
async function register(){
 const j=await jsonRequest(issuer+'/oauth2/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'VIXALE isolated read-only probe',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope})});
 if(typeof j.client_id!=='string'||!j.client_id||j.client_secret|| (j.token_endpoint_auth_method&&j.token_endpoint_auth_method!=='none'))throw fail('UNEXPECTED_CLIENT_REGISTRATION',502);
 return j.client_id;
}
function validateToken(t){
 if(typeof t.access_token!=='string'||!t.access_token||String(t.token_type).toLowerCase()!=='bearer')throw fail('INVALID_TOKEN_RESPONSE',502);
 if(t.scope!==undefined&&t.scope!==scope)throw fail('UNEXPECTED_TOKEN_SCOPE',502);
 return {access:t.access_token,refresh:typeof t.refresh_token==='string'?t.refresh_token:null,expiresIn:Number.isFinite(t.expires_in)?t.expires_in:null};
}
async function token(params){
 return validateToken(await jsonRequest(issuer+'/oauth2/api/v1/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams(params)}));
}
const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const setCookie=(res,name,value,age)=>res.setHeader('Set-Cookie',name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age);
const authorized=req=>session&&session.expires>Date.now()&&equal(cookie(req,'vixale_session'),session.id);
function output(res,status,obj){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(obj));}
function html(res,body){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset="utf-8"><title>VIXALE IBKR probe</title><h1>VIXALE IBKR read-only probe</h1>'+body);}
async function form(req){
 if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))throw fail('INVALID_FORM');
 let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw fail('FORM_TOO_LARGE',413);}
 return new URLSearchParams(body);
}
function sameOrigin(req){if(req.headers.origin!=='https://vixale-ibkr-auth-probe.onrender.com')throw fail('ORIGIN_REQUIRED',403);}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 try{
  if(req.method==='GET'&&path==='/health')return output(res,200,{ok:true,mode:'read-only-oauth-probe',ownerConfigured:enabled(),orders:false,persistentTokens:false});
  if(req.method==='GET'&&path==='/discover')return output(res,200,await discover());
  if(req.method==='GET'&&path==='/metadata')return output(res,200,await metadata());
  if(!enabled())return output(res,503,{error:'OWNER_SECRET_NOT_CONFIGURED'});
  if(req.method==='GET'&&(path==='/'||path==='/authorize')){
   if(authorized(req))return html(res,'<p>Authorization succeeded. Read-only token is held in memory.</p><form method="post" action="/refresh"><button>Test token refresh</button></form><p><a href="/status">View test status</a></p>');
   return html(res,'<p>Enter the separate probe owner secret configured in Render. Never enter your IBKR password here.</p><form method="post" action="/authorize"><label>Probe owner secret <input type="password" name="secret" required autocomplete="off"></label><button>Connect IBKR read-only</button></form>');
  }
  if(req.method==='POST'&&path==='/authorize'){
   sameOrigin(req);const f=await form(req);
   if(!equal(f.get('secret'),owner))throw fail('FORBIDDEN',403);
   if(busy)throw fail('BUSY',409);busy=true;
   try{
    const client=await register(),state=random(),verifier=random(),browser=random();
    pending={client,state,verifier,browser,expires:Date.now()+600000};
    const u=new URL(issuer+'/oauth2/authorize');
    u.search=new URLSearchParams({response_type:'code',client_id:client,redirect_uri:redirect,scope,state,code_challenge:challenge(verifier),code_challenge_method:'S256',resource:endpoint});
    setCookie(res,'vixale_pending',browser,600);res.writeHead(303,{Location:u.toString()});return res.end();
   }finally{busy=false;}
  }
  if(req.method==='GET'&&path==='/callback'){
   if(!pending||pending.expires<Date.now()||!equal(url.searchParams.get('state'),pending.state)||!equal(cookie(req,'vixale_pending'),pending.browser))throw fail('INVALID_OR_EXPIRED_STATE',403);
   const p=pending;pending=null;
   if(url.searchParams.get('iss')&&url.searchParams.get('iss')!==issuer)throw fail('INVALID_ISSUER',403);
   const code=url.searchParams.get('code');if(!code||url.searchParams.has('error'))throw fail('AUTHORIZATION_NOT_GRANTED',403);
   const t=await token({grant_type:'authorization_code',client_id:p.client,code,redirect_uri:redirect,code_verifier:p.verifier,resource:endpoint});
   session={id:random(),client:p.client,...t,expires:Date.now()+3600000,refreshTest:null};
   setCookie(res,'vixale_session',session.id,3600);res.writeHead(303,{Location:'/'});return res.end();
  }
  if(!authorized(req))throw fail('FORBIDDEN',403);
  if(req.method==='GET'&&path==='/status')return output(res,200,{authorized:true,requestedScope:scope,refreshTokenReceived:!!session.refresh,accessTokenExpiresInSeconds:session.expiresIn,refreshTest:session.refreshTest,persistentTokens:false,orders:false});
  if(req.method==='POST'&&path==='/refresh'){
   sameOrigin(req);if(!session.refresh)throw fail('NO_REFRESH_TOKEN',409);if(busy)throw fail('BUSY',409);busy=true;
   try{const t=await token({grant_type:'refresh_token',client_id:session.client,refresh_token:session.refresh,resource:endpoint,scope});Object.assign(session,{access:t.access,refresh:t.refresh||session.refresh,expiresIn:t.expiresIn,refreshTest:'PASS'});return output(res,200,{refreshTest:'PASS',orders:false});}
   finally{busy=false;}
  }
  return output(res,404,{error:'NOT_FOUND'});
 }catch(e){return output(res,e.status||502,{error:e.code||'PROBE_REQUEST_FAILED'});}
}
if(require.main===module)http.createServer(handler).listen(process.env.PORT||10000,'0.0.0.0');
module.exports={handler,challenge,validateToken};
