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

  // Native Rodeo rendering (no embedded HTML).
  const content = out.content;
  if (!content) {
    $('#briefPreview').innerHTML = '<div class="muted" style="padding:16px">No content.json found for this brief yet.</div>';
    $('#btnReload').onclick = ()=>selectBrief(b.id);
    $('#openSite').href = '#';
    return;
  }

  $('#openSite').href = '#';
  $('#btnReload').onclick = ()=>selectBrief(b.id);

  function h(tag, cls, txt){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(txt!=null) e.textContent = txt;
    return e;
  }

  function renderGallery(items){
    const grid = h('div','rd-thumbgrid');
    items.forEach((it, idx)=>{
      const fig = h('figure','rd-thumb');
      const btn = h('button');
      btn.type = 'button';
      const img = document.createElement('img');
      img.alt = it.caption || it.title || `Concept ${idx+1}`;
      img.src = `/api/brief-site/${encodeURIComponent(b.id)}/images/${it.src.split('/').slice(-1)[0]}`;
      // If src is already relative (v1/images/...), try using it as-is via brief-site images mapping
      if (it.src.includes('/')) {
        const name = it.src.split('/').pop();
        img.src = `/api/brief-site/${encodeURIComponent(b.id)}/images/${name}`;
      }
      btn.appendChild(img);
      fig.appendChild(btn);
      const cap = h('figcaption', null);
      const strong = h('b', null, it.title || 'Concept');
      cap.appendChild(strong);
      cap.appendChild(document.createTextNode(it.caption ? ` — ${it.caption}` : ''));
      fig.appendChild(cap);
      grid.appendChild(fig);
    });
    return grid;
  }

  const preview = $('#briefPreview');
  preview.innerHTML = '';

  const doc = h('div','rd-doc');

  doc.appendChild(h('h1','rd-h1', content.hero?.title || b.title));
  if (content.hero?.dek) doc.appendChild(h('p','rd-dek', content.hero.dek));

  if (Array.isArray(content.hero?.pills) && content.hero.pills.length) {
    const meta = h('div','rd-meta');
    content.hero.pills.forEach(p=> meta.appendChild(h('div','rd-pill', p)));
    doc.appendChild(meta);
  }

  if (content.mustInclude) {
    const call = h('div','rd-callout');
    call.innerHTML = `<b>MUST INCLUDE</b><br/>Text: ${(content.mustInclude.text||[]).join(' + ')}<div class="rd-small">${content.mustInclude.notes||''}</div>`;
    doc.appendChild(call);
  }

  if (content.gallery?.items?.length) {
    doc.appendChild(h('h2','rd-h2', content.gallery.title || 'Gallery'));
    doc.appendChild(renderGallery(content.gallery.items));
  }

  if (content.shortlist) {
    doc.appendChild(h('h2','rd-h2', 'Shortlist'));
    const box = h('div','rd-card');
    box.innerHTML = `
      <div class="rd-row"><div class="rd-k">Recommend</div><div class="rd-v"><b>${content.shortlist.recommend||''}</b></div></div>
      <div class="rd-row"><div class="rd-k">Also strong</div><div class="rd-v">${content.shortlist.alsoStrong||''}</div></div>
      <div class="rd-row"><div class="rd-k">Wildcard</div><div class="rd-v">${content.shortlist.wildcard||''}</div></div>
    `;
    doc.appendChild(box);
  }

  if (Array.isArray(content.directions) && content.directions.length) {
    doc.appendChild(h('h2','rd-h2', 'Directions'));
    content.directions.forEach(d=>{
      const dir = h('div','rd-dir');
      dir.appendChild(h('h3','rd-h3', d.title || 'Direction'));
      if (d.tag) dir.appendChild(h('div','rd-tag', d.tag));
      const why = h('div','rd-why');
      const a = h('div','rd-box'); a.innerHTML = `<strong>Why it works</strong>${d.why||''}`;
      const b2 = h('div','rd-box'); b2.innerHTML = `<strong>Refine next</strong>${d.refine||''}`;
      why.append(a,b2);
      dir.appendChild(why);
      doc.appendChild(dir);
    });
  }

  if (Array.isArray(content.notes) && content.notes.length) {
    doc.appendChild(h('h2','rd-h2', 'Notes'));
    const ul = h('ul','rd-ul');
    content.notes.forEach(n=> ul.appendChild(h('li',null,n)));
    doc.appendChild(ul);
  }

  preview.appendChild(doc);

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
