"""V6 customer revision + receipt browser QA: actual UI source, simulated authenticated API."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'public/account.html').read_text()
css=(root/'public/account.css').read_text()
js=(root/'public/account.js').read_text()
mock=r'''window.__revised=false;
window.fetch=async (url,opts={})=>{
 const path=String(url),method=(opts.method||'GET').toUpperCase();let o={ok:true};
 if(path==='/api/account/config')o={ok:true,loginEnabled:true};
 else if(path==='/api/account/me')o={ok:true,email:'verified@test.example'};
 else if(path==='/api/account/applications')o={ok:true,data:[{id:'TR-20261027-ABC123',company:'UMKM Contoh',product:'Sambal Rasa',category:'Bumbu dan saus',amount:25000,paymentStatus:'paid',reviewStatus:window.__revised?'in_review':'revision_requested',createdAt:'2026-10-27T00:00:00Z'}]};
 else if(path.endsWith('/receipt'))o={ok:true,documentType:'Bukti transaksi layanan Tera',reference:'TR-20261027-ABC123',customer:'UMKM Contoh',product:'Sambal Rasa',amount:25000,provider:'Midtrans',paymentStatus:'paid',createdAt:'2026-10-27T00:00:00Z',lastUpdatedAt:'2026-10-27T00:00:00Z',scope:'Pemeriksaan awal label',disclaimer:'Bukan faktur pajak'};
 else if(path.endsWith('/revisions')&&method==='POST'){window.__revised=true;o={ok:true,message:'Revisi diterima'};}
 else if(path.endsWith('/TR-20261027-ABC123'))o={ok:true,id:'TR-20261027-ABC123',company:'UMKM Contoh',product:'Sambal Rasa',category:'Bumbu dan saus',amount:25000,paymentStatus:'paid',reviewStatus:window.__revised?'in_review':'revision_requested',createdAt:'2026-10-27T00:00:00Z',updatedAt:'2026-10-27T00:00:00Z',labelText:'Sambal Rasa, Komposisi: cabai, minyak, garam. Berat bersih: 100 g',report:{checks:[{id:'nama',label:'Nama produk',status:'detected',note:'Terdeteksi'}],nextSteps:[],disclaimer:'Bukan izin edar'},revisions:window.__revised?[{id:3,status:'submitted',proposedText:'Teks usulan',note:'Diperbaiki',createdAt:'2026-10-27T00:00:00Z'}]:[]};
 else o={ok:false,error:'Not found '+path};
 return new Response(JSON.stringify(o),{status:o.ok?200:404,headers:{'Content-Type':'application/json'}});
};'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390,320]:
  page=browser.new_page(viewport={'width':width,'height':840},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded');page.add_style_tag(content=css);page.evaluate(mock);page.add_script_tag(content=js)
  page.locator('#overviewSection').wait_for(state='visible')
  page.locator('#latestProducts [data-open]').first.click()
  page.locator('#v6RevisionForm').wait_for(state='visible')
  page.screenshot(path=str(root/f'design-preview/v6-revision-{width}.png'),full_page=True)
  with page.expect_download(timeout=10000) as dl:
   page.locator('[data-action="receipt"]').click()
  receipt=dl.value
  assert receipt.suggested_filename=='TERA-bukti-TR-20261027-ABC123.html',receipt.suggested_filename
  page.locator('#v6RevisedText').fill('Sambal Rasa revisi. Komposisi: cabai merah, minyak nabati, garam. Berat bersih: 100 g. Diproduksi UMKM Contoh di Bandung.')
  page.locator('#v6RevisionNote').fill('Alamat produksi diperjelas')
  page.locator('#v6RevisionForm button').click()
  page.get_by_text('Menunggu peninjauan').first.wait_for(state='visible')
  assert page.locator('#v6RevisionForm').count()==0
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
  assert not errors, errors
  print(f'PASS V6 UI {width}px: receipt download, revision request, history, no overflow/error')
  page.close()
 browser.close()
