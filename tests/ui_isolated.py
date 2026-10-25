"""Static browser QA. Requires playwright + Chromium. No live payments or network.
Run: python tests/ui_isolated.py
This isolates visual/function checks; it is NOT a true network E2E test.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
page_html = (ROOT / 'public/index.html').read_text()
css = (ROOT / 'public/public.css').read_text()
js = (ROOT / 'public/public.js').read_text()
page_html = page_html.replace('<link rel="stylesheet" href="public.css">', '<style>'+css+'</style>')
page_html = page_html.replace('<script type="module" src="public.js"></script>', '')
page_html = page_html.replace('</body>', '<script>'+js+'</script></body>')
TOKEN = 'A' * 43
APP_ID = 'TR-20261026-ABCDEF1234'
status_payload = {
  'ok': True, 'id': APP_ID, 'company': '<script>bad company</script>',
  'product': 'Keripik Singkong', 'amount': 25000, 'paymentStatus': 'paid',
  'reviewStatus': 'report_ready', 'createdAt': '2026-10-26T00:00:00Z',
  'note': '', 'checkoutUrl': '',
  'report': {'title':'Pemeriksaan awal kesiapan label',
    'disclaimer':'Bukan izin edar BPOM',
    'regulation':'PerBPOM 31/2018 jo. 20/2021 jo. 6/2024',
    'claims': [], 'nextSteps':['Periksa label','Konsultasi bila perlu'],
    'checks': [
      {'id':'nama','label':'Nama produk','status':'detected','note':'Nama ditemukan'},
      {'id':'komposisi','label':'Komposisi','status':'detected','note':'Komposisi ditemukan'},
      {'id':'produsen','label':'Alamat produsen','status':'review','note':'Alamat perlu diperiksa'},
      {'id':'halal','label':'Halal','status':'conditional','note':'Konfirmasi kewajiban'},
      {'id':'nie','label':'Nomor izin edar','status':'info','note':'Belum ada nomor'}
    ]
  }
}
import json
MOCK_JS = """window.fetch=async(url,opts)=>({ok:true,status:200,json:async()=>String(url).includes('/api/public/applications/')?STATUS:({ok:true,price:25000,paymentEnabled:true,sandbox:true})})"""

def assert_no_overflow(pg, width):
    scroll_width = pg.evaluate('document.documentElement.scrollWidth')
    assert scroll_width <= width, f'horizontal overflow {scroll_width} > {width}'

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for label,w,h in [('desktop',1440,900),('mobile',390,844),('small',320,690)]:
        pg = browser.new_page(viewport={'width':w,'height':h})
        errors=[]
        pg.on('pageerror', lambda error: errors.append(str(error)))
        pg.evaluate('window.STATUS='+json.dumps(status_payload))
        pg.evaluate(MOCK_JS)
        pg.set_content(page_html, wait_until='load')
        pg.wait_for_timeout(150)
        assert not errors, errors
        assert_no_overflow(pg,w)
        assert pg.locator('#homeView').is_visible()
        if label in ['desktop','mobile']:
            pg.screenshot(path=str(ROOT/'design-preview'/f'landing-{label}-v3.png'),full_page=True)
        if w < 700:
            menu=pg.locator('#menuToggle')
            menu.click(); assert menu.get_attribute('aria-expanded') == 'true'
            menu.click(); assert menu.get_attribute('aria-expanded') == 'false'
        pg.locator('a[href="#apply"]').first.click()
        pg.locator('#applyView').wait_for(state='visible', timeout=2500)
        assert pg.locator('#submitForm').is_disabled() is False
        pg.locator('#company').fill('UMKM Test')
        pg.locator('#contact').fill('Tester')
        pg.locator('#email').fill('tester@example.com')
        pg.locator('#phone').fill('081234567890')
        pg.locator('#nextStep').click()
        assert pg.locator('#step2').is_visible()
        assert_no_overflow(pg,w)
        if label in ['desktop','mobile']:
            pg.screenshot(path=str(ROOT/'design-preview'/f'form-{label}-v3.png'),full_page=True)
        pg.evaluate("window.location.hash='status/"+APP_ID+'/'+TOKEN+"'")
        pg.wait_for_timeout(150)
        pg.locator('#trackView').wait_for(state='visible', timeout=2500)
        assert pg.locator('#trackCard').get_by_text('Pembayaran terverifikasi').first.is_visible()
        assert pg.locator('#trackCard').get_by_text('Pemeriksaan awal kesiapan label').first.is_visible()
        assert pg.locator('#trackView script').count()==0, 'XSS markup escaped'
        assert_no_overflow(pg,w)
        if label in ['desktop','mobile']:
            pg.screenshot(path=str(ROOT/'design-preview'/f'dashboard-{label}-v3.png'),full_page=True)
        pg.locator('#refreshStatus').click()
        assert pg.locator('#trackCard').get_by_text('Pembayaran terverifikasi').first.is_visible()
        assert not errors, errors
        print(f'PASS isolated browser {label} {w}px: landing, mobile menu, form steps, paid dashboard, XSS, refresh, no overflow')
        pg.close()
    browser.close()
