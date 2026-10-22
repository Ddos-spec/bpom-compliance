import { runRules, ITEMS } from './rules.js';
import * as store from './store.js';
import * as api from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { filter: 'keputusan', q: '', sort: 'lama', ai: { ai: false } };
const STAGE = { keputusan: 'Perlu keputusan', perbaikan: 'Menunggu perbaikan', selesai: 'Selesai' };
const SEV = { perbaikan: 0, tinjau: 1, lengkap: 2 };
const fmtDate = (iso) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const check = (r) => runRules(r.label, { name: r.name, nie: r.nie });

let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- potongan kecil ---------- */
const ic = (d) => `<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const MARK = { ok: ic('<path d="M2.5 6.5l2.3 2.3 4.7-5"/>'), miss: ic('<path d="M6 2.5v4.2M6 9.2v.1"/>'), review: ic('<path d="M4.6 4.5a1.5 1.5 0 112.4 1.2c-.7.5-1 .8-1 1.5M6 9.4v.1"/>'), na: ic('<path d="M3 6h6"/>') };
const WORD = { ok: 'Ditemukan', miss: 'Tidak ditemukan', review: 'Perlu ditinjau', na: 'Tidak dinilai' };
const PILL = { ok: 'ok', miss: 'bad', review: 'warn', na: 'neutral' };
const vcls = (k) => (k === 'perbaikan' ? 'bad' : k === 'tinjau' ? 'warn' : 'ok');

function statusPill(r, res) {
  if (r.stage === 'selesai') return '<span class="pill ok">Selesai</span>';
  if (r.stage === 'perbaikan') return '<span class="pill neutral">Menunggu perbaikan</span>';
  if (!r.label.trim()) return '<span class="pill neutral">Teks belum dibaca</span>';
  return `<span class="pill ${vcls(res.verdict.key)}">${esc(res.verdict.text)}</span>`;
}

function setNav(name, title) {
  $$('[data-nav]').forEach((a) => (a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#mbarTitle').textContent = title;
  document.title = `${title} · Tera`;
  document.body.classList.remove('menu-open');
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}

function skeleton() {
  view.innerHTML = '<div class="skel" aria-busy="true" aria-label="Memuat"><i style="width:40%"></i><i style="width:65%"></i><i style="height:120px"></i><i style="height:120px"></i></div>';
}

/* ---------- antrean ---------- */
function rowsFor() {
  const rows = store.records().map((r) => ({ r, res: check(r) }));
  const q = state.q.trim().toLowerCase();
  let shown = rows.filter(({ r }) => state.filter === 'semua' || r.stage === state.filter);
  if (q) shown = shown.filter(({ r }) => [r.name, r.owner, r.nie, r.id].join(' ').toLowerCase().includes(q));
  const old = (a, b) => a.r.checked.localeCompare(b.r.checked);
  shown.sort(state.sort === 'baru' ? (a, b) => -old(a, b)
    : state.sort === 'masalah' ? (a, b) => (SEV[a.res.verdict.key] - SEV[b.res.verdict.key]) || old(a, b) : old);
  return { rows, shown };
}

function listHtml(shown, total) {
  if (!total) return `<div class="empty"><p><b>Belum ada berkas.</b></p><p>Mulai dengan memeriksa label pertama.</p><a class="btn primary" href="#/baru">Periksa label baru</a></div>`;
  if (!shown.length) return `<div class="empty"><p><b>Tidak ada hasil.</b></p><p>${state.q ? `Tidak ada berkas yang cocok dengan “${esc(state.q)}” di tahap ini.` : 'Tidak ada berkas di tahap ini.'}</p>${state.filter !== 'semua' ? '<button class="btn" data-f="semua">Lihat semua berkas</button>' : ''}</div>`;
  return `<div role="list">${shown.map(({ r, res }) => `
    <a class="q-row" role="listitem" href="#/p/${esc(r.id)}">
      <div class="c-name"><span class="p-name">${esc(r.name)}</span><small class="mono">${esc(r.id)}</small></div>
      <div class="c-owner">${esc(r.owner)}<small class="mono">${esc(r.nie || '—')}</small></div>
      <div class="c-find q-find">${r.label.trim() ? esc(res.verdict.detail) : 'Teks label belum diisi'}</div>
      <div class="c-stat">${statusPill(r, res)}</div>
      <div class="q-date num">${fmtDate(r.checked)}</div>
    </a>`).join('')}</div>`;
}

function renderQueue() {
  const { rows, shown } = rowsFor();
  const cnt = { keputusan: 0, perbaikan: 0, selesai: 0 };
  rows.forEach(({ r }) => cnt[r.stage]++);
  const pending = rows.filter(({ r }) => r.stage === 'keputusan' && r.label.trim());
  const noHalal = pending.filter(({ res }) => res.items.find((i) => i.id === 'halal').status === 'miss').length;
  $('#navCount').textContent = cnt.keputusan || '';
  const sub = cnt.keputusan
    ? `<b>${cnt.keputusan} berkas menunggu keputusan</b>${noHalal ? `, ${noHalal} di antaranya tanpa keterangan halal` : ''}. Buka yang paling lama dulu.`
    : rows.length ? 'Tidak ada berkas yang menunggu keputusan.' : 'Belum ada berkas.';
  const card = (key, label, n) => `<button class="count" data-f="${key}" aria-pressed="${state.filter === key}"><span>${label}</span><b>${n}</b></button>`;

  view.innerHTML = `
    <div class="title-row">
      <div><h1>Antrean pemeriksaan</h1><p class="sub">${sub}</p></div>
      <div class="actions"><a class="btn primary" href="#/baru">Periksa label baru</a></div>
    </div>
    <div class="counts" role="group" aria-label="Filter berdasarkan tahap">
      ${card('keputusan', STAGE.keputusan, cnt.keputusan)}${card('perbaikan', STAGE.perbaikan, cnt.perbaikan)}${card('selesai', STAGE.selesai, cnt.selesai)}${card('semua', 'Semua berkas', rows.length)}
    </div>
    <div class="tools">
      <label class="search"><span class="sr">Cari berkas</span><input class="input" id="q" type="search" placeholder="Cari nama, usaha, atau nomor  ( / )" value="${esc(state.q)}" autocomplete="off"></label>
      <label class="sortl"><span class="sr">Urutkan</span><select class="input" id="sort">
        <option value="lama"${state.sort === 'lama' ? ' selected' : ''}>Terlama dulu</option>
        <option value="baru"${state.sort === 'baru' ? ' selected' : ''}>Terbaru dulu</option>
        <option value="masalah"${state.sort === 'masalah' ? ' selected' : ''}>Paling bermasalah dulu</option></select></label>
    </div>
    <div class="queue-head" aria-hidden="true"><span>Produk</span><span>Pelaku usaha</span><span>Temuan</span><span>Status</span><span style="text-align:right">Diperiksa</span></div>
    <div id="list" aria-live="polite">${listHtml(shown, rows.length)}</div>`;
  bindQueue();
  setNav('antrean', 'Antrean pemeriksaan');
}
function bindQueue() {
  $$('[data-f]', view).forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.f; renderQueue(); }));
  $('#q')?.addEventListener('input', (e) => { state.q = e.target.value; const { rows, shown } = rowsFor(); $('#list').innerHTML = listHtml(shown, rows.length); $$('[data-f]', $('#list')).forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.f; renderQueue(); })); });
  $('#sort')?.addEventListener('change', (e) => { state.sort = e.target.value; renderQueue(); });
}

/* ---------- detail ---------- */
function annotate(text, res) {
  const spans = [];
  (res.items || []).forEach((i) => {
    if (i.index !== null && i.evidence && (i.status === 'ok' || i.status === 'review')) {
      spans.push({ s: i.index, e: Math.min(text.length, i.index + i.evidence.length), id: i.id, kind: i.status === 'ok' ? 'ok' : 'warn' });
    }
  });
  (res.claims || []).forEach((c, k) => {
    const txt = c.teks || c.text || '';
    if (txt && Number.isInteger(c.index)) {
      spans.push({ s: c.index, e: Math.min(text.length, c.index + txt.length), id: `klaim${k}`, kind: 'warn' });
    }
  });
  spans.sort((a, b) => a.s - b.s);
  let out = '', pos = 0;
  for (const sp of spans) {
    if (sp.s < pos) continue;
    out += esc(text.slice(pos, sp.s)) + `<mark class="${sp.kind}" data-ref="${sp.id}">${esc(text.slice(sp.s, sp.e))}</mark>`;
    pos = sp.e;
  }
  return out + esc(text.slice(pos));
}

function nieHtml(r, res) {
  const it = res.items.find((i) => i.id === 'nie');
  const number = r.nie || (it.status === 'ok' ? it.evidence : '');
  const f = api.nieFormat(number);
  const fp = { sesuai: 'ok', salah: 'bad', kosong: 'neutral' }[f.state];
  return `<section class="panel" id="niePanel"><h2>Nomor izin edar</h2>
    <p class="cap">Dua pemeriksaan terpisah: format nomor, dan kecocokan dengan data BPOM.</p>
    <div class="kv"><span>Nomor</span><span class="mono">${esc(number || '—')}</span></div>
    <div class="kv"><span>Format</span><span><span class="pill ${fp}">${f.state === 'sesuai' ? 'Sesuai pola' : f.state === 'salah' ? 'Tidak sesuai' : 'Kosong'}</span> <span class="q-find">${esc(f.text)}</span></span></div>
    <div class="kv"><span>Data BPOM</span><span id="nieOut"><button class="btn" id="nieBtn"${number ? '' : ' disabled'}>Cek ke BPOM</button></span></div></section>`;
}

function renderDetail(id) {
  const r = store.byId(id);
  if (!r) { view.innerHTML = '<div class="empty"><p><b>Berkas tidak ditemukan.</b></p><a class="btn" href="#/">Kembali ke antrean</a></div>'; setNav('antrean', 'Berkas'); return; }
  const res = check(r);
  const ext = res.extracted || {};
  const empty = !r.label.trim();
  const needFix = !empty && res.verdict.key !== 'lengkap';

  const actions = r.stage === 'keputusan'
    ? `<button class="btn${needFix ? ' primary' : ''}" data-act="perbaikan">Minta perbaikan</button><button class="btn${needFix ? '' : ' primary'}" data-act="selesai">Setujui</button>`
    : r.stage === 'perbaikan' ? '<button class="btn primary" data-act="selesai">Tandai selesai</button>'
    : '<button class="btn" data-act="keputusan">Buka kembali</button>';

  const aiHtml = r.ai ? `
    <div class="ai-block"><h3>Tinjauan Tambahan AI External</h3>
      <p class="q-find" style="margin-bottom:6px">${esc(r.ai.ringkasan || '')}</p>
      ${(r.ai.temuan || []).map((t) => `<div class="ai-item"><span class="pill ${t.tingkat === 'masalah' ? 'bad' : 'warn'}">${t.tingkat === 'masalah' ? 'Masalah' : 'Tinjau'}</span> <b>${esc(t.judul)}</b>${t.kutipan ? `<q>${esc(t.kutipan)}</q>` : ''}<span class="q-find">${esc(t.penjelasan)}</span></div>`).join('') || '<p class="q-find">AI tidak menambah temuan.</p>'}
    </div>` : '';

  const msg = api.remedyMessage(r, res);
  const log = [...r.log].reverse();
  const ba = res.beritaAcara || {};

  view.innerHTML = `
    <div class="print-head"><b>Laporan Pengawasan Label Pangan</b><span>${esc(r.id)} · dicetak ${fmtTime(new Date().toISOString())}</span></div>
    <div class="crumb"><a href="#/">Antrean</a><span aria-hidden="true">/</span><span class="mono">${esc(r.id)}</span></div>
    <div class="title-row">
      <div><h1>${esc(r.name)}</h1><p class="sub">${esc(r.owner)} · diperiksa ${fmtDate(r.checked)} · ${esc(STAGE[r.stage])}</p></div>
      <div class="actions"><button class="btn" id="printBtn">Cetak Laporan / BA</button>${actions}</div>
    </div>

    <!-- Dual-AI Processing Pipeline Indicator -->
    <div class="pipeline-bar" role="region" aria-label="Alur Analisis Dual-AI">
      <div class="pipeline-step active">
        <span class="p-badge">1</span>
        <span><b>AI 1: Semantic Extractor</b> (Entitas Label Terurai)</span>
      </div>
      <span class="pipeline-arrow">➔</span>
      <div class="pipeline-step active">
        <span class="p-badge">2</span>
        <span><b>AI 2: Regulatory Auditor</b> (Audit PerBPOM & Berita Acara)</span>
      </div>
    </div>

    ${empty
      ? `<div class="verdict"><span class="v">Teks label belum dibaca</span><span class="d">Ketik atau tempel teks dari foto agar pemeriksaan bisa jalan.</span></div>`
      : `<div class="verdict"><span class="v ${vcls(res.verdict.key)}">${esc(res.verdict.text)}</span><span class="d">${esc(res.verdict.detail)}</span></div>`}
    
    <div class="split">
      <!-- Kolom Kiri: Hasil AI 1 (Input & Ekstraksi Entitas) -->
      <div class="col">
        ${r.image ? `<section class="panel"><h2>Foto Fisik Label</h2><button class="photo" id="photoBtn" aria-label="Perbesar foto label"><img alt="Foto label ${esc(r.name)}" src="${r.image}"></button></section>` : ''}
        
        <section class="panel">
          <div class="tab-row" role="tablist">
            <button class="tab-btn" id="tabAnatomy" role="tab" aria-selected="true">Anatomi Entitas (AI 1)</button>
            <button class="tab-btn" id="tabRaw" role="tab" aria-selected="false">Teks Mentah & Bukti</button>
          </div>

          <!-- Tab Content 1: Anatomi Terstruktur (Hasil AI 1) -->
          <div id="contentAnatomy" class="entity-grid">
            <div class="entity-card">
              <h3><span>Bahan Baku & Komposisi</span><small class="mono">${ext.komposisi?.length || 0} bahan</small></h3>
              <div class="entity-pills">
                ${(ext.komposisi || []).map(b => `<span class="entity-pill">${esc(b)}</span>`).join('') || '<span class="q-find">Tidak terdeteksi</span>'}
              </div>
              ${ext.alergen_terdeteksi?.length ? `<div style="margin-top:8px"><small style="font-weight:600;color:#92400e">⚠️ Alergen Wajib Cetak Tebal:</small> <div class="entity-pills" style="margin-top:4px">${ext.alergen_terdeteksi.map(a => `<span class="entity-pill allergen">${esc(a)}</span>`).join('')}</div></div>` : ''}
              ${ext.btp_terdeteksi?.length ? `<div style="margin-top:8px"><small style="font-weight:600;color:#1e40af">🧪 BTP Terdeteksi:</small> <div class="entity-pills" style="margin-top:4px">${ext.btp_terdeteksi.map(b => `<span class="entity-pill btp">${esc(b)}</span>`).join('')}</div></div>` : ''}
            </div>

            <div class="entity-card">
              <h3><span>Kuantitas & Legalitas</span></h3>
              <div class="kv" style="padding:4px 0"><span>Berat Bersih</span><span class="mono">${ext.berat_bersih?.nilai ? `${ext.berat_bersih.nilai} ${ext.berat_bersih.satuan}` : '<span class="pill bad">Tidak ada</span>'}</span></div>
              <div class="kv" style="padding:4px 0"><span>Izin Edar</span><span class="mono">${ext.nie?.tipe ? `${ext.nie.tipe} ${ext.nie.nomor}` : '<span class="pill bad">Tidak ada</span>'}</span></div>
              <div class="kv" style="padding:4px 0"><span>Halal</span><span>${ext.halal?.tercantum ? '<span class="pill ok">Tercantum</span>' : '<span class="pill warn">Belum tercantum</span>'}</span></div>
              <div class="kv" style="padding:4px 0"><span>Kedaluwarsa</span><span class="mono">${esc(ext.kedaluwarsa || '—')}</span></div>
            </div>

            <div class="entity-card">
              <h3><span>Produsen & Lokasi</span></h3>
              <div class="kv" style="padding:4px 0"><span>Nama Usaha</span><b>${esc(ext.produsen?.nama || r.owner)}</b></div>
              <div class="kv" style="padding:4px 0"><span>Domisili</span><span>${esc(ext.produsen?.kota || 'Belum terdeteksi')}</span></div>
              <div class="kv" style="padding:4px 0"><span>Alamat Detail</span><small class="q-find">${esc(ext.produsen?.alamat || 'Tidak lengkap')}</small></div>
            </div>

            ${ext.klaim?.length ? `
            <div class="entity-card" style="border-color:#fca5a5">
              <h3 style="color:var(--negative)"><span>Klaim Pemasaran Terdeteksi</span></h3>
              ${ext.klaim.map(k => `
                <div class="claim-tag ${k.risiko === 'Kritis' ? 'kritis' : ''}">
                  <span class="pill ${k.risiko === 'Kritis' ? 'bad' : 'warn'}">${esc(k.risiko)}</span>
                  <div><b>${esc(k.jenis)}</b><br><q>${esc(k.teks)}</q></div>
                </div>`).join('')}
            </div>` : ''}
          </div>

          <!-- Tab Content 2: Teks Mentah -->
          <div id="contentRaw" style="display:none">
            <div class="ph" style="margin-bottom:8px"><h2>Teks Label Mentah</h2><button class="btn sm" id="editBtn">${empty ? 'Isi teks' : 'Ubah teks'}</button></div>
            <p class="cap">Garis bawah menandai bukti yang dipakai. Klik untuk melompat ke temuannya.</p>
            <div id="labelBox">${empty ? '<p class="q-find">Belum ada teks.</p>' : `<div class="label-text" id="labelText">${annotate(r.label, res)}</div>`}</div>
          </div>
        </section>

        ${nieHtml(r, res)}

        <section class="panel"><h2>Catatan Petugas Pengawas</h2><p class="cap">Tersimpan otomatis saat selesai mengetik.</p>
          <textarea class="input note" id="note" rows="2" placeholder="Tulis catatan pengawasan untuk berkas ini">${esc(r.note)}</textarea></section>
        
        <section class="panel"><h2>Riwayat Audit</h2><ol class="log">${log.map((l) => `<li><time class="num">${fmtTime(l.t)}</time><span>${esc(l.text)}</span></li>`).join('')}</ol></section>
      </div>

      <!-- Kolom Kanan: Hasil AI 2 (Audit Regulasi & Output Laporan) -->
      <div class="col">
        <section class="panel">
          <div class="tab-row" role="tablist">
            <button class="tab-btn" id="tabChecklist" role="tab" aria-selected="true">Checklist 9 Butir</button>
            <button class="tab-btn" id="tabBA" role="tab" aria-selected="false">Berita Acara Dinas</button>
            <button class="tab-btn" id="tabWA" role="tab" aria-selected="false">Draft Pesan WhatsApp</button>
          </div>

          <!-- Tab Content A: Checklist 9 Butir Wajib -->
          <div id="contentChecklist">
            <h2>Keterangan Wajib Label</h2>
            <p class="cap">9 butir, Peraturan BPOM No. 31 Tahun 2018 jo No. 20 Tahun 2021</p>
            ${empty ? '<p class="q-find">Belum diperiksa karena teks label kosong.</p>' : res.items.map((i) => `
              <div class="finding">
                <span class="st ${i.status}" aria-hidden="true">${MARK[i.status]}</span>
                <div><div class="t">${esc(i.label)}</div>
                  ${i.note ? `<div class="n">${esc(i.note)}</div>` : ''}
                  ${i.evidence && i.status !== 'miss' ? (i.index !== null ? `<button class="ev" data-ref="${i.id}">${esc(i.evidence)}</button>` : `<div class="ev plain">${esc(i.evidence)}</div>`) : ''}
                </div>
                <span class="pill ${PILL[i.status]}">${WORD[i.status]}</span>
              </div>`).join('')}
            ${aiHtml}
            <p class="note-box">Pemeriksaan dilakukan melalui Dual-AI Engine (Ekstraksi Semantik ➔ Audit Peraturan). Verifikasi naskah fisik tetap menjadi kewenangan penuh petugas pemeriksa.</p>
          </div>

          <!-- Tab Content B: Berita Acara Dinas Disperindag -->
          <div id="contentBA" style="display:none">
            <div class="ba-paper">
              <div class="ba-head">
                <div class="ba-instansi">${esc(ba.instansi || 'DINAS PERINDUSTRIAN DAN PERDAGANGAN')}</div>
                <div class="ba-subinstansi">${esc(ba.unit || 'Bidang Standardisasi & Pengawasan')}</div>
                <div class="ba-title">BERITA ACARA PENGAWASAN LABEL PANGAN OLAHAN</div>
                <div class="ba-nomor">Nomor: ${esc(ba.nomor || 'BA-WAS/2026/001')}</div>
              </div>
              <div class="ba-sec">
                <div class="ba-sec-title">1. Data Produk & Pelaku Usaha</div>
                <div>Nama Produk: <b>${esc(r.name)}</b></div>
                <div>Pelaku Usaha: <b>${esc(r.owner)}</b></div>
                <div>Tanggal Pengawasan: ${esc(ba.tanggal || '-')}</div>
              </div>
              <div class="ba-sec">
                <div class="ba-sec-title">2. Temuan Ketidaksesuaian (${(ba.temuan || []).length} Butir)</div>
                ${(ba.temuan || []).length ? (ba.temuan || []).map(t => `<li class="ba-item">${esc(t)}</li>`).join('') : '<div class="q-find">Tidak ditemukan pelanggaran pada keterangan wajib.</div>'}
                ${(ba.pelanggaran_klaim || []).length ? `<div style="margin-top:6px;color:var(--negative)"><b>Pelanggaran Klaim Pemasaran:</b></div>${ba.pelanggaran_klaim.map(k => `<li class="ba-item" style="color:var(--negative)">${esc(k)}</li>`).join('')}` : ''}
              </div>
              <div class="ba-sec">
                <div class="ba-sec-title">3. Dasar Hukum Pengawasan</div>
                ${(ba.dasar_hukum || []).map(d => `<li class="ba-item" style="color:var(--muted)">${esc(d)}</li>`).join('')}
              </div>
              <div class="ba-sec">
                <div class="ba-sec-title">4. Kesimpulan & Rekomendasi Petugas</div>
                <div class="ba-rekomendasi">${esc(ba.rekomendasi || '-')}</div>
              </div>
              <div class="ba-foot">
                <div>Petugas Pemeriksa Disperindag</div>
                <div>Tanda Tangan Pelaku Usaha</div>
              </div>
            </div>
          </div>

          <!-- Tab Content C: Pesan Edukasi WhatsApp -->
          <div id="contentWA" style="display:none">
            <h2>Pesan Edukasi Pelaku Usaha</h2>
            <p class="cap">Diformat agar jelas, santun, dan langsung dapat dikirim ke kontak WhatsApp pelaku UMKM.</p>
            <pre class="msg" id="msgText">${esc(msg)}</pre>
            <div class="actions" style="margin-top:12px">
              <button class="btn primary" id="copyBtn">Salin Pesan WhatsApp</button>
              <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Buka di WhatsApp Web</a>
            </div>
          </div>
        </section>
      </div>
    </div>`;

  bindDetail(r, res);
  bindTabs();
  setNav('antrean', r.name);
}

function bindTabs() {
  const switchTab = (activeBtn, activeContent, allBtns, allContents) => {
    allBtns.forEach(b => b.setAttribute('aria-selected', 'false'));
    allContents.forEach(c => c.style.display = 'none');
    activeBtn.setAttribute('aria-selected', 'true');
    activeContent.style.display = 'grid';
  };

  // Tab Kiri: Anatomi vs Teks
  const tabAnatomy = $('#tabAnatomy');
  const tabRaw = $('#tabRaw');
  const contentAnatomy = $('#contentAnatomy');
  const contentRaw = $('#contentRaw');

  if (tabAnatomy && tabRaw) {
    tabAnatomy.addEventListener('click', () => switchTab(tabAnatomy, contentAnatomy, [tabAnatomy, tabRaw], [contentAnatomy, contentRaw]));
    tabRaw.addEventListener('click', () => {
      switchTab(tabRaw, contentRaw, [tabAnatomy, tabRaw], [contentAnatomy, contentRaw]);
      contentRaw.style.display = 'block';
    });
  }

  // Tab Kanan: Checklist vs BA vs WA
  const tabChecklist = $('#tabChecklist');
  const tabBA = $('#tabBA');
  const tabWA = $('#tabWA');
  const contentChecklist = $('#contentChecklist');
  const contentBA = $('#contentBA');
  const contentWA = $('#contentWA');

  if (tabChecklist && tabBA && tabWA) {
    tabChecklist.addEventListener('click', () => switchTab(tabChecklist, contentChecklist, [tabChecklist, tabBA, tabWA], [contentChecklist, contentBA, contentWA]));
    tabBA.addEventListener('click', () => {
      switchTab(tabBA, contentBA, [tabChecklist, tabBA, tabWA], [contentChecklist, contentBA, contentWA]);
      contentBA.style.display = 'block';
    });
    tabWA.addEventListener('click', () => {
      switchTab(tabWA, contentWA, [tabChecklist, tabBA, tabWA], [contentChecklist, contentBA, contentWA]);
      contentWA.style.display = 'block';
    });
  }
}

function bindDetail(r, res) {
  $$('[data-act]', view).forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'selesai' && res.verdict.key === 'perbaikan' && r.label.trim() && !confirm(`${res.miss} keterangan wajib masih tidak ditemukan. Tetap setujui?`)) return;
    const text = { perbaikan: 'Diminta perbaikan kepada pelaku usaha', selesai: 'Disetujui petugas', keputusan: 'Berkas dibuka kembali' }[act];
    if (!store.setStage(r.id, act, text)) toast('Penyimpanan penuh. Ekspor data lalu hapus berkas lama.');
    renderDetail(r.id); toast(text + '.');
  }));
  $('#printBtn').addEventListener('click', () => print());
  $('#note').addEventListener('change', (e) => { store.setNote(r.id, e.target.value); toast('Catatan disimpan.'); });
  $('#photoBtn')?.addEventListener('click', () => { $('#dlgImg').src = r.image; $('#imgDlg').showModal(); });
  $('#copyBtn')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#msgText').textContent); toast('Pesan disalin.'); }
    catch { const rg = document.createRange(); rg.selectNodeContents($('#msgText')); getSelection().removeAllRanges(); getSelection().addRange(rg); toast('Pilih lalu salin manual (Ctrl+C).'); }
  });
  $('#editBtn').addEventListener('click', () => {
    $('#labelBox').innerHTML = `<textarea class="input" id="labelEdit" aria-label="Teks label">${esc(r.label)}</textarea>
      <div class="actions" style="margin-top:8px"><button class="btn primary" id="saveLabel">Simpan dan periksa ulang</button><button class="btn" id="cancelLabel">Batal</button></div>`;
    $('#editBtn').hidden = true; $('#labelEdit').focus();
    $('#cancelLabel').addEventListener('click', () => renderDetail(r.id));
    $('#saveLabel').addEventListener('click', () => { store.setLabel(r.id, $('#labelEdit').value); renderDetail(r.id); toast('Teks disimpan, pemeriksaan diulang.'); });
  });
  $('#nieBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Mengecek…';
    const number = r.nie || res.items.find((i) => i.id === 'nie').evidence;
    const out = await api.lookupNie(number);
    $('#nieOut').innerHTML = !out.ok
      ? '<span class="q-find">Layanan cek BPOM belum tersambung. Cek manual di <a class="lnk" target="_blank" rel="noopener" href="https://cekbpom.pom.go.id">cekbpom.pom.go.id</a>.</span>'
      : out.found ? `<span class="pill ok">Ditemukan</span> <span class="q-find">${esc(out.product || '')} · ${esc(out.owner || '')}${out.valid_until ? ` · berlaku s.d. ${esc(out.valid_until)}` : ''}</span>`
      : '<span class="pill bad">Tidak ditemukan</span> <span class="q-find">Nomor tidak ada di data BPOM.</span>';
  });
  $$('[data-ref]', view).forEach((el) => el.addEventListener('click', () => {
    const ref = el.dataset.ref;
    // Otomatis buka tab teks mentah jika tertutup
    const tabRaw = $('#tabRaw');
    if (tabRaw && tabRaw.getAttribute('aria-selected') !== 'true') {
      tabRaw.click();
    }
    $$('#labelText mark').forEach((m) => m.classList.toggle('on', m.dataset.ref === ref));
    $(`#labelText mark[data-ref="${ref}"]`)?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }));
}

