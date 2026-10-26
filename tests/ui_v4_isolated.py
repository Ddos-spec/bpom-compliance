"""Isolated browser UI QA; intentionally not a live domain/payment integration."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'public/staff.html').read_text();css=(root/'public/staff.css').read_text();js=(root/'public/staff.js').read_text()
mock='''window.fetch=async (url,opts={})=>{let data;
 if(String(url)==='/api/staff/applications')data={ok:true,data:[{id:'TR-20261026-TEST',product:'Keripik Pisang',company:'UMKM Contoh',contact:'Pengusaha',payment_status:'paid',review_status:'report_ready',created_at:'2026-10-26T00:00:00Z'}]};
 else if(String(url).startsWith('/api/staff/applications/')){if(opts.method==='PATCH')data={ok:true};else data={ok:true,data:{id:'TR-20261026-TEST',product:'Keripik Pisang',company:'UMKM Contoh',contact:'Pengusaha',email:'test@example.com',phone:'081234567890',category:'Makanan ringan',nie:'',amount:25000,payment_status:'paid',review_status:'report_ready',staff_note:'',label_text:'Komposisi: pisang, minyak, gula',imageAvailable:false}};}
 else data={ok:false,error:'Not found'};
 return new Response(JSON.stringify(data),{status:data.ok?200:404,headers:{'Content-Type':'application/json'}})}'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [1440,390,320]:
  page=browser.new_page(viewport={'width':width,'height':850},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded');page.add_style_tag(content=css);page.evaluate(mock);page.add_script_tag(content=js)
  assert page.locator('h1').first.is_visible()
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),f'login overflow {width}'
  page.locator('#adminKey').fill('test_admin_secret_test_admin_secret_test')
  page.locator('#loginForm button').click()
  page.locator('#workspace').wait_for(state='visible',timeout=8000)
  assert page.locator('#total').inner_text()=='1'
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),f'dashboard overflow {width}'
  page.locator('#applicationRows button').first.click()
  page.locator('#detail').wait_for(state='visible')
  assert page.locator('#detailTitle').inner_text()=='Keripik Pisang'
  page.locator('#reviewStatus').select_option('revision_requested');page.locator('#staffNote').fill('Periksa ulang informasi kemasan.')
  page.locator('#updateForm button').click()
  page.get_by_text('Perubahan tersimpan dan dapat dilihat pelanggan.').wait_for(timeout=5000)
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),f'detail overflow {width}'
  assert not errors,errors
  page.screenshot(path=str(root/f'qa-v4-staff-{width}.png'),full_page=False)
  print(f'PASS V4 staff isolated UI {width}px: login, list, detail, update, no overflow/error')
  page.close()
 browser.close()
