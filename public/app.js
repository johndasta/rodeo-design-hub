let state = {
  briefs: [],
  filter: 'needs',
  selected: null
};

function $(sel){ return document.querySelector(sel); }
function el(tag, cls){ const e=document.createElement(tag); if(cls) e.className=cls; return e; }

function fmt(ts){
  try { return new Date(ts).toLocaleString(); } catch { return ts || ''; }
}

async function api(path, opts={}){
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body
  });
  if(!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function applyFilter(briefs){
  const f = state.filter;
  if(f==='all') return briefs;
  if(f==='needs') return briefs.filter(b => b.needsAction);
  if(f==='review') return briefs.filter(b => b.status==='Needs Review');
  if(f==='changes') return briefs.filter(b => b.status==='Needs Changes');
  if(f==='approved') return briefs.filter(b => b.status==='Approved');
  if(f==='archived') return briefs.filter(b => b.status==='Archived');
  return briefs;
}

function renderList(){
  const list = $('#briefList');
  list.innerHTML='';

  const briefs = applyFilter(state.briefs);
  if(!briefs.length){
    const d = el('div','muted');
    d.style.padding='10px';
    d.textContent='No briefs in this view yet.';
    list.appendChild(d);
    return;
  }

  for(const b of briefs){
    const item = el('div','item');
    item.dataset.id = b.id;
    const t = el('div','t');
    t.textContent = b.title;
    const s = el('div','s');

    const p1 = el('div','pill');
    p1.textContent = b.project;
    const p2 = el('div','pill');
    p2.textContent = b.status;
    if(b.status==='Needs Review') p2.classList.add('needs');
    if(b.status==='Needs Changes') p2.classList.add('changes');
    if(b.status==='Approved') p2.classList.add('approved');

    const p3 = el('div','pill');
    p3.textContent = `${b.currentVersion || 'v1'} · ${b.reviewCount} reviews`;

    s.append(p1,p2,p3);
    item.append(t,s);
    item.addEventListener('click', ()=>selectBrief(b.id));
    list.appendChild(item);
  }
}

function renderChips(){
  document.querySelectorAll('.chip').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.filter===state.filter);
    btn.onclick = ()=>{ state.filter=btn.dataset.filter; renderChips(); renderList(); };
  });
}

function showDetail(on){
  $('#empty').classList.toggle('hidden', on);
  $('#detail').classList.toggle('hidden', !on);
}

function renderHistory(feedback){
  const host = $('#reviewHistory');
  host.innerHTML='';
  const reviews = (feedback.reviews||[]).slice().reverse();
  if(!reviews.length){
    host.innerHTML = '<div class="muted">No reviews yet.</div>';
    return;
  }
  for(const r of reviews){
    const box = el('div','review');
    const top = el('div','top');
    const who = el('div','who');
    who.textContent = `${r.author || 'John'} · ${r.version || ''} · ${fmt(r.at)}`;
    const dec = el('div','decision');
    dec.textContent = r.decision || 'Comment';
    top.append(who, dec);

    const c = el('div','comment');
    c.textContent = r.comment || '';
    box.append(top, c);
    host.appendChild(box);
  }
}

