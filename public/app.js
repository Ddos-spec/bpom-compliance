import { runRules, ITEMS } from './rules.js';
import { SAMPLE } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');

/* ---------- state ---------- */
const LS = 'tera.v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })();
const state = { stages: saved.stages || {}, added: saved.added || [], filter: 'keputusan', ai: { ai: false } };
const persist = () => localStorage.setItem(LS, JSON.stringify({ stages: state.stages, added: state.added }));
const records = () => [...state.added, ...SAMPLE].map((r) => ({ ...r, stage: state.stages[r.id] || r.stage }));
const byId = (id) => records().find((r) => r.id === id);
const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const STAGE = { keputusan: 'Perlu keputusan', perbaikan: 'Menunggu perbaikan', selesai: 'Selesai' };

/* ---------- pieces ---------- */
function statusPill(r, res) {
  if (r.stage === 'selesai') return '<span class="pill ok">Selesai</span>';
  if (r.stage === 'perbaikan') return '<span class="pill neutral">Menunggu perbaikan</span>';
  const cls = res.verdict.key === 'perbaikan' ? 'bad' : res.verdict.key === 'tinjau' ? 'warn' : 'ok';
  return `<span class="pill ${cls}">${esc(res.verdict.text)}</span>`;
}

function setNav(name, title) {
  document.querySelectorAll('[data-nav]').forEach((a) => { if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#mbarTitle').textContent = title;
  document.title = `${title} · Tera`;
  document.body.classList.remove('menu-open');
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}

/* ---------- queue ---------- */
function renderQueue() {
  const all = records();
  const rows = all.map((r) => ({ r, res: runRules(r.label, { name: r.name, nie: r.nie }) }));
  const cnt = { keputusan: 0, perbaikan: 0, selesai: 0 };
  rows.forEach(({ r }) => cnt[r.stage]++);
  const pending = rows.filter(({ r }) => r.stage === 'keputusan');
  const noHalal = pending.filter(({ res }) => res.items.find((i) => i.id === 'halal').status === 'miss').length;
  $('#navCount').textContent = cnt.keputusan || '';

  const sub = pending.length
    ? `<b>${pending.length} berkas menunggu keputusan</b>${noHalal ? `, ${noHalal} di antaranya tanpa keterangan halal` : ''}. Buka yang paling lama dulu.`
    : 'Tidak ada berkas yang menunggu keputusan.';

  const f = state.filter;
  const shown = rows.filter(({ r }) => f === 'semua' || r.stage === f).sort((a, b) => a.r.checked.localeCompare(b.r.checked));
  const card = (key, label, n) => `<button class="count" data-f="${key}" aria-pressed="${f === key}"><span>${label}</span><b>${n}</b></button>`;

  view.innerHTML = `
    <div class="title-row">
      <div><h1>Antrean pemeriksaan</h1><p class="sub">${sub}</p></div>
      <div class="actions"><a class="btn primary" href="#/baru">Periksa label baru</a></div>
    </div>
    <div class="counts" role="group" aria-label="Filter berdasarkan tahap">
      ${card('keputusan', STAGE.keputusan, cnt.keputusan)}${card('perbaikan', STAGE.perbaikan, cnt.perbaikan)}${card('selesai', STAGE.selesai, cnt.selesai)}${card('semua', 'Semua berkas', rows.length)}
    </div>
    <div class="queue-head" aria-hidden="true"><span>Produk</span><span>Pelaku usaha</span><span>Temuan</span><span>Status</span><span style="text-align:right">Diperiksa</span></div>
    <div role="list">
    ${shown.length ? shown.map(({ r, res }) => `
      <a class="q-row" role="listitem" href="#/p/${esc(r.id)}">
        <div class="c-name"><span class="p-name">${esc(r.name)}</span><small class="mono">${esc(r.id)}</small></div>
        <div class="c-owner">${esc(r.owner)}<small class="mono">${esc(r.nie || '—')}</small></div>
        <div class="c-find q-find">${esc(res.verdict.detail)}</div>
        <div class="c-stat">${statusPill(r, res)}</div>
        <div class="q-date num">${fmtDate(r.checked)}</div>
      </a>`).join('') : '<p class="empty">Tidak ada berkas di tahap ini.</p>'}
    </div>`;
  view.querySelectorAll('.count').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.f; renderQueue(); }));
  setNav('antrean', 'Antrean pemeriksaan');
}

