/** Integration tests without external network or real payments. */
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tera-test-'));
const gateway = http.createServer((req, res) => {
  if (req.url !== '/snap/v1/transactions') { res.writeHead(404); return res.end(); }
  let raw = '';
  req.on('data', x => raw += x);
  req.on('end', () => {
    const order = JSON.parse(raw);
    assert.equal(order.transaction_details.gross_amount, 25000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token: 'test', redirect_url: `http://127.0.0.1:${fakePort}/pay/${order.transaction_details.order_id}` }));
  });
});
await new Promise(ok => gateway.listen(0, '127.0.0.1', ok));
const fakePort = gateway.address().port;
const testPort = await new Promise((resolve, reject) => {
  const s = http.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const adminKey = 'test_admin_secret_abcdefghijklmnopqrstuvwxyz';
const secret = 'SB-Mid-server-TEST';
const proc = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test', PORT: String(testPort), TERA_DATA_DIR: temp, SERVICE_FEE_IDR: '25000', MIDTRANS_SERVER_KEY: secret, TERA_ADMIN_KEY: adminKey, MIDTRANS_SNAP_URL: `http://127.0.0.1:${fakePort}/snap/v1/transactions` },
  stdio: ['ignore', 'pipe', 'pipe']
});
let errors = '';
proc.stderr.on('data', x => errors += x.toString());
const base = `http://127.0.0.1:${testPort}`;
async function req(url, init) {
  const r = await fetch(base + url, init);
  const d = await r.json();
  return { code: r.status, data: d };
}
async function wait() {
  for (let i = 0; i < 80; i++) {
    try { const r = await req('/api/public/config'); if (r.code === 200) return; } catch { /* retry */ }
    await new Promise(ok => setTimeout(ok, 50));
  }
  throw new Error(`Server did not start. ${errors}`);
}
let succeeded = false;
try {
  await wait();
  const config = await req('/api/public/config');
  assert.equal(config.data.paymentEnabled, true);
  assert.equal(config.data.price, 25000);
  const app = await req('/api/public/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    company: 'UMKM Contoh', contact: 'Pengusaha', email: 'tester@example.com', phone: '081234567890',
    product: 'Keripik Tempe', category: 'Makanan ringan', nie: '', consent: true,
    labelText: 'Keripik Tempe\nKomposisi: tempe, tepung terigu, minyak, garam\nBerat bersih: 200 g\nDiproduksi oleh: UMKM Contoh, Kota Tangsel\nBatch: AB10\nBest before: 20 Juni 2027'
  }) });
  assert.equal(app.code, 201);
  assert.equal(app.data.paymentStatus, 'pending');
  assert.ok(app.data.id.startsWith('TR-'));
  const url = `/api/public/applications/${app.data.id}`;
  const wrong = await req(url, { headers: { Authorization: 'Bearer ' + 'a'.repeat(43) } });
  assert.equal(wrong.code, 404);
  const status = () => req(url, { headers: { Authorization: `Bearer ${app.data.accessToken}` } });
  const before = await status();
  assert.equal(before.data.report, null);
  assert.equal(before.data.paymentStatus, 'pending');
  const badAdmin = await req('/api/staff/applications');
  assert.equal(badAdmin.code, 401);
  const adminHead = { Authorization: `Bearer ${adminKey}` };
  const staffBefore = await req(`/api/staff/applications/${app.data.id}`, { method: 'PATCH', headers: { ...adminHead, 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewStatus: 'completed' }) });
  assert.equal(staffBefore.code, 409);
  const amount = '25000.00';
  const signed = {
    order_id: app.data.id, gross_amount: amount, status_code: '200', transaction_status: 'settlement', currency: 'IDR'
  };
  const wrongSign = await req('/api/payments/midtrans/notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...signed, signature_key: '0'.repeat(128) }) });
  assert.equal(wrongSign.code, 403);
  assert.equal((await status()).data.paymentStatus, 'pending');
  const sign = crypto.createHash('sha512').update(app.data.id + '200' + amount + secret).digest('hex');
  const webhook = await req('/api/payments/midtrans/notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...signed, signature_key: sign }) });
  assert.equal(webhook.code, 200);
  const after = await status();
  assert.equal(after.data.paymentStatus, 'paid');
  assert.ok(after.data.report.checks.length >= 8);
  assert.ok(!JSON.stringify(after.data.report).includes('BA-WAS'));
  const nieCheck = after.data.report.checks.find(c => c.id === 'nie');
  assert.equal(nieCheck.status, 'info');
  const staffList = await req('/api/staff/applications', { headers: adminHead });
  assert.equal(staffList.code, 200);
  assert.equal(staffList.data.data.length, 1);
  assert.ok(!JSON.stringify(staffList.data).includes('label_text'));
  const staffUpdate = await req(`/api/staff/applications/${app.data.id}`, { method: 'PATCH', headers: { ...adminHead, 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewStatus: 'revision_requested', note: 'Perbaiki label.' }) });
  assert.equal(staffUpdate.code, 200);
  const followup = await status();
  assert.equal(followup.data.reviewStatus, 'revision_requested');
  assert.equal(followup.data.note, 'Perbaiki label.');
  const publicLeak = await req('/api/records');
  assert.equal(publicLeak.code, 404);
  const oldPublicUserData = await fetch(base + '/auth.js');
  assert.equal(oldPublicUserData.status, 404);
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  const markup = await html.text();
  assert.ok(markup.includes('Produk bagus'));
  assert.ok(markup.includes('trackCard'));
  assert.ok(markup.includes('demoFinding'));
  const css = await fetch(base + '/public.css');
  assert.equal(css.status, 200);
  assert.ok((await css.text()).includes('.workspace-layout'));
  const js = await fetch(base + '/public.js');
  assert.equal(js.status, 200);
  assert.ok((await js.text()).includes('workspaceHtml'));
  assert.ok(!markup.includes('Petugas Disperindag'));
  succeeded = true;
  console.log('PASS: public config, paid intake, token privacy, forged webhook rejected, genuine settlement, report gate, admin gate, status update, old API disabled');
} finally {
  proc.kill();
  gateway.close();
  await new Promise(r => {
    if (proc.exitCode !== null) return r();
    proc.once('exit', () => r());
    setTimeout(r, 1000);
  });
  try {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
}
if (!succeeded) process.exitCode = 1;
