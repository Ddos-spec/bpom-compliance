/** Fail-closed test: serverless ephemeral mode cannot accept payments/account logins. */
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tera-v6-preview-'));
const tmpPort=http.createServer();await new Promise(ok=>tmpPort.listen(0,'127.0.0.1',ok));const port=tmpPort.address().port;await new Promise(ok=>tmpPort.close(ok));
const proc=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,VERCEL:'1',NODE_ENV:'production',PORT:String(port),TERA_DATA_DIR:temp,MIDTRANS_SERVER_KEY:'SB-Mid-server-key-mock',RESEND_API_KEY:'re_mock',TERA_EMAIL_FROM:'Tera <noreply@example.test>',TERA_PUBLIC_URL:'https://example.test'},stdio:'ignore'});
try {
 let r;for(let i=0;i<90;i++){try{r=await fetch(`http://127.0.0.1:${port}/api/public/config`);break;}catch{await new Promise(ok=>setTimeout(ok,60));}}
 assert.ok(r,'preview server did not start');const config=await r.json();assert.equal(config.paymentEnabled,false);assert.equal(config.recoveryEnabled,false);
 r=await fetch(`http://127.0.0.1:${port}/api/account/config`);assert.equal((await r.json()).loginEnabled,false);
 r=await fetch(`http://127.0.0.1:${port}/api/public/applications`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});assert.equal(r.status,503);
 r=await fetch(`http://127.0.0.1:${port}/demo.html`);assert.equal(r.status,200);const markup=await r.text();assert.match(markup,/Tanpa database|TANPA DATABASE/i);assert.match(markup,/Bukan transaksi asli/i);
 console.log('PASS V6 PREVIEW: ephemeral checkout/login disabled, read-only demo accessible');
}finally{proc.kill('SIGTERM');await new Promise(r => { if (proc.exitCode !== null) return r(); proc.once('exit', () => r()); setTimeout(r, 1000); }); try { fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100}); } catch {}}
