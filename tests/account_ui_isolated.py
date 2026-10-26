"""Browser render actual account.html/css/js, with local fulfilled API fixtures (NOT actual merchant UAT)."""
from pathlib import Path
from urllib.parse import urlparse
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
records=[
 dict(id='TR-20261026-AB12CD',product='Keripik Pisang Premium',company='Dapur Sejahtera',category='Makanan ringan',paymentStatus='paid',reviewStatus='report_ready',amount=25000,createdAt='2026-10-26T08:00:00Z',updatedAt='2026-10-26T08:00:00Z'),
 dict(id='TR-20261025-AB12CE',product='Sambal Cumi Pedas',company='Dapur Sejahtera',category='Bumbu dan saus',paymentStatus='pending',reviewStatus='awaiting_payment',amount=25000,createdAt='2026-10-25T08:00:00Z',updatedAt='2026-10-25T08:00:00Z'),
 dict(id='TR-20261024-AB12CF',product='Kopi Bubuk Arabika',company='Dapur Sejahtera',category='Minuman',paymentStatus='paid',reviewStatus='completed',amount=25000,createdAt='2026-10-24T08:00:00Z',updatedAt='2026-10-24T08:00:00Z'),
 dict(id='TR-20261023-AB12CG',product='Manisan Buah',company='Dapur Sejahtera',category='Olahan buah',paymentStatus='failed',reviewStatus='awaiting_payment',amount=25000,createdAt='2026-10-23T08:00:00Z',updatedAt='2026-10-23T08:00:00Z'),
]
checks=[dict(id='bahan',label='Daftar bahan',status='detected',note='Informasi daftar bahan teridentifikasi dalam teks label.'),dict(id='alamat',label='Alamat produsen',status='review',note='Periksa kelengkapan alamat produsen.')]
def fake(route):
 u=urlparse(route.request.url); path=u.path
 if path.endswith(('.html','.js','.css','.svg')) or path=='/':
  file = root/'public'/('account.html' if path=='/' else path.lstrip('/'))
  if not file.exists(): route.fulfill(status=404,body='missing');return
  mime='text/html' if file.suffix=='.html' else 'text/javascript' if file.suffix=='.js' else 'text/css' if file.suffix=='.css' else 'image/svg+xml'
  route.fulfill(status=200,body=file.read_bytes(),content_type=mime);return
 if path=='/api/account/config': body={'ok':True,'loginEnabled':True,'provider':'email_magic_link'}
 elif path=='/api/account/me': body={'ok':True,'email':'pemilik@dapur-sejahtera.id'}
 elif path=='/api/account/applications': body={'ok':True,'data':records}
 elif path.startswith('/api/account/applications/'):
  id=path.split('/')[-1]; a=next((r for r in records if r['id']==id),None)
  if not a: route.fulfill(status=404,content_type='application/json',body='{"error":"not found"}');return
  body={'ok':True,**a,'labelText':'Keripik pisang. Komposisi: Pisang, minyak nabati. Berat bersih: 150 g. Diproduksi oleh Dapur Sejahtera, Kota Jakarta.','contact':'Mitra Dapur', 'imageAvailable':False,'checkoutUrl':'https://app.sandbox.midtrans.com/snap/v4/abc', 'report':{'title':'Pemeriksaan label awal','checks':checks,'nextSteps':['Periksa alamat produsen','Lanjutkan ke portal registrasi resmi BPOM'],'disclaimer':'Bukan sertifikat BPOM.'} if a['paymentStatus']=='paid' else None}
 elif path=='/api/account/logout': body={'ok':True}
 else:route.fulfill(status=404,body='{}',content_type='application/json');return
 route.fulfill(status=200,body=json.dumps(body),content_type='application/json')

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page_html=(root/'public/account.html').read_text()
 page_css=(root/'public/account.css').read_text()
 page_js=(root/'public/account.js').read_text()
 mock_js="""window.fetch=async (url,opts={})=>{
 let path=String(url), data;
 const records=__RECORDS__;
 const checks=__CHECKS__;
 if(path==='/api/account/config')data={ok:true,loginEnabled:true,provider:'email_magic_link'};
 else if(path==='/api/account/me')data={ok:true,email:'pemilik@dapur-sejahtera.id'};
 else if(path==='/api/account/applications')data={ok:true,data:records};
 else if(path.startsWith('/api/account/applications/')){
   const id=path.split('/').pop(),r=records.find(x=>x.id===id);
   data=r?{ok:true,...r,labelText:'Keripik pisang. Komposisi: Pisang, minyak nabati. Berat bersih: 150 g. Diproduksi oleh Dapur Sejahtera, Kota Jakarta.',imageAvailable:false,checkoutUrl:'https://app.sandbox.midtrans.com/snap/v4/abc',report:r.paymentStatus==='paid'?{checks,nextSteps:['Periksa alamat produsen'],disclaimer:'Bukan izin edar BPOM.'}:null}: {ok:false,error:'not found'};
 }
 else if(path==='/api/account/logout')data={ok:true};
 else data={ok:false,error:'Not found'};
 return new Response(JSON.stringify(data),{status:data.ok?200:404,headers:{'Content-Type':'application/json'}});
};""".replace('__RECORDS__',json.dumps(records)).replace('__CHECKS__',json.dumps(checks))
 for width,height,label in [(1440,900,'desktop'),(390,844,'mobile'),(320,740,'small')]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(page_html,wait_until='domcontentloaded')
  page.add_style_tag(content=page_css)
  page.evaluate(mock_js)
  page.add_script_tag(content=page_js)
  page.evaluate("document.querySelector('.logo img').src = " + json.dumps('data:image/svg+xml,'+__import__('urllib.parse',fromlist=['quote']).quote((root/'public/favicon.svg').read_text())))
  page.locator('#overviewSection').wait_for(state='visible')
  assert page.locator('#metricTotal').inner_text()=='4'
  assert page.locator('#metricReady').inner_text()=='2'
  assert page.locator('#metricPending').inner_text()=='1'
  page.screenshot(path=str(root/f'design-preview/v5-account-{label}.png'),full_page=True)
  page.locator('[data-section="products"]').click()
  assert page.locator('#allProducts [data-open]').count()==4
  page.locator('[data-filter="pending"]').click();assert page.locator('#allProducts [data-open]').count()==1
  page.locator('[data-filter="all"]').click()
  page.locator('#allProducts [data-open="TR-20261026-AB12CD"]').click()
  page.locator('#detailSection').wait_for(state='visible')
  page.locator('#detailContent').get_by_text('Daftar bahan').first.wait_for(state='visible')
  page.screenshot(path=str(root/f'design-preview/v5-detail-{label}.png'),full_page=True)
  page.locator('[data-section="payments"]').click();assert page.locator('#paymentRows tr').count()==4
  page.locator('[data-section="guide"]').click();assert page.locator('#guideSection article').count()==3
  size=page.evaluate('({body:document.body.scrollWidth,root:document.documentElement.scrollWidth,width:window.innerWidth})')
  assert size['root']<=width+1,f'overflow at {width}: {size}'
  assert not errors,f'JS errors at {width}: {errors}'
  print(f'PASS account browser {width}px: overview, filters, detail, billing, guide, no overflow/error')
  page.close()
 # Guest account entry, email request and non-verified state.
 page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
 page.set_content(page_html,wait_until='domcontentloaded');page.add_style_tag(content=page_css)
 page.evaluate("""window.fetch=async (url,opts={})=>new Response(JSON.stringify(String(url)==='/api/account/config'?{ok:true,loginEnabled:true}:String(url)==='/api/account/me'?{ok:false,error:'not logged in'}:{ok:true,message:'Tautan telah dikirim jika email valid.'}),{status:String(url)==='/api/account/me'?401:200,headers:{'Content-Type':'application/json'}})""")
 page.add_script_tag(content=page_js);page.locator('#loginView').wait_for(state='visible')
 page.evaluate("document.querySelector('.logo img').src = " + json.dumps('data:image/svg+xml,'+__import__('urllib.parse',fromlist=['quote']).quote((root/'public/favicon.svg').read_text())))
 page.screenshot(path=str(root/'design-preview/v5-login-desktop.png'),full_page=True)
 page.locator('#loginEmail').fill('owner@example.com');page.locator('#loginButton').click();page.get_by_text('Tautan telah dikirim').wait_for()
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
 print('PASS login browser: valid email request / guest state')
 page.close()
 browser.close()
