/** V5 customer account ownership + email login + Midtrans-only regression */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tera-v5-'));
let mail={};const payments=[];
const mock=http.createServer((req,res)=>{let text='';req.on('data',b=>text+=b);req.on('end',()=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/emails') {const body=JSON.parse(text);mail[body.to[0]]=body.html;return res.end(JSON.stringify({id:'sent'}));}
 if(req.url==='/snap/v1/transactions') {const b=JSON.parse(text);payments.push(b);return res.end(JSON.stringify({token:'snap-test',redirect_url:`https://app.sandbox.midtrans.com/snap/v4/${b.transaction_details.order_id}`}));}
 res.statusCode=404;res.end('{}');
});});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const portSock=http.createServer();await new Promise(r=>portSock.listen(0,'127.0.0.1',r));const port=portSock.address().port;await new Promise(r=>portSock.close(r));
const env={...process.env,NODE_ENV:'test',PORT:String(port),TERA_DATA_DIR:tmp,SERVICE_FEE_IDR:'25000',MIDTRANS_SERVER_KEY:'mock-secret',MIDTRANS_SNAP_URL:`http://127.0.0.1:${mock.address().port}/snap/v1/transactions`,RESEND_API_KEY:'re_test',TERA_EMAIL_FROM:'Tera <hello@tera.test>',TERA_PUBLIC_URL:'https://tera.example.test',TERA_TEST_RESEND_URL:`http://127.0.0.1:${mock.address().port}/emails`};
const p=spawn(process.execPath,['server.mjs'],{cwd:path.resolve(import.meta.dirname,'..'),env,stdio:['ignore','pipe','pipe']});let errors='';p.stderr.on('data',d=>errors+=d);
const base=`http://127.0.0.1:${port}`;
async function call(url,method='GET',body=null,cookie='',headers={}){const r=await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});return {code:r.status,body:await r.json().catch(()=>({})),headers:r.headers};}
async function login(email){const issued=await call('/api/account/login/request','POST',{email});assert.equal(issued.code,202,JSON.stringify(issued.body));const h=mail[email];assert.ok(h,`missing email ${email}`);const token=/#verify\/([A-Za-z0-9_-]{43})/.exec(h)?.[1];assert.ok(token);const redeemed=await call('/api/account/login/redeem','POST',{token});assert.equal(redeemed.code,200,JSON.stringify(redeemed.body));const cookie=redeemed.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Lax'));assert.ok(cookie.includes('Path=/'));const replay=await call('/api/account/login/redeem','POST',{token});assert.equal(replay.code,410);return cookie.split(';')[0];}
const payload={company:'Usaha Pangan Satu',contact:'Mitra Tera',email:'owner@contoh.test',phone:'081234567890',product:'Keripik Singkong Premium',category:'Makanan ringan',labelText:'Keripik singkong premium. Komposisi: singkong, minyak nabati, garam. Berat bersih: 150 gram. Diproduksi di Kota Bandung.',consent:true};
try{
 for(let i=0;i<80;i++){try{if((await call('/api/account/config')).code===200)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 assert.equal((await call('/api/account/applications')).code,401);
 const cookieA=await login('owner@contoh.test');
 assert.equal((await call('/api/account/me','GET',null,cookieA)).body.email,'owner@contoh.test');
 assert.equal((await call('/api/account/applications','GET',null,cookieA)).body.data.length,0);
 const badEmail=await call('/api/public/applications','POST',{...payload,email:'hacker@contoh.test'},cookieA);assert.equal(badEmail.code,422,'logged customer must use verified email');
 const created=await call('/api/public/applications','POST',payload,cookieA);assert.equal(created.code,201,JSON.stringify(created.body));assert.equal(payments.length,1);assert.equal(payments[0].transaction_details.gross_amount,25000);
 const id=created.body.id;
 let list=await call('/api/account/applications','GET',null,cookieA);assert.equal(list.body.data.length,1);assert.equal(list.body.data[0].paymentStatus,'pending');
 const view=await call(`/api/account/applications/${id}`,'GET',null,cookieA);assert.equal(view.code,200);assert.ok(view.body.labelText.includes('Keripik singkong'));
 const cookieB=await login('someoneelse@contoh.test');
 assert.equal((await call('/api/account/applications','GET',null,cookieB)).body.data.length,0);
 assert.equal((await call(`/api/account/applications/${id}`,'GET',null,cookieB)).code,404);
 assert.equal((await call(`/api/account/applications/${id}/image`,'GET',null,cookieB)).code,404);
 const fake=await call('/api/payments/midtrans/notification','POST',{order_id:id,transaction_status:'settlement',status_code:'200',gross_amount:'25000.00',signature_key:'0'.repeat(128)});assert.equal(fake.code,403);
 const event={order_id:id,transaction_status:'settlement',status_code:'200',gross_amount:'25000.00'};
 event.signature_key=crypto.createHash('sha512').update(`${id}20025000.00mock-secret`).digest('hex');
 assert.equal((await call('/api/payments/midtrans/notification','POST',event)).code,200);
 const paid=await call(`/api/account/applications/${id}`,'GET',null,cookieA);assert.equal(paid.body.paymentStatus,'paid');assert.ok(paid.body.report?.checks?.length>0);
 assert.equal((await call('/api/account/me','GET',null,cookieA,{Origin:'https://evil.test'})).code,403);
 assert.equal((await call('/api/account/logout','POST',null,cookieA)).code,200);
 assert.equal((await call('/api/account/me','GET',null,cookieA)).code,401);
 for(const asset of ['/account.html','/account.css','/account.js'])assert.equal((await fetch(base+asset)).status,200);
 assert.equal((await fetch(base+'/auth.js')).status,404);
 console.log('PASS V5 ACCOUNT: one-time magic login, HttpOnly cookie, multi-product listing, email ownership, cross-tenant isolation, Midtrans settlement gate, logout, public assets');
}finally{p.kill('SIGTERM');mock.close();await new Promise(r => {
    if (p.exitCode !== null) return r();
    p.once('exit', () => r());
    setTimeout(r, 1000);
  });
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}}