/* ---------- detail ---------- */
function annotate(text, res) {
  const spans = [];
  res.items.forEach((i) => { if (i.index !== null && i.evidence && (i.status === 'ok' || i.status === 'review')) spans.push({ s: i.index, e: Math.min(text.length, i.index + i.evidence.length), id: i.id, kind: i.status === 'ok' ? 'ok' : 'warn' }); });
  res.claims.forEach((c, k) => spans.push({ s: c.index, e: c.index + c.text.length, id: `klaim${k}`, kind: 'warn' }));
  spans.sort((a, b) => a.s - b.s);
  let out = '', pos = 0;
  for (const sp of spans) {
    if (sp.s < pos) continue;
    out += esc(text.slice(pos, sp.s)) + `<mark class="${sp.kind}" data-ref="${sp.id}">${esc(text.slice(sp.s, sp.e))}</mark>`;
    pos = sp.e;
  }
  return out + esc(text.slice(pos));
}

const ic = (d) => `<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const MARK = { ok: ic('<path d="M2.5 6.5l2.3 2.3 4.7-5"/>'), miss: ic('<path d="M6 2.5v4.2M6 9.2v.1"/>'), review: ic('<path d="M4.6 4.5a1.5 1.5 0 112.4 1.2c-.7.5-1 .8-1 1.5M6 9.4v.1"/>'), na: ic('<path d="M3 6h6"/>') };
const WORD = { ok: 'Ditemukan', miss: 'Tidak ditemukan', review: 'Perlu ditinjau', na: 'Tidak dinilai' };

function renderDetail(id) {
  const r = byId(id);
  if (!r) { view.innerHTML = '<p class="empty">Berkas tidak ditemukan. <a href="#/"><u>Kembali ke antrean</u></a></p>'; setNav('antrean', 'Berkas'); return; }
  const res = runRules(r.label, { name: r.name, nie: r.nie });
  const vcls = res.verdict.key === 'perbaikan' ? 'bad' : res.verdict.key === 'tinjau' ? 'warn' : 'ok';

  const actions = r.stage === 'keputusan'
    ? `<button class="btn${res.verdict.key === 'lengkap' ? '' : ' primary'}" data-act="perbaikan">Minta perbaikan</button><button class="btn${res.verdict.key === 'lengkap' ? ' primary' : ''}" data-act="selesai">Setujui</button>`
    : r.stage === 'perbaikan' ? '<button class="btn primary" data-act="selesai">Tandai selesai</button>'
    : '<button class="btn" data-act="keputusan">Buka kembali</button>';

  const aiHtml = r.ai ? `
    <div class="ai-block"><h3>Tinjauan AI</h3>
      <p class="sub" style="margin-top:0">${esc(r.ai.ringkasan || '')}</p>
      ${(r.ai.temuan || []).map((t) => `<div class="ai-item"><span class="pill ${t.tingkat === 'masalah' ? 'bad' : 'warn'}">${t.tingkat === 'masalah' ? 'Masalah' : 'Tinjau'}</span> <b>${esc(t.judul)}</b>${t.kutipan ? `<q>${esc(t.kutipan)}</q>` : ''}<span class="q-find">${esc(t.penjelasan)}</span></div>`).join('') || '<p class="q-find">AI tidak menambah temuan.</p>'}
    </div>` : '';

  view.innerHTML = `
    <div class="crumb"><a href="#/">Antrean</a><span aria-hidden="true">/</span><span class="mono">${esc(r.id)}</span></div>
    <div class="title-row">
      <div><h1>${esc(r.name)}</h1><p class="sub">${esc(r.owner)} · diperiksa ${fmtDate(r.checked)} · ${esc(STAGE[r.stage])}</p></div>
      <div class="actions">${actions}</div>
    </div>
    <div class="verdict"><span class="v ${vcls}">${esc(res.verdict.text)}</span><span class="d">${esc(res.verdict.detail)}</span></div>
    <div class="split">
      <section class="panel"><h2>Teks label</h2><p class="cap">Garis bawah menandai bagian yang dipakai sebagai bukti. Klik untuk melompat ke temuannya.</p>
        <div class="label-text" id="labelText">${annotate(r.label, res)}</div></section>
      <section class="panel"><h2>Keterangan wajib</h2><p class="cap">9 butir, ${esc(res.items[0].pasal)} Peraturan BPOM 31/2018 (diubah 20/2021)</p>
        ${res.items.map((i) => `
          <div class="finding">
            <span class="st ${i.status}" aria-hidden="true">${MARK[i.status]}</span>
            <div><div class="t">${esc(i.label)} <span class="sr" style="position:absolute;left:-9999px">${WORD[i.status]}</span></div>
              ${i.note ? `<div class="n">${esc(i.note)}</div>` : ''}
              ${i.evidence && i.status !== 'miss' ? `<button class="ev" data-ref="${i.id}">${esc(i.evidence)}</button>` : ''}
            </div>
            <span class="pill ${i.status === 'ok' ? 'ok' : i.status === 'miss' ? 'bad' : i.status === 'review' ? 'warn' : 'neutral'}">${WORD[i.status]}</span>
          </div>`).join('')}
        ${res.claims.length ? `<div class="ai-block"><h3>Klaim pada label</h3>${res.claims.map((c, k) => `<div class="ai-item"><span class="pill warn">Tinjau</span> <button class="ev" data-ref="klaim${k}">${esc(c.text)}</button><div class="q-find">${esc(c.note)}</div></div>`).join('')}</div>` : ''}
        ${aiHtml}
        <p class="note-box">Ini pemeriksaan awal. Mesin aturan hanya mencari keberadaan keterangan di teks, bukan menilai kebenarannya, dan nomor izin hanya diperiksa formatnya, belum dicocokkan ke basis data BPOM. Keputusan akhir ada pada petugas.</p>
      </section>
    </div>`;

  view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { state.stages[r.id] = b.dataset.act; persist(); renderDetail(r.id); }));
  view.querySelectorAll('[data-ref]').forEach((el) => el.addEventListener('click', () => {
    const ref = el.dataset.ref;
    document.querySelectorAll('#labelText mark').forEach((m) => m.classList.toggle('on', m.dataset.ref === ref));
    const m = $(`#labelText mark[data-ref="${ref}"]`); if (m) m.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  setNav('antrean', r.name);
}

