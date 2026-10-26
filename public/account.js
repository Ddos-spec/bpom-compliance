/** Tera V5 customer hub. No synthetic data, no stored access tokens. */
'use strict';
const $=id=>document.getElementById(id);
const state={email:'',apps:[],section:'overview',filter:'all',query:'',loginEnabled:false,imageObjectUrl:''};
const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=x=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(x)||0);
const date=x=>{const d=new Date(x);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});};
const statusText={paid:'Lunas',pending:'Menunggu pembayaran',failed:'Gagal / kedaluwarsa',refunded:'Dikembalikan'};
const reviewText={awaiting_payment:'Menunggu pembayaran',report_ready:'Laporan tersedia',in_review:'Ditinjau tim',revision_requested:'Butuh revisi',completed:'Selesai',on_hold:'Ditangguhkan'};
const nicePayment=s=>statusText[s]||'Dalam proses';
const safeId=id=>/^TR-[A-Z0-9-]+$/.test(id);
const checkoutAllowed=url=>typeof url==='string'&&/^https:\/\/(app\.)?(sandbox\.)?midtrans\.com\//.test(url);
async function request(url,{method='GET',body,headers={}}={}){
 const res=await fetch(url,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const payload=await res.json().catch(()=>({}));
 if(!res.ok||!payload.ok)throw Object.assign(new Error(payload.error||'Gagal memuat data. Periksa jaringan dan coba lagi.'),{status:res.status});
 return payload;
}
const row=(r)=>`<button type="button" class="product-row" data-open="${esc(r.id)}" aria-label="Buka ${esc(r.product)}"><span class="product-icon">${esc((r.product||'P').charAt(0).toUpperCase())}</span><span class="product-name"><strong>${esc(r.product)}</strong><small>${esc(r.id)} · ${esc(r.category||'Pangan olahan')} · ${esc(date(r.createdAt))}</small></span><span class="product-status"><span class="pill ${esc(r.paymentStatus)}">${esc(nicePayment(r.paymentStatus))}</span></span><span class="product-amount">${money(r.amount)}</span><span class="row-arrow">↗</span></button>`;
const empty=(title,desc)=>`<div class="empty"><strong>${esc(title)}</strong><p>${esc(desc)}</p><a href="/#apply">Buat pengajuan produk ↗</a></div>`;
const go=(which)=>{if(!['overview','products','payments','guide','detail'].includes(which))which='overview';state.section=which;for(const t of ['overview','products','payments','guide','detail'])$(t+'Section').hidden=t!==which;document.querySelectorAll('[data-section]').forEach(b=>{const active=b.dataset.section===which;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});window.scrollTo({top:0,behavior:'instant'});};
function rowsVisible(){const q=state.query.toLowerCase();return state.apps.filter(r=>(state.filter==='all'||r.paymentStatus===state.filter)&&(r.product.toLowerCase().includes(q)||r.id.toLowerCase().includes(q)));}
function render(){const apps=state.apps,paid=apps.filter(r=>r.paymentStatus==='paid').length,pending=apps.filter(r=>r.paymentStatus==='pending').length;
 $('metricTotal').textContent=apps.length;$('metricReady').textContent=paid;$('metricPending').textContent=pending;
 $('latestProducts').innerHTML=apps.length?apps.slice(0,4).map(row).join(''):empty('Belum ada pengajuan','Produk pertamamu akan muncul di sini setelah formulir dan checkout Midtrans dibuat.');
 const list=rowsVisible();$('allProducts').innerHTML=list.length?list.map(row).join(''):empty('Belum ada hasil',state.apps.length?'Coba hapus filter atau kata pencarian.':'Mulai dari satu produk untuk membangun riwayat pemeriksaan.');
 $('paymentRows').innerHTML=apps.length?apps.map(r=>`<tr><td><strong>${esc(r.product)}</strong><small>${esc(r.id)}</small></td><td>${esc(date(r.createdAt))}</td><td>${money(r.amount)}</td><td><span class="pill ${esc(r.paymentStatus)}">${esc(nicePayment(r.paymentStatus))}</span></td><td><button type="button" data-open="${esc(r.id)}">Detail ↗</button></td></tr>`).join(''):'<tr><td colspan="5">Belum ada transaksi produk.</td></tr>';
}
async function loadData(){const result=await request('/api/account/applications');state.apps=result.data||[];render();}
function showLogin(message='',error=false){$('loginView').hidden=false;$('appView').hidden=true;state.email='';$('loginFeedback').textContent=message;$('loginFeedback').classList.toggle('error',error);}
async function showApp(email){state.email=email;$('loginView').hidden=true;$('appView').hidden=false;$('accountEmail').textContent=email;$('avatar').textContent=email.charAt(0).toUpperCase();await loadData();go('overview');}
function reportHtml(report){if(!report?.checks?.length)return '<div class="detail-note">Checklist belum tersedia. Pilih perbarui status bila pembayaran baru selesai.</div>';
 return `<div class="findings">${report.checks.map(c=>`<div class="finding"><div class="finding-head"><strong>${esc(c.label)}</strong><span class="pill ${c.status==='detected'?'paid':c.status==='review'?'pending':''}">${esc(({detected:'Teridentifikasi',review:'Perlu ditinjau',info:'Informasi',conditional:'Bersyarat'})[c.status]||'Tinjau')}</span></div><p>${esc(c.note)}</p></div>`).join('')}</div>${report.nextSteps?.length?`<h3 class="report-subtitle">Langkah selanjutnya</h3><ol class="instructions">${report.nextSteps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}<p class="detail-note">${esc(report.disclaimer||'Hasil ini bukan persetujuan BPOM.')}</p>`;}
async function openDetail(id){if(!safeId(id))return;go('detail');$('detailContent').innerHTML='<div class="loading">Memuat data pengajuan…</div>';try{const r=await request(`/api/account/applications/${encodeURIComponent(id)}`);
 const paid=r.paymentStatus==='paid';const stage=paid?(r.reviewStatus==='completed'?'completed':'ready'):'pending';
 const payLink=r.paymentStatus==='pending'&&checkoutAllowed(r.checkoutUrl)?`<a class="primary" href="${esc(r.checkoutUrl)}" target="_blank" rel="noopener noreferrer">Lanjut bayar Midtrans ↗</a>`:'';
 const image=r.imageAvailable?'<button data-action="show-image" type="button">Lihat foto label</button>':'';
 $('detailContent').innerHTML=`<div class="detail-head"><div><span class="intro-kicker">DETAIL PENGAJUAN / ${esc(r.id)}</span><h1>${esc(r.product)}</h1><p>${esc(r.company)} · ${esc(r.category||'Pangan olahan')} · ${esc(date(r.createdAt))}</p></div><div class="detail-cta">${payLink}<button data-action="refresh-detail" type="button">↻ Perbarui</button><button data-action="print" type="button">Cetak ringkasan</button>${image}</div></div>
 <div class="detail-grid"><div><div class="detail-panel"><div class="detail-label">PROGRES PENGAJUAN</div><div class="detail-progress"><div><span class="dot-step complete">✓</span><div><strong>Pengajuan diterima</strong><small>Detail produk disimpan</small></div></div><div><span class="dot-step ${paid?'complete':''}">${paid?'✓':'2'}</span><div><strong>Pembayaran Midtrans</strong><small>${esc(nicePayment(r.paymentStatus))}</small></div></div><div><span class="dot-step ${paid?'complete':''}">${paid?'✓':'3'}</span><div><strong>Laporan kesiapan label</strong><small>${esc(reviewText[r.reviewStatus]||'Menunggu pembayaran')}</small></div></div></div></div>
 <div class="detail-panel" class="mt-19"><div class="detail-label">CHECKLIST PER ASPEK</div><h2 class="mt-12">Hasil pemeriksaan</h2>${paid?reportHtml(r.report):`<div class="detail-note">Laporan tersedia setelah status transaksi terverifikasi oleh Midtrans. ${r.paymentStatus==='failed'?'Silakan buat pengajuan baru untuk mencoba kembali.':''}</div>`}</div>
 <div class="detail-panel preformatted" class="mt-19"><div class="detail-label">MATERI YANG DIAJUKAN</div><h2 class="mt-12">Teks label</h2><p>${esc(r.labelText||'Tidak tersedia')}</p></div></div>
 <div><div class="detail-panel"><div class="detail-label">RINCIAN PEMBAYARAN</div><h2 class="mt-12">Midtrans</h2><div class="kv"><span>Nomor order</span><strong>${esc(r.id)}</strong></div><div class="kv"><span>Biaya per produk</span><strong>${money(r.amount)}</strong></div><div class="kv"><span>Status transaksi</span><strong>${esc(nicePayment(r.paymentStatus))}</strong></div><div class="kv"><span>Pembaruan terakhir</span><strong>${esc(date(r.updatedAt))}</strong></div>${payLink?`<div class="mt-18"><a class="button primary" href="${esc(r.checkoutUrl)}" target="_blank" rel="noopener noreferrer">Lanjut bayar ↗</a></div>`:''}<div class="detail-note">Metode pembayaran mengikuti aktivasi merchant Midtrans. Tera tidak menyimpan informasi kartu.</div></div><div class="detail-panel" class="mt-19"><div class="detail-label">TINDAK LANJUT</div><h2 class="mt-12">Informasi untukmu</h2><p class="small-copy">${esc(r.note||'Belum ada catatan tambahan dari tim Tera.')}</p></div><div id="detailImagePanel" class="detail-panel" class="mt-19" hidden><h2>Foto kemasan</h2><img class="detail-image" id="detailImage" alt="Foto label produk yang diunggah"></div></div></div>`;
 $('detailContent').querySelector('[data-action="refresh-detail"]').addEventListener('click',()=>openDetail(id));
 $('detailContent').querySelector('[data-action="print"]').addEventListener('click',()=>window.print());
 $('detailContent').querySelector('[data-action="show-image"]')?.addEventListener('click',async()=>{
  const panel=$('detailImagePanel');panel.hidden=false;panel.scrollIntoView({behavior:'smooth'});if(state.imageObjectUrl)URL.revokeObjectURL(state.imageObjectUrl);
  try{const res=await fetch(`/api/account/applications/${encodeURIComponent(id)}/image`,{credentials:'same-origin',cache:'no-store'});if(!res.ok)throw Error('Lampiran tidak tersedia.');const blob=await res.blob();state.imageObjectUrl=URL.createObjectURL(blob);$('detailImage').src=state.imageObjectUrl;}
  catch(e){panel.textContent=e.message;}
 });
 }catch(e){if(e.status===401){showLogin('Sesi berakhir. Minta tautan masuk kembali.',true);return;}$('detailContent').innerHTML=`<div class="error-message">${esc(e.message)}</div><button class="back-button" data-back>← Kembali ke daftar</button>`;$('detailContent').querySelector('[data-back]').addEventListener('click',()=>go('products'));}}
async function boot(){ $('year').textContent=new Date().getFullYear();$('today').textContent=new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
 try{const conf=await request('/api/account/config');state.loginEnabled=conf.loginEnabled;if(!conf.loginEnabled)showLogin('Login pelanggan membutuhkan konfigurasi email di server (Resend + domain HTTPS).');}catch{showLogin('Server tidak dapat dihubungi. Periksa koneksi.',true);return;}
 const match=/^#verify\/([A-Za-z0-9_-]{40,100})$/.exec(location.hash);
 if(match){history.replaceState(null,'',location.pathname);try{const data=await request('/api/account/login/redeem',{method:'POST',body:{token:match[1]}});await showApp(data.email);return;}catch(e){showLogin(e.message,true);return;}}
 try{const me=await request('/api/account/me');await showApp(me.email);}catch{showLogin();}
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.loginEnabled){$('loginFeedback').textContent='Akses email belum dikonfigurasi oleh pengelola.';return;}
 const email=$('loginEmail').value.trim().toLowerCase();const btn=$('loginButton');btn.disabled=true;btn.textContent='Mengirim tautan…';$('loginFeedback').textContent='';$('loginFeedback').classList.remove('error');
 try{const data=await request('/api/account/login/request',{method:'POST',body:{email}});$('loginFeedback').textContent=data.message;if(data.demoToken){const redeem=await request('/api/account/login/redeem',{method:'POST',body:{token:data.demoToken}});await showApp(redeem.email);}}
 catch(err){$('loginFeedback').textContent=err.message;$('loginFeedback').classList.add('error');}finally{btn.disabled=false;btn.innerHTML='Kirim tautan masuk <span>↗</span>';}
});
$('btnDemoLogin')?.addEventListener('click',async()=>{
 const btn=$('btnDemoLogin');btn.disabled=true;btn.textContent='Menyiapkan akun demo…';$('loginFeedback').textContent='';$('loginFeedback').classList.remove('error');
 try{
  const data=await request('/api/account/login/request',{method:'POST',body:{email:'demo@tera.id'}});
  if(data.demoToken){
   const redeem=await request('/api/account/login/redeem',{method:'POST',body:{token:data.demoToken}});
   await showApp(redeem.email);
  } else {
   $('loginFeedback').textContent=data.message;
  }
 }catch(err){$('loginFeedback').textContent=err.message;$('loginFeedback').classList.add('error');}finally{btn.disabled=false;btn.textContent='Masuk sebagai Demo (1-Klik) ↗';}
});
$('logoutBtn').addEventListener('click',async()=>{try{await request('/api/account/logout',{method:'POST'});}catch{}state.apps=[];showLogin('Kamu sudah keluar dari akun.');});
$('refreshBtn').addEventListener('click',async()=>{const btn=$('refreshBtn');btn.disabled=true;btn.textContent='Memuat…';try{await loadData();}catch(e){if(e.status===401)showLogin('Sesi berakhir. Masuk kembali.',true);else alert(e.message);}finally{btn.disabled=false;btn.textContent='↻ Perbarui data';}});
document.querySelectorAll('[data-section]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.section)));
document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.go)));
$('backToProducts').addEventListener('click',()=>go('products'));
$('searchProducts').addEventListener('input',e=>{state.query=e.target.value.trim();render();});
document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('chosen',b===btn));render();}));
document.addEventListener('click',e=>{const btn=e.target.closest('[data-open]');if(btn&&safeId(btn.dataset.open))openDetail(btn.dataset.open);});
window.addEventListener('beforeunload',()=>{if(state.imageObjectUrl)URL.revokeObjectURL(state.imageObjectUrl);});
boot();
