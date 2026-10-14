'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFeed,PUBLIC_URL}=require('../lib/public-daily-skim-feed');
function data(date){
 return {dateET:date,reviewedAtET:date+'T10:41:00-04:00',universeDate:date,
 provenance:'independent-public-sources',stance:'neutral',
 summaryEn:'NVIDIA published a primary-source company announcement during the recent review period. The publicly documented release covers semiconductor design and manufacturing and is dated on its official publisher site.',
 summaryRu:'Компания NVIDIA опубликовала проверенное корпоративное сообщение за рассматриваемый период. В официальном источнике указаны дата и тема разработки и производства микросхем.',
 sources:[{url:'https://nvidianews.nvidia.com/news/test-company-source',issuedDate:date,issuer:'NVIDIA Newsroom'}]};
}
test('fetches GitHub public authored daily JSON and exposes it independently of Render deploy',async()=>{
 let called='';
 const feed=createFeed({now:()=>new Date('2026-10-14T14:42:00Z'),localFile:'/nonexistent/file',
 request:async(u)=>{called=u;return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(data('2026-10-14'))}}});
 assert.equal(feed.read(),null);
 assert.equal(await feed.refresh(),true);
 assert.equal(feed.read().dateET,'2026-10-14');
 assert.ok(called.startsWith(PUBLIC_URL+'?refresh='));
});
test('rejects stale or unlicensed remote content without leaking old feed',async()=>{
 const feed=createFeed({now:()=>new Date('2026-10-14T14:42:00Z'),localFile:'/nonexistent/file',
 request:async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({...data('2026-10-13'),provenance:'TWS'})})});
 assert.equal(await feed.refresh(),false);
 assert.equal(feed.read(),null);
});
test('uses validated local release as fallback on GitHub outage',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const tmp=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'vx-public-skim-')),'skim.json');
 try{
 fs.writeFileSync(tmp,JSON.stringify(data('2026-10-14')));
 const feed=createFeed({now:()=>new Date('2026-10-14T14:42:00Z'),localFile:tmp,request:async()=>{throw Error('network down');}});
 assert.equal(await feed.refresh(),false);
 assert.equal(feed.read().dateET,'2026-10-14');
 }finally{fs.rmSync(path.dirname(tmp),{recursive:true,force:true});}
});
test('remote yesterday cached cannot display as today',async()=>{
 let clock=new Date('2026-10-14T14:42:00Z');
 const feed=createFeed({now:()=>clock,localFile:'/nonexistent/file',request:async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(data('2026-10-14'))})});
 assert.equal(await feed.refresh(),true);
 clock=new Date('2026-10-15T14:42:00Z');
 assert.equal(feed.read(),null);
});
