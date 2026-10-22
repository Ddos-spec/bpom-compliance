// Smoke test alur UI lengkap. Jalankan: node smoke.cjs  (butuh server di :4173)
const { chromium } = require('D:/code/.system_tools/browser_runner/node_modules/playwright');
const fs = require('fs');
const bp = 'D:/code/.system_tools/playwright-browsers';
if (fs.existsSync(bp)) process.env.PLAYWRIGHT_BROWSERS_PATH = bp;
const BASE = 'http://localhost:4173/';
const results = [];
const SHOTS = require('path').join(__dirname, '..', '.e2e', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('dialog', (d) => d.accept());
    const T = (n) => `${label}: ${n}`;
    const shot = (name) => page.screenshot({ path: SHOTS + '/' + label + '-' + name + '.png', fullPage: true });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    ok(T('antrean render'), (await page.locator('h1').innerText()) === 'Antrean pemeriksaan');
    await shot('1-antrean');
    ok(T('filter bawaan = perlu keputusan (4 baris)'), (await page.locator('.q-row').count()) === 4, String(await page.locator('.q-row').count()));
    await page.fill('#q', 'warsih');
    ok(T('pencarian'), (await page.locator('.q-row').count()) === 1);
    await page.fill('#q', 'zzzz');
    ok(T('pencarian kosong -> empty state'), (await page.locator('.empty').count()) === 1);
    await page.fill('#q', '');
    await page.selectOption('#sort', 'masalah');
    ok(T('sort bermasalah: baris pertama perlu perbaikan'), /perbaikan/i.test(await page.locator('.q-row .pill').first().innerText()));
    await page.click('.count[data-f="semua"]');
    ok(T('filter semua = 8'), (await page.locator('.q-row').count()) === 8);
    await page.locator('.q-row[href="#/p/P-0412"]').click();
    await page.waitForSelector('.verdict');
    ok(T('detail: 9 butir'), (await page.locator('.finding').count()) === 9);
    await page.locator('.ev[data-ref="bahan"]').click();
    ok(T('klik bukti menyorot teks label'), (await page.locator('#labelText mark.on').count()) === 1);
    ok(T('detail: panel NIE'), (await page.locator('#niePanel').count()) === 1);
    await shot('2-detail');
    await page.click('#nieBtn');
    await page.waitForSelector('#nieOut .q-find');
    ok(T('cek BPOM jujur belum tersambung'), /belum tersambung/.test(await page.locator('#nieOut').innerText()));
    await page.fill('#note', 'uji catatan');
    await page.locator('#note').blur();
    await page.waitForTimeout(200);
    ok(T('catatan masuk toast'), /disimpan/i.test(await page.locator('#toast').innerText()));
    // edit teks label
    await page.click('#tabRaw');
    await page.click('#editBtn');
    await page.fill('#labelEdit', 'ABC\nKomposisi: x\nBerat bersih: 10 g');
    await page.click('#saveLabel');
    await page.waitForSelector('.verdict');
    ok(T('edit teks -> periksa ulang -> perlu perbaikan'), /perlu perbaikan/i.test(await page.locator('.verdict .v').innerText()));
    await page.click('#tabWA');
    ok(T('pesan pelaku usaha muncul'), (await page.locator('#msgText').count()) === 1);
    await shot('3-detail-perbaikan');
    await page.click('[data-act="perbaikan"]');
    await page.waitForTimeout(150);
    ok(T('stage -> perbaikan + riwayat'), /Menunggu perbaikan/.test(await page.locator('.sub').first().innerText()) && (await page.locator('.log li').count()) >= 3);
    // baru
    await page.goto(BASE + '#/baru');
    await page.waitForSelector('#f');
    await page.click('#go');
    ok(T('form kosong -> error nama'), /Nama produk wajib/.test(await page.locator('#err').innerText()));
    await page.click('#demo');
    await shot('4-baru-form');
    await page.fill('#nie', 'XX12');
    ok(T('hint NIE salah'), /tidak sesuai|Format tidak/i.test(await page.locator('#nieHint').innerText()));
    await page.fill('#nie', 'MD 267800000099');
    await page.click('#go');
    await page.waitForSelector('.verdict', { timeout: 8000 });
    ok(T('submit -> detail berkas baru'), /#\/p\/P-0\d+/.test(page.url()) && (await page.locator('.finding').count()) === 9);
    ok(T('berkas baru: tanpa halal -> perlu perbaikan'), /perlu perbaikan/i.test(await page.locator('.verdict .v').innerText()));
    // foto
    await page.goto(BASE + '#/baru');
    await page.waitForSelector('#f');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.setInputFiles('#img', { name: 'l.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('#prev img');
    ok(T('foto: pratinjau muncul'), true);
    await page.fill('#name', 'Produk Foto');
    await page.click('#go');
    await page.waitForSelector('.verdict', { timeout: 8000 });
    ok(T('foto tanpa teks -> "Teks label belum dibaca"'), /belum dibaca/.test(await page.locator('.verdict .v').innerText()));
    ok(T('foto tampil di detail'), (await page.locator('#photoBtn img').count()) === 1);
    await shot('5-detail-foto');
    await page.click('#photoBtn');
    ok(T('dialog foto terbuka'), await page.locator('#imgDlg[open]').count() === 1);
    await page.keyboard.press('Escape');
    // aturan + setelan
    await page.goto(BASE + '#/aturan');
    ok(T('aturan: 9 baris'), (await page.locator('.rule-row').count()) === 9);
    await shot('6-aturan');
    await page.goto(BASE + '#/setelan');
    await page.waitForSelector('#exp');
    await shot('7-setelan');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exp')]);
    ok(T('ekspor JSON terunduh'), /^tera-.*\.json$/.test(dl.suggestedFilename()));
    await page.click('#rst');
    await page.waitForTimeout(200);
    await page.goto(BASE);
    ok(T('reset -> data awal kembali (4 perlu keputusan)'), (await page.locator('.q-row').count()) === 4);
    if (label === 'mobile') {
      await page.click('#menuBtn');
      await page.waitForTimeout(300);
      ok(T('drawer mobile terbuka'), (await page.evaluate(() => document.body.classList.contains('menu-open'))));
      await page.keyboard.press('Escape');
      ok(T('horizontal overflow tidak ada'), await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    ok(T('tanpa error console'), errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await browser.close();
  results.forEach(([s, n, e]) => console.log(`${s}  ${n}${e ? '  -> ' + e : ''}`));
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - fails}/${results.length} lulus`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });

