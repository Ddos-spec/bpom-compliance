/** V4 mega patch: authenticated image, magic link recovery, admin views, migrations. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tera-v4-'));
let lastMail='';let orderCount=0;
const mock=http.createServer((req,res)=>{
  let body='';req.on('data',x=>body+=x);req.on('end',()=>{
    if(req.url==='/snap/v1/transactions'){
      orderCount++;const pay=JSON.parse(body);
      res.writeHead(200,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({token:'mock',redirect_url:`http://127.0.0.1:${mock.address().port}/checkout/${pay.transaction_details.order_id}`}));
    }
    if(req.url==='/emails'){
      lastMail=JSON.parse(body).html;
      res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({id:'mail-sent'}));
    }
    res.writeHead(404);res.end();
  });
});
await new Promise(ok=>mock.listen(0,'127.0.0.1',ok));
// Bind an ephemeral port by letting the app receive a port selected by temporary socket.
const probe=http.createServer();await new Promise(ok=>probe.listen(0,'127.0.0.1',ok));const serverPort=probe.address().port;await new Promise(ok=>probe.close(ok));
const adminKey='tera-v4-test-admin-key-'+'a'.repeat(40);
const env={...process.env,NODE_ENV:'test',PORT:String(serverPort),TERA_DATA_DIR:dir,SERVICE_FEE_IDR:'25000',MIDTRANS_SERVER_KEY:'mock-secret',MIDTRANS_SNAP_URL:`http://127.0.0.1:${mock.address().port}/snap/v1/transactions`,TERA_ADMIN_KEY:adminKey,RESEND_API_KEY:'re_mock',TERA_EMAIL_FROM:'Tera <help@test.invalid>',TERA_PUBLIC_URL:'https://tera.example.test',TERA_TEST_RESEND_URL:`http://127.0.0.1:${mock.address().port}/emails`};
const proc=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let stderr='';proc.stderr.on('data',x=>stderr+=x);
const base=`http://127.0.0.1:${serverPort}`;
async function api(route,method='GET',body=null,token='') {const r=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {code:r.status,data:await r.json().catch(()=>({}))};}
async function ready(){for(let i=0;i<80;i++){try{if((await api('/api/public/config')).code===200)return;}catch{}await new Promise(ok=>setTimeout(ok,50));}throw Error('server failed '+stderr);}
const validPng='data:image/png;base64,'+Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex').toString('base64');
try{
 await ready();assert.equal((await api('/api/public/config')).data.recoveryEnabled,true);
 const payload={company:'Usaha Satu',contact:'Pelaku Usaha',email:'client@contoh.test',phone:'081234567890',product:'Kripik Organik',category:'Makanan ringan',labelText:'Kripik Organik\nKomposisi: ubi, minyak, garam.\nBerat bersih: 200 g\nDiproduksi oleh: Usaha Satu, Kota Bekasi',consent:true,labelImage:validPng};
 const invalid=await api('/api/public/applications','POST',{...payload,labelImage:'data:image/png;base64,'+Buffer.from('<script>evil</script>').toString('base64')});assert.equal(invalid.code,422);
 const created=await api('/api/public/applications','POST',payload);assert.equal(created.code,201,JSON.stringify(created));assert.equal(orderCount,1);
 const id=created.data.id,token=created.data.accessToken;
 const conf=await api(`/api/public/applications/${id}`,'GET',null,token);assert.equal(conf.data.imageAvailable,true);assert.equal(conf.data.report,null);
 const unauthImage=await fetch(base+`/api/public/applications/${id}/image`);assert.equal(unauthImage.status,404);
 const img=await fetch(base+`/api/public/applications/${id}/image`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');assert.equal((await img.arrayBuffer()).byteLength>50,true);
 const staffHome=await fetch(base+'/staff.html');assert.equal(staffHome.status,200);const staffJS=await fetch(base+'/staff.js');assert.equal(staffJS.status,200);
 const noAccess=await api(`/api/staff/applications/${id}`);assert.equal(noAccess.code,401);
 const detail=await api(`/api/staff/applications/${id}`,'GET',null,adminKey);assert.equal(detail.code,200);assert.equal(detail.data.data.imageAvailable,true);assert.equal('token_hash' in detail.data.data,false);assert.equal('image_file' in detail.data.data,false);
 const adminImg=await fetch(base+`/api/staff/applications/${id}/image`,{headers:{Authorization:`Bearer ${adminKey}`}});assert.equal(adminImg.status,200);
 const recover=await api('/api/public/recovery/request','POST',{email:payload.email});assert.equal(recover.code,202,JSON.stringify(recover));const found=/recovery\/([A-Za-z0-9_-]{43})/.exec(lastMail);assert.ok(found,'recovery token mail not sent '+lastMail);
 const redeem=await api('/api/public/recovery/redeem','POST',{token:found[1]});assert.equal(redeem.code,200,JSON.stringify(redeem));assert.equal(redeem.data.applications.length,1);const rotated=redeem.data.applications[0].accessToken;assert.notEqual(rotated,token);
 assert.equal((await api(`/api/public/applications/${id}`,'GET',null,token)).code,404,'old token must be invalidated');
 assert.equal((await api(`/api/public/applications/${id}`,'GET',null,rotated)).code,200);
 assert.equal((await api('/api/public/recovery/redeem','POST',{token:found[1]})).code,410,'one-time link only');
 assert.equal((await fetch(base+'/auth.js')).status,404,'old petugas data still forbidden');
 console.log('PASS MEGA: private image upload+ACL, staff UI+RBAC, email recovery one-time+rotation, no legacy exposure');
} finally {proc.kill('SIGTERM');mock.close();await new Promise(r => {
    if (proc.exitCode !== null) return r();
    proc.once('exit', () => r());
    setTimeout(r, 1000);
  });
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}}