/* ---------- periksa baru ---------- */
const DEMO = `MIE KERING TELUR PUTIH\nKomposisi: tepung terigu, telur, garam, air.\nBerat bersih: 200 g\nDiproduksi oleh: UD Mie Sehat, Jl. Cempaka No. 8, Kec. Pamulang, Kota Tangerang Selatan\nKode produksi: MK-2210\nBaik digunakan sebelum: 22 Oktober 2027`;

function renderNew() {
  view.innerHTML = `
    <div class="title-row"><div><h1>Periksa label baru</h1><p class="sub">Tempel teks label dan, bila ada, lampirkan fotonya. Mesin aturan memeriksa 9 keterangan wajib${state.ai.ai ? '; AI ikut meninjau klaim dan hal yang lolos dari aturan' : '. AI belum aktif, jadi hanya mesin aturan yang jalan'}.</p></div></div>
    <form id="f" class="form-grid" novalidate>
      <div class="field"><label for="name">Nama produk</label><input class="input" id="name" required autocomplete="off" placeholder="mis. Keripik Singkong Balado"></div>
      <div class="field"><label for="owner">Pelaku usaha</label><input class="input" id="owner" autocomplete="off" placeholder="Nama usaha atau pemilik"></div>
      <div class="field"><label for="cat">Jenis produk</label><select class="input" id="cat"><option>Pangan olahan</option><option disabled>Kosmetik (segera)</option><option disabled>Obat tradisional (segera)</option></select></div>
      <div class="field"><label for="nie">Nomor izin edar</label><input class="input mono" id="nie" autocomplete="off" placeholder="MD 000000000000"><span class="hint" id="nieHint">Format diperiksa saat Anda mengetik.</span></div>
      <div class="field span2"><span class="lab">Foto label (opsional)</span>
        <div class="drop" id="drop"><label class="drop-in"><input type="file" id="img" accept="image/*" capture="environment"><span><b>Pilih atau ambil foto</b><small>JPG atau PNG. Diperkecil otomatis di perangkat.</small></span></label><div id="prev"></div></div>
        <span class="hint">${state.ai.ai ? 'AI membaca teks dari foto. Hasilnya tetap bisa Anda koreksi.' : 'Pembacaan teks dari foto butuh AI. Sementara itu foto disimpan sebagai lampiran, teksnya diketik manual.'}</span></div>
      <div class="field span2"><div class="ph" style="margin:0"><label for="text">Teks label</label><button class="btn sm" type="button" id="demo">Pakai contoh label</button></div>
        <textarea class="input" id="text" placeholder="Salin semua tulisan di kemasan: komposisi, berat bersih, produsen, kode produksi, tanggal kedaluwarsa, halal, nomor izin edar."></textarea></div>
      <div class="span2"><button class="btn primary" id="go" type="submit">Periksa label</button><p class="err" id="err" role="alert"></p></div>
    </form>`;
  let image = '';
  const prev = () => { $('#prev').innerHTML = image ? `<div class="thumb"><img alt="Pratinjau foto label" src="${image}"><button type="button" class="btn sm" id="rmImg">Hapus foto</button></div>` : ''; $('#rmImg')?.addEventListener('click', () => { image = ''; $('#img').value = ''; prev(); }); };
  const take = async (file) => {
    if (!file) return;
    try { image = await api.shrinkImage(file); prev(); $('#err').textContent = ''; } catch (e) { $('#err').textContent = e.message; }
  };
  $('#img').addEventListener('change', (e) => take(e.target.files[0]));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => take(e.dataTransfer.files[0]));
  $('#demo').addEventListener('click', () => { $('#text').value = DEMO; if (!$('#name').value) $('#name').value = 'Mie Kering Telur Putih'; if (!$('#owner').value) $('#owner').value = 'UD Mie Sehat'; });
  $('#nie').addEventListener('input', (e) => { const f = api.nieFormat(e.target.value); $('#nieHint').textContent = f.state === 'kosong' ? 'Format diperiksa saat Anda mengetik.' : f.text; $('#nieHint').style.color = f.state === 'salah' ? 'var(--negative)' : ''; });
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#name').value.trim(), labelText = $('#text').value.trim(), err = $('#err');
    err.textContent = '';
    if (!name) { err.textContent = 'Nama produk wajib diisi.'; $('#name').focus(); return; }
    if (!labelText && !image) { err.textContent = 'Tempel teks label atau lampirkan foto.'; $('#text').focus(); return; }
    const btn = $('#go'); btn.disabled = true; btn.textContent = state.ai.ai ? 'Memeriksa dengan aturan dan AI…' : 'Memeriksa…';
    const out = await api.analyze({ name, nie: $('#nie').value, labelText, imageDataUrl: state.ai.ai ? image : '' });
    const rec = { id: store.nextId(), name, owner: $('#owner').value.trim() || 'Belum diisi', checked: new Date().toISOString().slice(0, 10), stage: 'keputusan', nie: $('#nie').value.trim(), label: labelText, ai: out.ai || null };
    if (!store.addRecord(rec, image)) toast('Penyimpanan penuh, foto mungkin tidak tersimpan.');
    location.hash = `#/p/${rec.id}`;
    if (out.aiError) toast('AI gagal, hasil hanya dari mesin aturan.');
  });
  setNav('baru', 'Periksa label baru');
}