async function selectBrief(id){
  const out = await api(`/api/brief/${encodeURIComponent(id)}`);
  state.selected = out;

  const b = out.brief;
  showDetail(true);
  $('#detailProject').textContent = b.project || '';
  $('#detailTitle').textContent = b.title || '';

  $('#detailMeta').innerHTML='';
  const pStatus = el('div','pill'); pStatus.textContent = b.status;
  const pVer = el('div','pill'); pVer.textContent = `current: ${b.currentVersion || 'v1'}`;
  const pUpd = el('div','pill'); pUpd.textContent = `updated: ${fmt(b.updatedAt)}`;
  $('#detailMeta').append(pStatus,pVer,pUpd);

  // Render editorial page into the right pane (no iframe).
  const version = b.currentVersion || 'v1';

  // Prefer an explicit source HTML (legacy Projects/* brief) when provided.
  const sourceHtml = b.sourceHtml;
  const url = sourceHtml
    ? `/api/projects-brief/${sourceHtml}`
    : `/api/brief-site/${encodeURIComponent(b.id)}/${encodeURIComponent(version)}/index.html`;

  $('#openSite').href = url;

  async function loadPreview(){
    const res = await fetch(url, { cache: 'no-store' });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Strip scripts for safety.
    doc.querySelectorAll('script').forEach(s => s.remove());

    // Rebase relative asset URLs so images/CSS load correctly.
    const base = sourceHtml
      ? `/api/projects-brief/${sourceHtml.split('/').slice(0,-1).join('/')}/`
      : `/api/brief-site/${encodeURIComponent(b.id)}/${encodeURIComponent(version)}/`;

    const imgBase = sourceHtml
      ? base + 'assets/'
      : `/api/brief-site/${encodeURIComponent(b.id)}/images/`; // handles legacy ../images refs

    const reb = (v) => {
      if (!v) return v;
      if (v.startsWith('http:') || v.startsWith('https:') || v.startsWith('data:') || v.startsWith('#')) return v;
      if (v.startsWith('/')) return v;

      // Handle legacy relative paths like ../images/foo.png
      if (v.startsWith('../images/')) return imgBase + v.slice('../images/'.length);
      if (v.startsWith('./images/')) return imgBase + v.slice('./images/'.length);
      if (v.startsWith('images/')) return imgBase + v.slice('images/'.length);

      // Default: treat as relative to the site folder
      return base + v.replace(/^\.\//,'');
    };

    doc.querySelectorAll('img').forEach(img => img.setAttribute('src', reb(img.getAttribute('src'))));
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => l.setAttribute('href', reb(l.getAttribute('href'))));
    doc.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      if (href.toLowerCase().endsWith('.png') || href.toLowerCase().endsWith('.jpg') || href.toLowerCase().endsWith('.jpeg') || href.toLowerCase().endsWith('.webp')) {
        a.setAttribute('href', reb(href));
      }
    });

    const body = doc.body;
    const preview = $('#briefPreview');
    preview.innerHTML = '';
    // Wrap body content
    const wrapper = document.createElement('div');
    wrapper.append(...Array.from(body.childNodes));
    preview.appendChild(wrapper);
  }

  await loadPreview();
  $('#btnReload').onclick = ()=>loadPreview();

  $('#fromVersion').value = b.currentVersion || 'v1';
  $('#commentVersion').value = b.currentVersion || 'v1';

  renderHistory(out.feedback);

  // Wire actions
  $('#btnApprove').onclick = ()=>submitReview('Approved');
  $('#btnNeeds').onclick = ()=>submitReview('Needs Changes');
  $('#btnComment').onclick = ()=>submitComment();
  $('#btnRequest').onclick = ()=>submitRequest();
}

async function submitReview(decision){
  const b = state.selected?.brief;
  if(!b) return;
  const version = $('#commentVersion').value || b.currentVersion || 'v1';
  const comment = $('#comment').value || '';
  const updated = await api(`/api/brief/${encodeURIComponent(b.id)}/review`, {
    method: 'POST',
    body: { version, decision, comment }
  });
  state.selected = updated;
  $('#comment').value='';
  await refresh();
  await selectBrief(b.id);
}

async function submitComment(){
  const b = state.selected?.brief;
  if(!b) return;
  const version = $('#commentVersion').value || b.currentVersion || 'v1';
  const comment = $('#comment').value || '';
  if(!comment.trim()) return;
  const updated = await api(`/api/brief/${encodeURIComponent(b.id)}/review`, {
    method: 'POST',
    body: { version, decision: 'Comment', comment }
  });
  state.selected = updated;
  $('#comment').value='';
  await refresh();
  await selectBrief(b.id);
}

async function submitRequest(){
  const b = state.selected?.brief;
  if(!b) return;
  const fromVersion = $('#fromVersion').value || b.currentVersion || 'v1';
  const notes = $('#requestNotes').value || '';
  if(!notes.trim()) return;

  const updated = await api(`/api/brief/${encodeURIComponent(b.id)}/request`, {
    method: 'POST',
    body: { fromVersion, notes }
  });
  state.selected = updated;
  $('#requestNotes').value='';
  await refresh();
  await selectBrief(b.id);
}

async function refresh(){
  const out = await api('/api/briefs');
  $('#vault').textContent = out.vaultRoot;
  state.briefs = out.briefs;
  renderList();
}

async function boot(){
  renderChips();
  await refresh();
}

boot().catch(err=>{
  console.error(err);
  alert('Failed to load Rodeo Design Hub. See console.');
});
