'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parse,fetchNvidiaOfficial,RSS_URL}=require('../scripts/vixale-official-rss');
const desc='A verified announcement discussing NVIDIA data center technology and its corporate developments in detail for dated evidence.';
const item=(url,date,description=desc)=>'<item><title><![CDATA[NVIDIA Announces Corporate Technology Development]]></title>'+
 '<link>'+url+'</link><pubDate>'+date+'</pubDate><description><![CDATA['+description+']]></description></item>';
const xml=x=>'<rss version="2.0"><channel>'+x+'</channel></rss>';
const options={reviewDate:'2026-10-14',earliest:'2026-09-14'};
test('accept directly dated official NVIDIA RSS release',()=>{
 const x=parse(xml(item('https://nvidianews.nvidia.com/news/company-release','Tue, 13 Oct 2026 14:00:00 GMT')),options);
 assert.equal(x.length,1);assert.equal(x[0].publishedDate,'2026-10-13');
 assert.equal(x[0].verified,true);
});
test('reject third party, undated, short, future and old posts',()=>{
 const x=xml([
 item('https://evil.example/story','Tue, 13 Oct 2026 14:00:00 GMT'),
 item('https://nvidianews.nvidia.com/news/old','Sat, 01 Aug 2026 14:00:00 GMT'),
 item('https://nvidianews.nvidia.com/news/future','Thu, 15 Oct 2026 14:00:00 GMT'),
 item('https://nvidianews.nvidia.com/news/undated','not a date'),
 item('https://nvidianews.nvidia.com/news/short','Tue, 13 Oct 2026 14:00:00 GMT','Short'),
 ].join(''));
 assert.deepEqual(parse(x,options),[]);
});
test('official RSS request retains exact URL and blocks unverified empty results',async()=>{
 let url;
 await assert.rejects(()=>fetchNvidiaOfficial({...options,request:async u=>{url=u;return {ok:true,text:async()=>xml('')};}}),/No dated/);
 assert.equal(url,RSS_URL);
});