/* ---------- dasar aturan ---------- */
const HINT = {
  nama: ['Nama produk diisi pada form pemeriksaan.', 'Kosong atau hanya satu dua huruf.'],
  bahan: ['Ada kata “komposisi”, “daftar bahan”, atau “ingredients”.', 'Label hanya memuat nama dan berat.'],
  berat: ['Ada angka dengan satuan (g, kg, ml, l) setelah “berat bersih” atau “isi bersih”.', '“Isi bersih” tanpa angka atau satuan.'],
  produsen: ['Ada “diproduksi oleh” dan penanda alamat (jalan, kecamatan, kota).', 'Hanya nama usaha, tanpa alamat.'],
  halal: ['Ada kata halal, BPJPH, atau keterangan non-halal.', 'Tidak ada keterangan apa pun.'],
  produksi: ['Ada kode produksi, tanggal produksi, lot, atau batch.', 'Hanya tanggal kedaluwarsa yang tercantum.'],
  kedaluwarsa: ['Ada kedaluwarsa, “baik digunakan sebelum”, “best before”, atau exp.', 'Tidak ada batas waktu pakai.'],
  nie: ['Ada MD atau ML diikuti 9 sampai 15 angka. Hanya format, bukan keaslian.', 'Hanya P-IRT pada produk yang butuh MD.'],
  asal: ['Tidak dinilai otomatis. Ditandai bila ada kata babi, alkohol, atau etanol.', 'Bahan asal babi tanpa keterangan.'],
};
function renderRules() {
  view.innerHTML = `
    <div class="title-row"><div><h1>Dasar aturan</h1><p class="sub">Sembilan keterangan wajib pada label pangan olahan yang diperiksa mesin ini. Sumber: Peraturan BPOM 31/2018 Pasal 5 ayat (1), diubah dengan Peraturan BPOM 20/2021.</p></div></div>
    <div class="seg" role="tablist" aria-label="Jenis produk"><button role="tab" aria-selected="true">Pangan olahan</button><button role="tab" disabled>Kosmetik <i class="pill neutral">Segera</i></button><button role="tab" disabled>Obat tradisional <i class="pill neutral">Segera</i></button></div>
    <div>${ITEMS.map((i, k) => `<div class="rule-row"><span class="idx">${k + 1}</span><div><div class="t">${esc(i.label)}</div>
      <div class="n">Diperiksa: ${esc(HINT[i.id][0])}</div><div class="n">Tidak lolos bila: ${esc(HINT[i.id][1])}</div></div><span class="ref">${esc(i.pasal)}</span></div>`).join('')}</div>
    <p class="note-box">Nomor pasal dan daftar butir diambil dari hasil pencarian web, belum dicocokkan dengan naskah resmi. Verifikasi di pom.go.id sebelum dipakai sebagai dasar tindakan resmi. Klaim pada label (gizi, kesehatan) belum punya aturan deterministik dan ditandai untuk ditinjau manusia.</p>`;
  setNav('aturan', 'Dasar aturan');
}