/* ---------- new check ---------- */
function renderNew() {
  view.innerHTML = `
    <div class="title-row"><div><h1>Periksa label baru</h1><p class="sub">Tempel teks label. Mesin aturan memeriksa 9 keterangan wajib${state.ai.ai ? '; AI ikut meninjau klaim dan hal yang tidak tertangkap aturan' : '. AI belum diaktifkan, jadi hanya mesin aturan yang jalan'}.</p></div></div>
    <form id="f" class="form-grid" novalidate>
      <div class="field"><label for="name">Nama produk</label><input class="input" id="name" required autocomplete="off" placeholder="mis. Keripik Singkong Balado"></div>
      <div class="field"><label for="owner">Pelaku usaha</label><input class="input" id="owner" autocomplete="off"></div>
      <div class="field"><label for="nie">Nomor izin edar</label><input class="input mono" id="nie" autocomplete="off" placeholder="MD 000000000000"><span class="hint">Hanya formatnya yang diperiksa. Belum terhubung ke basis data BPOM.</span></div>
      <div class="field"><span class="lab">Foto label (opsional)</span>
        <div class="drop"><input type="file" id="img" accept="image/*" aria-label="Foto label"><span class="hint">${state.ai.ai ? 'AI membaca teks dari foto.' : 'Perlu AI aktif untuk membaca foto.'}</span><div id="prev"></div></div></div>
      <div class="field span2"><label for="text">Teks label</label><textarea class="input" id="text" placeholder="Salin semua tulisan di kemasan, termasuk komposisi, berat bersih, produsen, kode produksi, dan tanggal kedaluwarsa."></textarea></div>
      <div class="span2"><button class="btn primary" id="go" type="submit">Periksa label</button><p class="err" id="err" role="alert"></p></div>
    </form>`;
  let imageDataUrl = '';
  $('#img').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) { imageDataUrl = ''; $('#prev').innerHTML = ''; return; }
    if (file.size > 4_000_000) { $('#err').textContent = 'Foto lebih dari 4 MB. Kecilkan dulu.'; e.target.value = ''; return; }
    const rd = new FileReader(); rd.onload = () => { imageDataUrl = rd.result; $('#prev').innerHTML = `<img alt="Pratinjau foto label" src="${imageDataUrl}">`; }; rd.readAsDataURL(file);
  });
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#name').value.trim(), labelText = $('#text').value.trim();
    const err = $('#err'); err.textContent = '';
    if (!name) { err.textContent = 'Nama produk wajib diisi.'; $('#name').focus(); return; }
    if (!labelText && !(imageDataUrl && state.ai.ai)) { err.textContent = imageDataUrl ? 'Foto hanya bisa dibaca bila AI aktif. Tempel teks label.' : 'Tempel teks label dulu.'; $('#text').focus(); return; }
    const btn = $('#go'); btn.disabled = true; btn.textContent = 'Memeriksa…';
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, nie: $('#nie').value, labelText, imageDataUrl }) });
      if (!res.ok) throw new Error('Server menolak permintaan.');
      const out = await res.json();
      const n = 420 + records().length + 1;
      const rec = { id: `P-0${n}`, name, owner: $('#owner').value.trim() || 'Belum diisi', checked: new Date().toISOString().slice(0, 10), stage: 'keputusan', nie: $('#nie').value.trim(), label: labelText, ai: out.ai || null };
      state.added.unshift(rec); persist();
      location.hash = `#/p/${rec.id}`;
    } catch (ex) {
      err.textContent = `Gagal memeriksa: ${ex.message}. Pastikan server jalan (node server.mjs).`;
      btn.disabled = false; btn.textContent = 'Periksa label';
    }
  });
  setNav('baru', 'Periksa label baru');
}

