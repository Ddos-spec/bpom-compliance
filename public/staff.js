/** Tera operations console: ephemeral key only, never localStorage/sessionStorage. */
const $=id=>document.getElementById(id);
let adminKey='',rows=[],selectedId='',staffImageUrl='';
const x=(tag,value,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=String(value??'');return n;};
const request=async (path, options={})=>{
  const response=await fetch(path,{...options,cache:'no-store',headers:{Authorization:`Bearer ${adminKey}`,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));if(!response.ok||!payload.ok)throw new Error(payload.error||`HTTP ${response.status}`);return payload;
};
const formatDate=val=>{try{return new Date(val).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});}catch{return '—';}};
const statusLabel={paid:'Lunas',pending:'Menunggu',failed:'Gagal',refunded:'Refund'};
async function refresh(){const r=await request('/api/staff/applications');rows=r.data;render();$('lastUpdated').textContent=`Diperbarui ${new Date().toLocaleString('id-ID')} · 100 pengajuan terbaru (maks.)`;}
function render(){const f=$('filter').value,q=$('search').value.toLowerCase().trim();const matched=rows.filter(r=>(!f||r.payment_status===f)&&(`${r.product} ${r.company} ${r.id}`).toLowerCase().includes(q));
  $('total').textContent=rows.length;$('paid').textContent=rows.filter(r=>r.payment_status==='paid').length;$('pending').textContent=rows.filter(r=>r.payment_status==='pending').length;$('inReview').textContent=rows.filter(r=>['in_review','revision_requested'].includes(r.review_status)).length;
  const tbody=$('applicationRows');tbody.replaceChildren();$('tableEmpty').hidden=matched.length!==0;
  for(const r of matched){const tr=document.createElement('tr');const product=document.createElement('td');product.append(x('strong',r.product),x('small',r.id,'cell-id'));
    const company=document.createElement('td');company.append(x('strong',r.company),x('small',r.contact));
    const payment=document.createElement('td');payment.append(x('span',statusLabel[r.payment_status]||r.payment_status,`status ${r.payment_status}`),x('small',formatDate(r.created_at)));
    const review=x('td',r.review_status.replaceAll('_',' '));const action=document.createElement('td');const btn=x('button','Buka ↗');btn.type='button';btn.addEventListener('click',()=>detail(r.id));action.append(btn);tr.append(product,company,payment,review,action);tbody.append(tr);}
}

function renderRevisions(revisions, id){
  const area=$('staffRevisions');area.replaceChildren();
  if(!revisions.length){area.append(x('p','Belum ada revisi pelanggan.'));return;}
  for(const rev of revisions){
    const card=x('article','','v6-staff-revision');
    card.append(x('strong',`Revisi #${rev.id} / ${rev.status}`),x('small',formatDate(rev.createdAt)),x('p',rev.note||'Tanpa pesan tambahan.'));
    const contents=x('pre',rev.proposedText,'v6-revision-text');card.append(contents);
    if(rev.staffNote)card.append(x('p',`Keputusan: ${rev.staffNote}`));
    if(rev.status==='submitted'){
      const input=x('textarea','','v6-revision-note');input.placeholder='Catatan keputusan (wajib untuk penolakan)';input.maxLength=800;input.rows=3;
      card.append(input);
      for(const choice of [{v:'accept',label:'Terima revisi'},{v:'reject',label:'Kembalikan dengan catatan'}]){
        const b=x('button',choice.label,'ghost');b.type='button';b.addEventListener('click',async()=>{
          b.disabled=true;
          try{const data=await request(`/api/staff/applications/${encodeURIComponent(id)}/revisions/${rev.id}`,{method:'PATCH',body:JSON.stringify({decision:choice.v,note:input.value})});$('updateMessage').textContent=data.message;await refresh();await detail(id);}
          catch(e){$('updateMessage').textContent=e.message;b.disabled=false;}
        });card.append(b);
      }
    }
    area.append(card);
  }
}

async function detail(id){selectedId=id;$('detail').hidden=false;$('detail').scrollIntoView({block:'start',behavior:'smooth'});$('detailTitle').textContent='Memuat...';$('imageStatus').textContent='Memeriksa lampiran...';$('staffImage').hidden=true;
 try{const {data:r}=await request(`/api/staff/applications/${encodeURIComponent(id)}`);$('detailTitle').textContent=r.product;$('detailId').textContent=r.id;const dl=$('detailInfo');dl.replaceChildren();
  for(const [label,value] of [['Nama usaha',r.company],['Penanggung jawab',r.contact],['Email',r.email],['Nomor WA',r.phone],['Kategori',r.category],['Status pembayaran',r.payment_status],['Nomor izin edar (klaim)',r.nie||'Belum ada'],['Biaya',`Rp ${Number(r.amount).toLocaleString('id-ID')}`]])dl.append(x('dt',label),x('dd',value));
  renderRevisions(r.revisions||[],r.id);
  $('detailLabel').textContent=r.label_text;$('reviewStatus').value=r.review_status==='awaiting_payment'?'report_ready':r.review_status;$('staffNote').value=r.staff_note||'';$('updateForm').querySelector('button').disabled=r.payment_status!=='paid';$('updateMessage').textContent=r.payment_status!=='paid'?'Tindakan ditahan sampai pembayaran diverifikasi.':'';
  if(staffImageUrl){URL.revokeObjectURL(staffImageUrl);staffImageUrl='';}
  if(r.imageAvailable){const response=await fetch(`/api/staff/applications/${encodeURIComponent(id)}/image`,{headers:{Authorization:`Bearer ${adminKey}`},cache:'no-store'});if(response.ok){staffImageUrl=URL.createObjectURL(await response.blob());$('staffImage').src=staffImageUrl;$('staffImage').hidden=false;$('imageStatus').textContent='Lampiran privat (hanya staf Tera).';}else $('imageStatus').textContent='Lampiran tidak dapat dimuat.';}
  else $('imageStatus').textContent='Tidak ada foto label terlampir.';
 }catch(err){$('detailTitle').textContent='Tidak dapat membuka pengajuan';$('updateMessage').textContent=err.message;}
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const key=$('adminKey').value;adminKey=key;$('loginMessage').textContent='Memverifikasi…';try{await refresh();$('loginPanel').hidden=true;$('workspace').hidden=false;$('signout').hidden=false;$('adminKey').value='';}catch(err){adminKey='';$('loginMessage').textContent=err.message;}});
$('refresh').addEventListener('click',async()=>{try{await refresh();}catch(err){$('lastUpdated').textContent=err.message;}});
$('filter').addEventListener('change',render);$('search').addEventListener('input',render);
$('closeDetail').addEventListener('click',()=>{$('detail').hidden=true;selectedId='';});
$('signout').addEventListener('click',()=>{adminKey='';rows=[];selectedId='';if(staffImageUrl)URL.revokeObjectURL(staffImageUrl);staffImageUrl='';$('workspace').hidden=true;$('detail').hidden=true;$('loginPanel').hidden=false;$('signout').hidden=true;});
$('updateForm').addEventListener('submit',async e=>{e.preventDefault();if(!selectedId)return;const btn=$('updateForm').querySelector('button');btn.disabled=true;$('updateMessage').textContent='Menyimpan…';try{await request(`/api/staff/applications/${selectedId}`,{method:'PATCH',body:JSON.stringify({reviewStatus:$('reviewStatus').value,note:$('staffNote').value})});$('updateMessage').textContent='Perubahan tersimpan dan dapat dilihat pelanggan.';await refresh();}catch(err){$('updateMessage').textContent=err.message;}finally{btn.disabled=false;}});