/* ---------- pengaturan ---------- */
function renderSettings() {
  const n = store.records().length;
  view.innerHTML = `
    <div class="title-row"><div><h1>Pengaturan</h1><p class="sub">Status layanan dan pengelolaan data. Data disimpan di peramban ini sampai backend tersambung.</p></div></div>
    <section class="panel"><h2>Layanan</h2>
      <div class="kv"><span>Mesin aturan</span><span><span class="pill ok">Aktif</span> <span class="q-find">berjalan di peramban dan server</span></span></div>
      <div class="kv"><span>AI (OpenRouter)</span><span>${state.ai.ai ? `<span class="pill ok">Aktif</span> <span class="q-find mono">${esc(state.ai.model)}</span>` : `<span class="pill neutral">Belum aktif</span> <span class="q-find">${state.ai.offline ? 'server tidak terjangkau' : 'isi OPENROUTER_API_KEY dan OPENROUTER_MODEL di .env'}</span>`}</span></div>
      <div class="kv"><span>Cek nomor izin edar</span><span><span class="pill neutral">Belum tersambung</span> <span class="q-find">hanya format yang diperiksa</span></span></div></section>
    <section class="panel" style="margin-top:16px"><h2>Data</h2>
      <div class="kv"><span>Isi</span><span>${n} berkas · ${store.usage()} KB di peramban</span></div>
      <div class="actions" style="margin-top:12px"><button class="btn" id="exp">Ekspor JSON</button><label class="btn" for="imp">Impor JSON</label><input type="file" id="imp" accept="application/json" hidden><button class="btn danger" id="rst">Hapus data buatan sendiri</button></div>
      <p class="cap" style="margin:12px 0 0">Hapus hanya menghilangkan berkas yang Anda buat, catatan, dan perubahan status. Data contoh kembali ke kondisi awal.</p></section>`;
  $('#exp').addEventListener('click', () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' }));
    a.download = `tera-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); toast('Data diekspor.');
  });
  $('#imp').addEventListener('change', async (e) => {
    try { store.importJson(await e.target.files[0].text()); toast('Data diimpor.'); renderSettings(); } catch (ex) { toast(ex.message); }
  });
  $('#rst').addEventListener('click', () => { if (confirm('Hapus semua berkas buatan sendiri, catatan, dan perubahan status?')) { store.resetAll(); toast('Data dihapus.'); renderSettings(); } });
  setNav('setelan', 'Pengaturan');
}

/* ---------- router ---------- */
function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  if (h.startsWith('/p/')) renderDetail(decodeURIComponent(h.slice(3)));
  else if (h === '/baru') renderNew();
  else if (h === '/aturan') renderRules();
  else if (h === '/setelan') renderSettings();
  else renderQueue();
  $('#navCount').textContent = store.records().filter((r) => r.stage === 'keputusan').length || '';
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
const closeMenu = () => { document.body.classList.remove('menu-open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); };
$('#menuBtn').addEventListener('click', () => { const o = document.body.classList.toggle('menu-open'); $('#menuBtn').setAttribute('aria-expanded', String(o)); });
$('#scrim').addEventListener('click', closeMenu);
$('#imgDlg').addEventListener('click', (e) => { if (e.target.id === 'imgDlg' || e.target.id === 'dlgClose') $('#imgDlg').close(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#q')) { e.preventDefault(); $('#q').focus(); }
});

skeleton();
api.status().then((s) => {
  state.ai = s;
  $('#aiState').innerHTML = s.ai ? `<b>AI aktif</b><br>${esc(s.model)}` : `<b>Mode aturan saja</b><br>${s.offline ? 'Server tidak terjangkau' : 'AI belum dikonfigurasi'}`;
  route();
});