/* ---------- rules ---------- */
function renderRules() {
  view.innerHTML = `
    <div class="title-row"><div><h1>Dasar aturan</h1><p class="sub">Sembilan keterangan wajib pada label pangan olahan yang diperiksa mesin ini, sumber: Peraturan BPOM 31/2018 Pasal 5 ayat (1), diubah dengan Peraturan BPOM 20/2021.</p></div></div>
    <div>${ITEMS.map((i, k) => `<div class="rule-row"><span class="idx">${k + 1}</span><div><div class="t" style="font-weight:500">${esc(i.label)}</div></div><span class="finding ref" style="display:block;padding:0;border:0;font-size:12px;color:var(--faint)">${esc(i.pasal)}</span></div>`).join('')}</div>
    <p class="note-box">Nomor pasal dan daftar butir diambil dari hasil pencarian web, belum dicocokkan dengan naskah resmi. Verifikasi di pom.go.id sebelum dipakai sebagai dasar tindakan resmi. Klaim pada label (gizi, kesehatan) belum punya aturan deterministik dan ditandai untuk ditinjau manusia.</p>`;
  setNav('aturan', 'Dasar aturan');
}

/* ---------- router ---------- */
function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  if (h.startsWith('/p/')) renderDetail(decodeURIComponent(h.slice(3)));
  else if (h === '/baru') renderNew();
  else if (h === '/aturan') renderRules();
  else renderQueue();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
$('#menuBtn').addEventListener('click', () => { const o = document.body.classList.toggle('menu-open'); $('#menuBtn').setAttribute('aria-expanded', String(o)); });
$('#scrim').addEventListener('click', () => { document.body.classList.remove('menu-open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.body.classList.remove('menu-open'); });

fetch('/api/status').then((r) => r.json()).catch(() => ({ ai: false })).then((s) => {
  state.ai = s;
  $('#aiState').innerHTML = s.ai ? `<b>AI aktif</b><br>${esc(s.model)}` : '<b>Mode aturan saja</b><br>AI belum dikonfigurasi';
  route();
});
