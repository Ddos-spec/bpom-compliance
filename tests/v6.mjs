/** V6 contract test: server-side Midtrans gate; account isolation; revisions; receipt. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tera-v6-'));
const key='TEST-MIDTRANS-SECRET',admin='TEST-ADMIN-KEY-'+ 'z'.repeat(32);
const sent=[];
const mock=http.createServer((req,res)=>{let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{
 if(req.url==='/snap/v1/transactions'){const v=JSON.parse(raw);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({redirect_url:`http://127.0.0.1:${mock.address().port}/pay/${v.transaction_details.order_id}`}));}
 if(req.url==='/emails'){sent.push(JSON.parse(raw));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({id:'mock'}));}
 res.writeHead(404);res.end();
 });});
await new Promise(ok=>mock.listen(0,'127.0.0.1',ok));
const probe=http.createServer();await new Promise(ok=>probe.listen(0,'127.0.0.1',ok));const port=probe.address().port;await new Promise(ok=>probe.close(ok));
const proc=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),TERA_DATA_DIR:temp,SERVICE_FEE_IDR:'25000',MIDTRANS_SERVER_KEY:key,MIDTRANS_SNAP_URL:`http://127.0.0.1:${mock.address().port}/snap/v1/transactions`,TERA_ADMIN_KEY:admin,RESEND_API_KEY:'re_test',TERA_EMAIL_FROM:'TERA <noreply@example.test>',TERA_PUBLIC_URL:'https://example.test',TERA_TEST_RESEND_URL:`http://127.0.0.1:${mock.address().port}/emails`},stdio:['ignore','pipe','pipe']});
let errs='';proc.stderr.on('data',b=>errs+=b);
async function req(url,method='GET',body,cookie='',auth=''){
 const r=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(auth?{Authorization:`Bearer ${auth}`}:{})},body:body?JSON.stringify(body):undefined});
 return {status:r.status,data:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')};
}
function signed(id,status){const b={order_id:id,status_code:'200',gross_amount:'25000.00',currency:'IDR',transaction_status:status};b.signature_key=crypto.createHash('sha512').update(b.order_id+b.status_code+b.gross_amount+key).digest('hex');return b;}
async function login(email){const sentBefore=sent.length;const r=await req('/api/account/login/request','POST',{email});assert.equal(r.status,202,JSON.stringify(r));assert.equal(sent.length,sentBefore+1);const t=/#verify\/([\w-]+)/.exec(sent.at(-1).html)?.[1];assert.ok(t);const v=await req('/api/account/login/redeem','POST',{token:t});assert.equal(v.status,200);assert.ok(v.cookie);return v.cookie.split(';')[0];}
const form=(email)=>({company:'CV Quality',contact:'Petugas UMKM',email,phone:'081234567890',product:'Keripik Ubi',category:'Makanan ringan',labelText:'Keripik Ubi. Komposisi: ubi, minyak, garam. Berat bersih: 100 g. Diproduksi CV Quality.',consent:true});
try{
 let ready=false;for(let i=0;i<90;i++){try{if((await req('/api/public/config')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,60));}assert.ok(ready,errs);
 const created=await req('/api/public/applications','POST',form('user1@example.test'));assert.equal(created.status,201,JSON.stringify(created));const id=created.data.id;
 const c1=await login('user1@example.test');const c2=await login('user2@example.test');
 assert.equal((await req(`/api/account/applications/${id}/receipt`,'GET',null,c1)).status,409,'no unpaid receipt');
 assert.equal((await req(`/api/account/applications/${id}/receipt`,'GET',null,c2)).status,404,'no account B receipt');
 assert.equal((await req(`/api/account/applications/${id}/revisions`,'POST',{labelText:'Label revisi yang cukup panjang supaya lolos validasi ini.'},c1)).status,409,'no revision without payment/staff request');
 const fake=signed(id,'settlement');fake.signature_key='wrong';assert.equal((await req('/api/payments/midtrans/notification','POST',fake)).status,403);
 assert.equal((await req('/api/payments/midtrans/notification','POST',signed(id,'settlement'))).status,200);
 let receipt=await req(`/api/account/applications/${id}/receipt`,'GET',null,c1);assert.equal(receipt.status,200);assert.equal(receipt.data.amount,25000);assert.equal(receipt.data.provider,'Midtrans');assert.equal(receipt.data.paymentStatus,'paid');assert.match(receipt.data.disclaimer,/bukan faktur pajak/i);
 assert.equal((await req(`/api/staff/applications/${id}`,'PATCH',{reviewStatus:'revision_requested',note:'Perbaiki daftar bahan'},'',admin)).status,200);
 const proposed='Keripik Ubi edisi revisi. Komposisi: ubi, minyak, garam. Berat bersih 100 g. Diproduksi CV Quality Kota Bandung. Kode produksi: K001.';
 const unauth=await req(`/api/account/applications/${id}/revisions`,'POST',{labelText:proposed},c2);assert.equal(unauth.status,404);
 const changed=await req(`/api/account/applications/${id}/revisions`,'POST',{labelText:proposed,note:'Alamat produsen diperbaiki'},c1);assert.equal(changed.status,201,JSON.stringify(changed));
 assert.equal((await req(`/api/account/applications/${id}/revisions`,'POST',{labelText:proposed+' 2'},c1)).status,409,'duplicate submission denied');
 let detail=await req(`/api/account/applications/${id}`,'GET',null,c1);assert.equal(detail.data.labelText,form('user1@example.test').labelText,'active label never overwritten before approval');assert.equal(detail.data.revisions.length,1);
 const rev=detail.data.revisions[0].id;
 assert.equal((await req(`/api/staff/applications/${id}/revisions/${rev}`,'PATCH',{decision:'reject'},'',admin)).status,422,'reject needs reason');
 assert.equal((await req(`/api/staff/applications/${id}/revisions/${rev}`,'PATCH',{decision:'accept',note:'Revision logged'},'',admin)).status,200);
 assert.equal((await req(`/api/staff/applications/${id}/revisions/${rev}`,'PATCH',{decision:'accept'},'',admin)).status,409,'no double approval');
 detail=await req(`/api/account/applications/${id}`,'GET',null,c1);assert.equal(detail.data.labelText,proposed);assert.equal(detail.data.revisions[0].status,'accepted');assert.equal(detail.data.reviewStatus,'report_ready');assert.ok(detail.data.report);
 assert.equal((await req('/api/payments/midtrans/notification','POST',signed(id,'refund'))).status,200);
 receipt=await req(`/api/account/applications/${id}/receipt`,'GET',null,c1);assert.equal(receipt.data.paymentStatus,'refunded','refund status must be explicit');
 assert.equal((await req(`/api/account/applications/${id}/revisions`,'POST',{labelText:proposed+' after refund'},c1)).status,409);
 console.log('PASS V6: Midtrans-only paid gate; tenant boundaries; receipt; staff-requested revision; atomic staff approval; double-submit guard; refund');
}finally{proc.kill('SIGTERM');mock.close();await new Promise(r => { if (proc.exitCode !== null) return r(); proc.once('exit', () => r()); setTimeout(r, 1000); }); try { fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100}); } catch {}}
