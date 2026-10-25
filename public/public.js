/** Tera customer-facing journeys. No fabricated analytics, government authority, or paid states. */
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config={price:0,paymentEnabled:false,sandbox:true};
let currentPrivateHash=''; let lastStatusPath=''; let submitting=false;
$('year').textContent=String(new Date().getFullYear());

async function api(endpoint,opts={}){
  const response=await fetch(endpoint,{...opts,headers:{...(opts.headers||{}),...(opts.body?{'Content-Type':'application/json'}:{})},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw new Error(data.error||'Tidak dapat terhubung ke server Tera.');
  return data;
}
async function loadConfig(){
  try{
    Object.assign(config,await api('/api/public/config'));
    $('priceValue').textContent=money(config.price);
    $('formPrice').textContent=money(config.price);
    $('priceHint').textContent=config.paymentEnabled?(config.sandbox?'Mode sandbox aktif. Pembayaran hanya untuk pengujian.':'Checkout online tersedia melalui penyedia pembayaran.'):'Checkout belum diaktifkan pengelola.';
    if(!config.paymentEnabled){$('paymentNotice').hidden=false;$('paymentNotice').textContent='Pendaftaran berbayar belum dibuka karena gateway belum dikonfigurasi. Kamu masih dapat melihat contoh alur dan mengisi formulir.';$('submitForm').disabled=true;}
  }catch{
    $('priceValue').textContent='Tidak tersedia';$('formPrice').textContent='—';$('priceHint').textContent='Tidak dapat memuat tarif.';
    $('submitForm').disabled=true;$('paymentNotice').hidden=false;$('paymentNotice').textContent='Koneksi server tidak tersedia. Pengajuan sementara ditutup.';
  }
}

const demoData={
  composition:{symbol:'✓',title:'Komposisi teridentifikasi',body:'Contoh: Pisang, minyak nabati, gula. Tetap cek kesesuaian dengan resep sebenarnya.',warning:false},
  weight:{symbol:'✓',title:'Berat bersih ditemukan',body:'Contoh: “Berat bersih: 150 g” ditemukan pada teks label. Belum menilai ketepatan berat aktual.',warning:false},
  producer:{symbol:'!',title:'Alamat produsen perlu ditinjau',body:'Contoh: Nama produsen ada, tetapi detail alamat kota/kabupaten belum terlihat. Periksa kembali informasinya.',warning:true}
};
function selectDemo(key){
  const d=demoData[key];if(!d)return;
  for(const tab of document.querySelectorAll('[data-demo]')){const active=tab.dataset.demo===key;tab.classList.toggle('is-active',active);tab.setAttribute('aria-pressed',String(active));}
  const result=$('demoFinding');result.classList.toggle('warning',d.warning);
  result.innerHTML=`<span class="demo-result-icon">${d.symbol}</span><div><strong>${escapeHtml(d.title)}</strong><p>${escapeHtml(d.body)}</p></div>`;
}
for(const tab of document.querySelectorAll('[data-demo]'))tab.addEventListener('click',()=>selectDemo(tab.dataset.demo));

const menuButton=$('menuToggle');
function closeMenu(){menuButton.setAttribute('aria-expanded','false');$('mainNav').classList.remove('is-open');}
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')==='true';menuButton.setAttribute('aria-expanded',String(!open));$('mainNav').classList.toggle('is-open',!open);});
$('mainNav').addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});

