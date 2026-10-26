import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tera-edge-'));
const key='SB-Mid-server-FOR-TEST';
let failCheckout=false, statusState='pending';
const gateway=http.createServer((req,res)=>{
  if(req.url==='/snap/v1/transactions'){
    let raw=''; req.on('data',d=>raw+=d);req.on('end',()=>{
      if(failCheckout){res.writeHead(503);res.end('gateway down');return;}
      const body=JSON.parse(raw);res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({redirect_url:`http://127.0.0.1:${gwPort}/pay/${body.transaction_details.order_id}`}));
    });return;
  }
  if(req.url.startsWith('/v2/') && req.url.endsWith('/status')){
    const id=req.url.split('/')[2];res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({status_code:'200',order_id:id,transaction_status:statusState,gross_amount:'25000.00',currency:'IDR'}));return;
  }
  res.writeHead(404);res.end();
});
await new Promise(ok=>gateway.listen(0,'127.0.0.1',ok));const gwPort=gateway.address().port;
const srv=http.createServer();await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const port=srv.address().port;await new Promise(ok=>srv.close(ok));
const proc=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),TERA_DATA_DIR:tmp,SERVICE_FEE_IDR:'25000',MIDTRANS_SERVER_KEY:key,MIDTRANS_SNAP_URL:`http://127.0.0.1:${gwPort}/snap/v1/transactions`,MIDTRANS_STATUS_URL:`http://127.0.0.1:${gwPort}/v2/`},stdio:'ignore'});
const api=async(path,opt={})=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,opt);const d=await r.json();return [r.status,d];};
const form={company:'PT Tester',contact:'Kontak',email:'owner@example.com',phone:'081234567890',product:'Biskuit Kedelai',category:'Makanan ringan',labelText:'Biskuit Kedelai, komposisi: kedelai, gula, susu; berat bersih 40 g; diproduksi oleh PT Tester, Tangerang; exp 10 Oktober 2027',consent:true};
const submit=body=>api('/api/public/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
let checks=[];
const check=(name,fn)=>{checks.push(name);return fn();};
try{
 let live=false;for(let i=0;i<60;i++){try{await api('/api/public/config');live=true;break;}catch{await new Promise(r=>setTimeout(r,80));}}
 assert.equal(live,true);
 assert.equal((await submit(null))[0],422);check('malformed payload 422',()=>{});
 const [created,newApp]=await submit({...form,price:1,paymentStatus:'paid'});
 assert.equal(created,201);assert.equal(newApp.amount,25000);check('server-side price gate',()=>{});
 const url=`/api/public/applications/${newApp.id}`,headers={Authorization:`Bearer ${newApp.accessToken}`};
 assert.equal((await api(url,{headers}))[1].paymentStatus,'pending');
 statusState='settlement';
 // Server throttles gateway status reads for 15 seconds, by design; direct initial
 // status would have looked up the gateway and seeded cooldown. Wait as necessary.
 await new Promise(r=>setTimeout(r,15100));
 const [ok,paid]=await api(url,{headers});assert.equal(ok,200);assert.equal(paid.paymentStatus,'paid');assert.ok(paid.report);
 check('lost webhook reconciled through provider status',()=>{});
 const signed=(kind)=>{
   const b={order_id:newApp.id,status_code:'200',gross_amount:'25000.00',currency:'IDR',transaction_status:kind};
   b.signature_key=crypto.createHash('sha512').update(b.order_id+b.status_code+b.gross_amount+key).digest('hex');return b;
 };
 const postWebhook=b=>api('/api/payments/midtrans/notification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
 assert.equal((await postWebhook(signed('refund')))[0],200);
 assert.equal((await api(url,{headers}))[1].paymentStatus,'refunded');
 assert.equal((await postWebhook(signed('settlement')))[0],200);
 const [replayCode,replayed]=await api(url,{headers});assert.equal(replayCode,200);assert.equal(replayed.paymentStatus,'refunded');assert.equal(replayed.report,null);
 check('refund locked and old settlement replay ignored',()=>{});
 failCheckout=true;
 assert.equal((await submit(form))[0],502);
 const file=path.join(tmp,'tera_public.db');
 const {DatabaseSync}=await import('node:sqlite');const database=new DatabaseSync(file);
 assert.equal(database.prepare('SELECT COUNT(*) AS count FROM applications').get().count,1);
 database.close();check('gateway failure leaves no orphan application',()=>{});
 console.log('PASS EDGE:',checks.join('; '));
} finally {proc.kill();gateway.close();await new Promise(r => {
    if (proc.exitCode !== null) return r();
    proc.once('exit', () => r());
    setTimeout(r, 1000);
  });
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}}