function updateDashboardLink(){ $('dashboardLink').href=currentPrivateHash?`#${currentPrivateHash}`:'#track'; }
function route(){
  let hash=location.hash.slice(1)||'home';
  try{hash=decodeURIComponent(hash);}catch{hash='home';}
  const status=/^status\/(TR-[A-Z0-9-]+)\/([A-Za-z0-9_-]{40,100})$/.exec(hash);
  const isForm=hash==='apply'; const isTracking=hash==='track'||Boolean(status);
  $('homeView').hidden=isForm||isTracking;
  $('applyView').hidden=!isForm;
  $('trackView').hidden=!isTracking;
  $('trackEntry').hidden=Boolean(status);
  $('trackCard').hidden=!status;
  if(status){
    currentPrivateHash=hash;updateDashboardLink();
    const key=`${status[1]}/${status[2]}`;
    if(lastStatusPath!==key){lastStatusPath=key;showStatus(status[1],status[2]);}
  }else{lastStatusPath='';}
  if(['how','features','price','faq'].includes(hash)){
    $('homeView').hidden=false;
    requestAnimationFrame(()=>document.getElementById(hash)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
  }else{window.scrollTo({top:0,behavior:'instant'});}
  closeMenu();
}
window.addEventListener('hashchange',route);

const form=$('applyForm');
function showStep(n){
  $('step1').hidden=n!==1;$('step2').hidden=n!==2;
  $('formStepIndicator').textContent=`LANGKAH 0${n} / 02`;
  $('progressRail').style.width=n===1?'50%':'100%';
  $('journey1').classList.toggle('active',n===1);$('journey2').classList.toggle('active',n===2);
  $('formError').hidden=true;
  $('formTitle').focus({preventScroll:true});
  window.scrollTo({top:document.querySelector('#applyView').getBoundingClientRect().top+window.scrollY-85,behavior:'smooth'});
}
function failForm(message){$('formError').textContent=message;$('formError').hidden=false;$('formError').scrollIntoView({block:'nearest'});}
$('nextStep').addEventListener('click',()=>{for(const field of $('step1').querySelectorAll('input'))if(!field.reportValidity())return;showStep(2);});
$('prevStep').addEventListener('click',()=>showStep(1));
$('labelText').addEventListener('input',()=>{$('textCount').textContent=`${$('labelText').value.length.toLocaleString('id-ID')} / 16.000`;});
form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(submitting||!config.paymentEnabled)return;
  if(!form.reportValidity())return;
  const f=new FormData(form);const payload=Object.fromEntries(f.entries());payload.consent=f.get('consent')==='on';
  submitting=true;$('submitForm').disabled=true;$('submitForm').textContent='Membuat pengajuan…';$('formError').hidden=true;
  try{
    const result=await api('/api/public/applications',{method:'POST',body:JSON.stringify(payload)});
    if(!/^TR-[A-Z0-9-]+$/.test(result.id)||!/^[A-Za-z0-9_-]{40,100}$/.test(result.accessToken))throw new Error('Format tanda terima tidak valid.');
    const privateHash=`status/${result.id}/${result.accessToken}`;
    currentPrivateHash=privateHash;updateDashboardLink();
    location.hash=privateHash;
  }catch(err){failForm(err.message);}finally{submitting=false;$('submitForm').disabled=!config.paymentEnabled;$('submitForm').innerHTML='Buat pengajuan &amp; bayar <span>↗</span>';}
});
$('trackForm').addEventListener('submit',e=>{
  e.preventDefault();$('trackError').hidden=true;
  try{
    const url=new URL($('trackLink').value);
    if(url.origin!==location.origin||!/^#status\/TR-[A-Z0-9-]+\/[A-Za-z0-9_-]{40,100}$/.test(url.hash))throw new Error('Tautan pengajuan Tera tidak valid.');
    location.hash=url.hash;
  }catch(err){$('trackError').textContent=err.message;$('trackError').hidden=false;}
});

const paymentLabel={pending:'Menunggu pembayaran',paid:'Pembayaran terverifikasi',failed:'Pembayaran gagal / kedaluwarsa',refunded:'Dibatalkan / dikembalikan'};
const reviewLabel={awaiting_payment:'Menunggu pembayaran',report_ready:'Laporan tersedia',in_review:'Sedang ditinjau',revision_requested:'Perlu revisi',completed:'Tindak lanjut selesai',on_hold:'Ditangguhkan'};
const niceDate=raw=>{try{return new Date(raw).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});}catch{return '—';}};
const reportLabel={detected:'Terdeteksi',info:'Informasi',conditional:'Bersyarat',review:'Perlu ditinjau'};
function resultHtml(report){
  if(!report||!Array.isArray(report.checks))return `<div class="empty-report"><span class="empty-report-icon">⌁</span><h4>Laporan belum dapat ditampilkan</h4><p>Data pemeriksaan belum tersedia. Perbarui status pengajuan.</p></div>`;
  const counts={detected:0,review:0,info:0,conditional:0};for(const r of report.checks){counts[r.status]=(counts[r.status]||0)+1;}
  return `<div class="report-panel"><div class="report-lead"><h4>${escapeHtml(report.title)}</h4><p>${escapeHtml(report.disclaimer)}</p></div>
    <div class="report-overview"><span class="report-count">${counts.detected} terdeteksi</span><span class="report-count">${counts.review} perlu ditinjau</span><span class="report-count">${counts.conditional+counts.info} catatan lain</span></div>
    <div class="findings-list">${report.checks.map((item,i)=>{const status=reportLabel[item.status]||'Tinjau';const css=item.status==='review'?'warning':(['info','conditional'].includes(item.status)?'neutral':'');return `<div class="finding-row"><span class="finding-status ${css}"><span></span>${escapeHtml(status)}</span><div class="finding-copy"><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.note)}</p></div><span class="finding-number">${String(i+1).padStart(2,'0')}</span></div>`;}).join('')}</div>
    ${report.claims?.length?`<div class="report-claims"><strong>Klaim yang perlu ditinjau lebih lanjut</strong>${report.claims.map(x=>`<p>${escapeHtml(x.claim)} — ${escapeHtml(x.issue)}</p>`).join('')}</div>`:''}
    <div class="report-bottom"><h4>Langkah berikutnya</h4><ol>${(report.nextSteps||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol><p class="regulation-note">${escapeHtml(report.regulation)}<br>Rujukan registrasi: <a target="_blank" rel="noopener noreferrer" href="https://registrasipangan.pom.go.id/">Portal resmi BPOM ↗</a></p></div></div>`;
}
function workspaceHtml(s){
  const paid=s.paymentStatus==='paid';
  const pending=s.paymentStatus==='pending';
  const activeCount=s.report?.checks?.length||0;
  const detected=s.report?.checks?.filter(x=>x.status==='detected').length||0;
  const safeCheckout=pending&&typeof s.checkoutUrl==='string'&&/^https:\/\/app\.(sandbox\.)?midtrans\.com\//.test(s.checkoutUrl);
  const checkoutButton=safeCheckout?`<a class="btn btn-dark btn-slim" target="_blank" rel="noopener noreferrer" href="${escapeHtml(s.checkoutUrl)}">Lanjut bayar ↗</a>`:'';
  const retryButton=s.paymentStatus==='failed'?'<a class="btn btn-dark btn-slim" href="#apply">Buat pengajuan baru ↗</a>':'';
  const note=s.note?`<div class="work-info-note"><strong>Catatan dari tim Tera:</strong> ${escapeHtml(s.note)}</div>`:'';
  const steps=[{n:'01',label:'Pengajuan tercatat',desc:'Detail produk telah diterima.',done:true},{n:'02',label:'Pembayaran terverifikasi',desc:paid?'Pembayaran dikonfirmasi penyedia layanan.':pending?'Menunggu konfirmasi gateway.':'Pembayaran belum berhasil.',done:paid,current:pending},{n:'03',label:'Laporan awal tersedia',desc:paid?'Checklist siap ditinjau.':'Tersedia setelah pembayaran berhasil.',done:paid}];
  return `<div class="workspace-layout"><aside class="workspace-side"><div class="workspace-side-top"><strong>Ruang pengajuan</strong><small>Akses privat untuk pemilik tautan</small></div><nav class="workspace-nav" aria-label="Bagian dashboard"><button type="button" class="is-active" data-work-nav="overview"><span>◫</span> Ringkasan</button><button type="button" data-work-nav="result"><span>≡</span> Hasil pemeriksaan</button><button type="button" data-work-nav="payment"><span>↗</span> Pembayaran & akses</button><button type="button" data-work-home="true"><span>⌂</span> Kembali ke beranda</button></nav><div class="workspace-side-footer">Jangan bagikan tautan ini. Tera bukan badan penerbit izin edar.</div></aside>
  <div class="workspace-main"><div class="workspace-eyebrow"><span></span> DASHBOARD / PENGAJUAN ${escapeHtml(s.id)}</div><h1 class="workspace-heading">Halo, ini ruang<br><em>pengajuanmu.</em></h1><p class="workspace-summary">Pantau persiapan <strong>${escapeHtml(s.product)}</strong> dari <strong>${escapeHtml(s.company)}</strong> tanpa kehilangan jejak langkah berikutnya.</p>
    <div class="workspace-toolbar">${checkoutButton}<button type="button" id="refreshStatus" class="btn btn-outline btn-slim">Perbarui status ↻</button><button type="button" id="copyTracking" class="btn btn-outline btn-slim">Salin tautan privat ↗</button>${paid?'<button type="button" id="printReport" class="btn btn-outline btn-slim">Cetak laporan ↗</button>':''}</div>
    <div class="workspace-metrics"><div class="work-metric"><div class="metric-kicker">STATUS PEMBAYARAN</div><strong>${escapeHtml(paymentLabel[s.paymentStatus]||'Dalam proses')}</strong><small>Nomor: ${escapeHtml(s.id)}</small></div><div class="work-metric"><div class="metric-kicker">STATUS PEMERIKSAAN</div><strong>${escapeHtml(reviewLabel[s.reviewStatus]||'Dalam proses')}</strong><small>${paid?'Hasil berdasarkan pemeriksaan awal':'Laporan dikunci sampai pembayaran valid'}</small></div><div class="work-metric"><div class="metric-kicker">ASPEK PEMERIKSAAN</div><strong class="metric-bignum">${paid?`${detected}<span class="metric-denominator"> / ${activeCount}</span>`:'—'}</strong><small>${paid?'Aspek terdeteksi dari checklist':'Tersedia setelah pembayaran'}</small></div></div>
    <section class="work-section" id="work-overview"><div class="work-section-head"><h3>Perjalanan pengajuan</h3><span>TAHAPAN LAYANAN</span></div><div class="timeline">${steps.map(t=>`<div class="timeline-step ${t.done?'done':t.current?'current':''}"><div class="timeline-step-top"><span>${t.n}</span><span class="timeline-dot">${t.done?'✓':t.current?'•':''}</span></div><strong>${escapeHtml(t.label)}</strong><p>${escapeHtml(t.desc)}</p></div>`).join('')}</div>${note}<div class="work-info-note">Pengajuan dibuat ${escapeHtml(niceDate(s.createdAt))}. Pemeriksaan Tera adalah layanan independen; hasil tidak berarti suatu produk sudah mendapatkan persetujuan BPOM.</div></section>
    <section class="work-section" id="work-result"><div class="work-section-head"><h3>Hasil pemeriksaan</h3><span>${paid?`${activeCount} ASPEK DITINJAU`:'TERKUNCI'}</span></div>${paid?resultHtml(s.report):`<div class="empty-report"><span class="empty-report-icon">✳</span><h4>Hasilmu belum tersedia.</h4><p>${pending?'Pembayaran masih menunggu verifikasi dari penyedia pembayaran. Begitu terkonfirmasi, checklist akan tersedia di halaman ini.':'Laporan tetap terkunci karena pembayaran belum terverifikasi. Lihat informasi pembayaran di bagian bawah.'}</p>${(checkoutButton||retryButton)?`<div class="report-payment-action">${checkoutButton||retryButton}</div>`:''}</div>`}</section>
    <section class="work-section" id="work-payment"><div class="work-section-head"><h3>Pembayaran & akses</h3><span>DETAIL TRANSAKSI</span></div><div class="payment-box"><div><small>BIAYA LAYANAN / 1 PRODUK</small><strong>${money(s.amount)}</strong><p>${escapeHtml(paymentLabel[s.paymentStatus]||'Menunggu verifikasi')} · layanan awal independen, bukan tarif resmi BPOM.</p></div><div class="payment-cta">${checkoutButton||retryButton||'<span class="metric-kicker">TIDAK ADA PEMBAYARAN AKTIF</span>'}</div></div><p class="workspace-help">Simpan tautan pribadi pengajuan. Jika kehilangan akses, halaman ini tidak dapat dipulihkan melalui ID saja. Informasi resmi izin edar: <a href="https://registrasipangan.pom.go.id/" target="_blank" rel="noopener noreferrer">Direktorat Registrasi Pangan Olahan ↗</a>.</p></section>
  </div></div>`;
}
async function showStatus(id,token){
  const root=$('trackCard'); root.innerHTML='<div class="empty-report"><h4>Memuat ruang pengajuan…</h4><p>Sistem sedang memeriksa akses privat dan status terbaru.</p></div>';
  try{
    const s=await api(`/api/public/applications/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`}});
    root.innerHTML=workspaceHtml(s);
    $('refreshStatus').addEventListener('click',()=>showStatus(id,token));
    $('copyTracking').addEventListener('click',async()=>{
      const button=$('copyTracking');const url=window.location.href;
      try{await navigator.clipboard.writeText(url);button.textContent='Tautan tersalin ✓';}
      catch{button.textContent='Salin dari bilah alamat';}
    });
    $('printReport')?.addEventListener('click',()=>window.print());
    for(const nav of root.querySelectorAll('[data-work-nav]')){
      nav.addEventListener('click',()=>{
        const mapping={overview:'work-overview',result:'work-result',payment:'work-payment'};
        for(const n of root.querySelectorAll('[data-work-nav]'))n.classList.toggle('is-active',n===nav);
        document.getElementById(mapping[nav.dataset.workNav])?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
      });
    }
    root.querySelector('[data-work-home]')?.addEventListener('click',()=>{location.hash='home';});
  }catch(err){
    root.innerHTML=`<div class="empty-report"><span class="empty-report-icon">!</span><h4>Dashboard belum dapat dibuka.</h4><p>${escapeHtml(err.message)} Periksa tautan lengkapmu, atau coba beberapa saat lagi.</p><div class="report-payment-action"><a class="btn btn-outline" href="#track">Masukkan tautan lain ↗</a></div></div>`;
  }
}
loadConfig();route();
