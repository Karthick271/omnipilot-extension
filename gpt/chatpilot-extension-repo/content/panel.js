// content/panel.js (sanitized)

// ---------- settings ----------
const SETTINGS_KEY = 'chatpilot/settings';
const DEFAULT_SETTINGS = { dockRight: false, theme:'auto', panelWidth:380, fontSize:'normal', compact:false, launcher:true };

async function loadSettings(){
  const obj = await chrome.storage.local.get(SETTINGS_KEY);
  return Object.assign({}, DEFAULT_SETTINGS, obj[SETTINGS_KEY] || {});
}
async function saveSettings(s){
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}
function applySettings(s){
  const root = document.body; // .cp-scope
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = s.theme === 'auto' ? (prefersDark ? 'dark' : 'light') : s.theme;
  root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  root.style.setProperty('--panel-w', `${s.panelWidth || 380}px`);
  root.style.setProperty('--font-size', s.fontSize === 'small' ? '13px' : s.fontSize === 'large' ? '15px' : '14px');
  root.classList.toggle('compact', !!s.compact);
  window.top?.postMessage({ type:'CHATPILOT_APPLY_SETTINGS', settings: s }, '*');
}

// --- pins helpers ---
function cpHost(u){ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return ''; } }
function cpFmtTime(ts){ try{ return new Date(ts).toLocaleString(); }catch(e){ return String(ts); } }

// ---------- tiny utils ----------
const q = (sel) => document.querySelector(sel);
const key = (k) => `chatpilot/${k}`;

// ---------- storage ----------
async function loadTree() {
  const { [key('tree')]: tree = [] } = await chrome.storage.local.get(key('tree'));
  return tree;
}
async function saveTree(tree) { await chrome.storage.local.set({ [key('tree')]: tree }); }
async function loadPins() {
  const { [key('pins')]: pins = [] } = await chrome.storage.local.get(key('pins'));
  return pins.sort((a,b)=>b.ts-a.ts);
}

// ---------- ui helpers ----------

// ---- helper: lightweight context menu ----
function cpMakeMenu(btn, items){
  if (!btn) return;
  let menu = btn._cpMenu;
  if (!menu){
    menu = document.createElement('div');
    btn._cpMenu = menu;
    menu.className = 'cp-menu';
    menu.style.position = 'absolute';
    menu.style.top = '100%';
    menu.style.right = '0';
    menu.style.minWidth = '160px';
    menu.style.background = 'var(--cp-bg, #fff)';
    menu.style.border = '1px solid #ddd';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,.15)';
    menu.style.padding = '4px';
    menu.hidden = true;
    btn.style.position = 'relative';
    (btn.parentElement || btn).appendChild(menu);
  }
  menu.innerHTML = '';
  (items||[]).forEach(it => {
    const li = document.createElement('button');
    li.type = 'button';
    li.textContent = it.label;
    li.style.display = 'block';
    li.style.width = '100%';
    li.style.background = 'transparent';
    li.style.border = '0';
    li.style.padding = '8px 10px';
    li.style.textAlign = 'left';
    li.style.cursor = 'pointer';
    li.onmouseenter = () => li.style.background = 'rgba(0,0,0,.06)';
    li.onmouseleave = () => li.style.background = 'transparent';
    li.onclick = (e)=>{ e.stopPropagation(); menu.hidden = true; it.onClick && it.onClick(); };
    menu.appendChild(li);
  });
  // toggle handler (idempotent)
  btn.onclick = (e)=>{ e.stopPropagation(); menu.hidden = !menu.hidden; };
  // close on outside click
  document.addEventListener('click', ()=>{ menu.hidden = true; }, { once:true });
}

function cpShowToast(msg, ms=1500){
  const t = document.getElementById('cp-toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  setTimeout(()=>{ t.hidden = true; }, ms);
}


function cpCollectVariables(text){
  const vars = Array.from(text.matchAll(/\{\{([^}]+)\}\}/g)).map(m=>m[1].trim());
  const unique = Array.from(new Set(vars));
  if (!unique.length) return Promise.resolve({ text, values:{} });

  const modal = document.getElementById('cp-modal');
  const form = document.getElementById('cp-modal-form');
  const btnOk = document.getElementById('cp-modal-ok');
  const btnCancel = document.getElementById('cp-modal-cancel');
  const btnClose = document.getElementById('cp-modal-close');

  form.innerHTML = '';
  unique.forEach(v=>{
    const lab = document.createElement('label'); lab.textContent = v;
    const inp = document.createElement('input'); inp.name = v; inp.placeholder = v;
    form.append(lab, inp);
  });

  return new Promise((resolve)=>{
    function close(){ modal.hidden = true; btnOk.onclick = null; btnCancel.onclick = null; btnClose.onclick = null; }
    btnCancel.onclick = ()=>{ close(); resolve({ cancelled:true }); };
    btnClose.onclick = ()=>{ close(); resolve({ cancelled:true }); };
    btnOk.onclick = ()=>{
      const values = {}; unique.forEach(v=>{ values[v] = form.querySelector(`input[name="${v}"]`).value || ''; });
      const out = text.replace(/\{\{([^}]+)\}\}/g, (_,v)=> values[v.trim()] ?? '');
      close(); resolve({ text: out, values });
    };
    modal.hidden = false;
  });
}

// ---------- actions ----------
async function insertIntoChat(text) {
  const data = await cpCollectVariables(text);
  if (data.cancelled) return false;

  let settled = false;
  const fallbackTimer = setTimeout(() => {
    if (settled) return;
    try {
      window.top?.postMessage({ type: 'CHATPILOT_INSERT', text: data.text }, '*');
      cpShowToast('Inserted (fallback) ✅');
    } catch {
      cpShowToast('Insert failed ❌');
    }
    settled = true;
  }, 800);

  try {
    chrome.runtime.sendMessage({ type: 'INSERT_TEXT', text: data.text }, function(resp) {
      if (settled) return;
      clearTimeout(fallbackTimer);
      settled = true;
      if (chrome.runtime && chrome.runtime.lastError) {
        console.debug('insert lastError:', chrome.runtime.lastError.message || chrome.runtime.lastError);
        return;
      }
      const ok = resp && resp.ok;
      const via = resp && resp.via ? ` (${resp.via})` : '';
      const err = resp && resp.error;
      cpShowToast(ok ? ('Inserted into chat ✅' + via) : ('Insert failed ❌' + (err ? ' — ' + err : '')));
    });
  } catch (e) {
    console.debug('insert exception', e);
  }
  return true;
}

// ---------- pins modal ----------

// ---------- pins modal ----------
async function cpOpenPins(){
  const modal = document.getElementById('cp-pins-modal');
  const list = document.getElementById('cp-pins-list');
  const search = document.getElementById('cp-pins-search');
  const sortSel = document.getElementById('cp-pins-sort');
  const closeBtn = document.getElementById('cp-pins-close');
  const clearBtn = document.getElementById('cp-pins-clear');
  const exportBtn = document.getElementById('cp-pins-export');

  let pins = await loadPins();
  let qv = ''; let mode = 'new';

  function render(){
    list.innerHTML='';
    const terms = qv.toLowerCase();
    const rows = pins
      .filter(p => !qv || (p.text && p.text.toLowerCase().includes(terms)) || (p.title && p.title.toLowerCase().includes(terms)) || (p.url && p.url.toLowerCase().includes(terms)))
      .sort((a,b)=> mode==='fav' ? ((b.fav?1:0)-(a.fav?1:0) || b.ts-a.ts) : (b.ts-a.ts));

    rows.forEach(p => {
      const card = document.createElement('div'); card.className='cp-pin';
      const r1 = document.createElement('div'); r1.className='row';
      const title = document.createElement('div'); title.className='title'; title.contentEditable = true; title.textContent = p.title || (p.text || '').slice(0,60);
      title.onblur = async () => { p.title = title.textContent.trim(); await chrome.storage.local.set({ [key('pins')]: pins }); };
      const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${cpHost(p.url)} • ${cpFmtTime(p.ts)}`;
      r1.append(title, meta);

      const body = document.createElement('div'); body.className='body'; body.textContent = p.text || '';

      const actions = document.createElement('div'); actions.className='actions';
      const star = document.createElement('button'); star.className='star' + (p.fav ? ' active' : ''); star.textContent = p.fav ? '★ Fav' : '☆ Fav';
      star.onclick = async () => { p.fav = !p.fav; star.className = 'star' + (p.fav?' active':''); star.textContent = p.fav ? '★ Fav' : '☆ Fav'; await chrome.storage.local.set({ [key('pins')]: pins }); };
      const open = document.createElement('button'); open.textContent = 'Open'; open.onclick = () => { if (p.url) window.open(p.url, '_blank'); };
      const copy = document.createElement('button'); copy.textContent = 'Copy'; copy.onclick = () => cpCopyText(p.text || '');
      const insert = document.createElement('button'); insert.textContent = 'Insert'; insert.onclick = () => insertIntoChat(p.text || '');
      actions.append(star, open, copy, insert);

      card.append(r1, body, actions);
      list.append(card);
    });
  }

  search.oninput = (e)=>{ qv = e.target.value || ''; render(); };
  sortSel.onchange = (e)=>{ mode = e.target.value || 'new'; render(); };
  exportBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(pins, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chatpilot-pins.json'; a.click();
  };
  clearBtn.onclick = async () => {
    if (!confirm('Clear all pins?')) return;
    await chrome.storage.local.set({ [key('pins')]: [] });
    pins = []; render();
  };
  closeBtn.onclick = ()=>{ modal.hidden = true; };

  modal.hidden = false;
  render();
}


// ---------- renderer (restored) ----------
function renderTree(tree, filter=''){
  const root = document.getElementById('cp-list');
  if (!root) return;
  root.innerHTML='';
  const terms = (filter||'').toLowerCase();
  const frag = document.createDocumentFragment();

  tree.forEach((folder) => {
    const folderEl = document.createElement('div'); folderEl.className='cp-folder';

    const row = document.createElement('div'); row.className='row';
    const name = document.createElement('div'); name.className='name'; name.textContent = folder.name || 'Untitled';
    const actions = document.createElement('div'); actions.className='actions';

    const add = document.createElement('button'); add.textContent = '+ Prompt';
    add.onclick = async () => {
      const title = prompt('Prompt name?'); if (!title) return;
      const body = prompt('Prompt text (supports {{vars}}):') || '';
      const labelsStr = prompt('Labels (comma,separated)? (optional)') || '';
      const labels = parseLabels(labelsStr);
      folder.prompts = folder.prompts || [];
      folder.prompts.push({ id: crypto.randomUUID(), title, body, fav:false, labels });
      await saveTree(tree); renderTree(tree, '');
    };

    const rm = document.createElement('button'); rm.textContent = '🗑️'; rm.title = 'Delete folder';
    rm.onclick = async () => {
      if (!confirm('Delete folder?')) return;
      const idx = tree.indexOf(folder);
      tree.splice(idx,1);
      await saveTree(tree); renderTree(tree, '');
    };

    actions.append(add, rm);
    row.append(name, actions);
    folderEl.append(row);

    (folder.prompts || [])
      .filter(p => !terms || (p.title && p.title.toLowerCase().includes(terms)) || (p.body && p.body.toLowerCase().includes(terms)))
      .forEach(p => {
        const pEl = document.createElement('div'); pEl.className = 'cp-prompt';
        const pname = document.createElement('div'); pname.className = 'name'; pname.textContent = `★ ${p.title}`;
        const body = document.createElement('div'); body.className = 'body'; body.textContent = p.body;

        const pa = document.createElement('div'); pa.className = 'cp-actions';
        const insert = document.createElement('button'); insert.textContent = 'Insert';
        const copyBtn = document.createElement('button'); copyBtn.textContent = 'Copy';
        const edit = document.createElement('button'); edit.textContent = 'Edit';
        const more = document.createElement('button'); more.textContent = '⋮'; more.title='More';

        insert.onclick = () => insertIntoChat(p.body);
        copyBtn.onclick = async () => {
          const data = await cpCollectVariables(p.body);
          if (data.cancelled) return;
          chrome.runtime.sendMessage(
            { type: 'COPY_TO_CLIPBOARD', text: data.text },
            () => cpCopyText(data.text)
          );
        };
        edit.onclick = async () => {
          // simple dialog edit; inline editor still available in newer build paths
          const t = prompt('Rename?', p.title) ?? p.title;
          const b = prompt('Edit text:', p.body) ?? p.body;
          const labs = prompt('Edit labels (comma,separated):', (p.labels||[]).join(', ')) || '';
          p.title = t; p.body = b; p.labels = parseLabels(labs);
          await saveTree(tree); renderTree(tree, filter);
        };

        cpMakeMenu(more, [
          { label: 'Delete', onClick: async () => {
              if (!confirm('Delete prompt?')) return;
              const idx = folder.prompts.indexOf(p);
              folder.prompts.splice(idx,1);
              await saveTree(tree); renderTree(tree, filter);
            }},
          { label: 'Duplicate', onClick: async () => {
              folder.prompts.splice(folder.prompts.indexOf(p)+1, 0, { ...p, id: crypto.randomUUID(), title: p.title + ' (copy)' });
              await saveTree(tree); renderTree(tree, filter);
            }}
        ]);

        pa.append(insert, copyBtn, edit, more);
        pEl.append(pname, body, pa);
        folderEl.append(pEl);
      });

    frag.append(folderEl);
  });
  root.append(frag);
}



// ---------- helpers: context menu + export ----------
function exportData(){
  (async ()=>{
    const tree = await loadTree();
    const pins = await loadPins();
    const payload = { tree, pins, exportedAt: new Date().toISOString(), version: 1 };
    const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chatpilot-data.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
    cpShowToast('Exported ✅');
  })();
}

// ---------- boot ----------
async function boot() {
  const initKey = key('seeded');
  const got = await chrome.storage.local.get(initKey);
  if (!got[initKey]) {
    const sample = [
      { name: 'General', prompts: [
        { id: crypto.randomUUID(), title: 'Bug report', body: 'You are a meticulous QA tester. Steps to reproduce: {{steps}}. Expected: {{expected}}. Observed: {{observed}}. Provide minimal repro.', fav: true },
        { id: crypto.randomUUID(), title: 'SQL optimize', body: 'Given this schema and query, suggest optimized indexes and an EXPLAIN breakdown: {{sql}}', fav: false }
      ]},
      { name: 'DevOps', prompts: [
        { id: crypto.randomUUID(), title: 'Nginx config', body: 'Generate a hardened Nginx server block for domain {{domain}} with HTTP→HTTPS, HSTS, and gzip/brotli.', fav: false }
      ]}
    ];
    await chrome.storage.local.set({ [key('tree')]: sample, [initKey]: true });
  }

  const search = document.getElementById('cp-search');
  const newFolder = document.getElementById('cp-new-folder');
  const newPrompt = document.getElementById('cp-new-prompt');
  const exportBtn = document.getElementById('cp-export');
  const pinsBtn = document.getElementById('cp-pins');
  const closeBtn = document.getElementById('cp-close');
  const settingsBtn = document.getElementById('cp-settings-btn');
  const expandBtn = document.getElementById('cp-expand');

  let tree = await loadTree();
  renderTree(tree);

  search.addEventListener('input', (e) => renderTree(tree, e.target.value));
  newFolder.onclick = async () => {
    const name = prompt('Folder name?'); if (!name) return;
    tree.push({ name, prompts: [] });
    await saveTree(tree); renderTree(tree, '');
  };
  newPrompt.onclick = async () => {
    if (!tree.length) tree.push({ name: 'My Prompts', prompts: [] });
    const folder = tree[0];
    const title = prompt('Prompt name?'); if (!title) return;
    const body = prompt('Prompt text:') || '';
    const labelsStr = prompt('Labels (comma,separated)? (optional)') || ''; const labels = parseLabels(labelsStr);
    folder.prompts.push({ id: crypto.randomUUID(), title, body, fav:false, labels });
    await saveTree(tree); renderTree(tree, '');
  };
  exportBtn.onclick = exportData;
  pinsBtn.onclick = cpOpenPins;
  closeBtn.onclick = () => { window.top?.postMessage({ type: 'CHATPILOT_CLOSE' }, '*'); };
  expandBtn.onclick = () => {
    const now = document.body.getAttribute('data-expanded') === 'true' ? 'false' : 'true';
    document.body.setAttribute('data-expanded', now);
    window.top?.postMessage({ type: 'CHATPILOT_EXPAND', value: now === 'true' }, '*');
  };
  settingsBtn.onclick = async () => {
    const modal = document.getElementById('cp-settings-modal');
    const s = await loadSettings();
    document.getElementById('cp-set-theme').value = s.theme;
    document.getElementById('cp-set-width').value = s.panelWidth;
    document.getElementById('cp-set-font').value = s.fontSize;
    document.getElementById('cp-set-compact').checked = !!s.compact;
    document.getElementById('cp-set-launcher').checked = !!s.launcher;
    modal.hidden = false;
  };
}

// Command palette focus
window.addEventListener('message', (ev) => {
  if (ev?.data?.type === 'CHATPILOT_COMMAND_PALETTE') {
    const search = document.getElementById('cp-search');
    if (search) { search.focus(); search.select(); }
  }
});
window.addEventListener('DOMContentLoaded', async () => {
  await boot();
  const s = await loadSettings(); applySettings(s);

  // Dock button -> toggle docked side panel and notify host page
  const dockBtn = document.getElementById('cp-dock-btn');
  if (dockBtn){
    dockBtn.onclick = async ()=>{
      const s3 = await loadSettings();
      const next = !s3.dockRight;
      s3.dockRight = next;
      await saveSettings(s3);
      try { window.top?.postMessage({ type: 'CHATPILOT_DOCK', dock: next, width: document.body.clientWidth }, '*'); } catch {}
      dockBtn.title = next ? 'Undock' : 'Dock right';
    };
    // send initial state
    try { const s0 = await loadSettings(); window.top?.postMessage({ type: 'CHATPILOT_DOCK', dock: !!s0.dockRight, width: document.body.clientWidth }, '*'); } catch {}
    // keep width updated while docked
    const ro = new ResizeObserver(()=>{
      (async ()=>{
        const sC = await loadSettings();
        if (sC.dockRight) { try { window.top?.postMessage({ type: 'CHATPILOT_DOCK', dock: true, width: document.body.clientWidth }, '*'); } catch {} }
      })();
    });
    ro.observe(document.body);
  }


  const m = document.getElementById('cp-settings-modal');
  document.getElementById('cp-settings-close').onclick = ()=>{ m.hidden = true; };
  document.getElementById('cp-settings-save').onclick = async ()=>{
    const s2 = {
      theme: document.getElementById('cp-set-theme').value,
      panelWidth: Math.max(300, Math.min(640, parseInt(document.getElementById('cp-set-width').value || '380', 10))),
      fontSize: document.getElementById('cp-set-font').value,
      compact: document.getElementById('cp-set-compact').checked,
      launcher: document.getElementById('cp-set-launcher').checked,
    };
    await saveSettings(s2); applySettings(s2); m.hidden = true;
  };
  document.getElementById('cp-settings-reset').onclick = async ()=>{ await saveSettings(DEFAULT_SETTINGS); applySettings(DEFAULT_SETTINGS); m.hidden = true; };
});

// Listen for content-script ACK (insertion via fallback)
window.addEventListener('message', (e)=>{
  if (e?.data?.type === 'CHATPILOT_INSERT_ACK') {
    cpShowToast(e.data.ok ? 'Inserted into chat ✅' : 'Insert failed ❌');
  }
});

// ---------- copy helpers ----------
function cpTryLocalCopy(text){
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  }catch(e){
    console.debug('cpTryLocalCopy failed', e);
    return false;
  }
}

function cpCopyText(text){
  if (cpTryLocalCopy(text)) { cpShowToast('Copied ✅'); return; }
  try {
    chrome.runtime.sendMessage({ type: 'COPY_TO_CLIPBOARD', text }, (resp) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        console.debug('copy lastError:', chrome.runtime.lastError.message || chrome.runtime.lastError);
        chrome.runtime.sendMessage({ type: 'COPY_VIA_PAGE', text }, (resp2) => {
          cpShowToast(resp2?.ok ? 'Copied ✅' : 'Copy failed ❌');
        });
        return;
      }
      if (resp && resp.ok) { cpShowToast('Copied ✅'); }
      else {
        chrome.runtime.sendMessage({ type: 'COPY_VIA_PAGE', text }, (resp2) => {
          cpShowToast(resp2?.ok ? 'Copied ✅' : 'Copy failed ❌');
        });
      }
    });
  } catch (e) {
    console.debug('copy sendMessage exception', e);
    chrome.runtime.sendMessage({ type: 'COPY_VIA_PAGE', text }, (resp2) => {
      cpShowToast(resp2?.ok ? 'Copied ✅' : 'Copy failed ❌');
    });
  }
}


// ===== Labels & Form Keep (addon) =====
const LABELS_KEY = 'chatpilot/labels';

async function loadLabels(){
  const obj = await chrome.storage.local.get(LABELS_KEY);
  return obj[LABELS_KEY] || [];
}
async function saveLabels(labels){
  await chrome.storage.local.set({ [LABELS_KEY]: labels });
}

function chip(label, removable=false, onRemove){
  const d = document.createElement('span');
  d.className = 'cp-chip';
  d.textContent = label;
  if (removable){
    const x = document.createElement('span');
    x.textContent = '×'; x.className = 'x';
    x.onclick = () => onRemove && onRemove(label, d);
    d.appendChild(x);
  }
  return d;
}

function parseLabels(str){
  return Array.from(new Set((str||'').split(',').map(s=>s.trim()).filter(Boolean)));
}

function itemHasLabel(item, label){
  if (!label) return true;
  const arr = (item.labels||[]);
  return arr.includes(label);
}



// Filter by label during render list
window.addEventListener('DOMContentLoaded', ()=>{
  if (typeof renderTree === 'function'){
    const _renderTreeOriginal = renderTree;
    renderTree = async function(tree, filter){
      const labelFilter = document.getElementById('cp-label-filter')?.value?.trim();
      const filteredTree = labelFilter ? tree.map(f => ({
        ...f,
        prompts: (f.prompts||[]).filter(p => itemHasLabel(p, labelFilter)),
        pins: (f.pins||[]).filter(p => itemHasLabel(p, labelFilter)),
      })) : tree;

      const result = _renderTreeOriginal(filteredTree, filter);

      try {
        const folderEls = Array.from(document.querySelectorAll('#cp-list .cp-folder'));
        filteredTree.forEach((folder, fi) => {
          const folderEl = folderEls[fi];
          if (!folderEl) return;
          const promptEls = Array.from(folderEl.querySelectorAll('.cp-prompt'));
          (folder.prompts||[]).forEach((p, pi) => {
            const el = promptEls[pi];
            if (!el) return;
            if (el.querySelector('.cp-chips')) return;
            if (p.labels && p.labels.length){
              const lab = document.createElement('div'); lab.className='cp-chips';
              p.labels.forEach(l => lab.appendChild(chip(l,false)));
              el.appendChild(lab);
            }
          });
        });
      } catch(e){}

      return result;
    };
  }
});



// Add labels input to Prompt modal (reuse existing modal widgets)
// Wire toolbar: open labels manager, new form
document.getElementById('cp-manage-labels')?.addEventListener('click', async () => {
  const modal = document.getElementById('cp-labels-modal');
  const list = document.getElementById('cp-labels-list');
  modal.hidden = false;
  const labels = await loadLabels();
  list.innerHTML = '';
  labels.forEach(l => {
    const ch = chip(l, true, async (label, el)=>{
      const rest = (await loadLabels()).filter(x=>x!==label);
      await saveLabels(rest);
      el.remove();
    });
    list.appendChild(ch);
  });
});

document.getElementById('cp-labels-close')?.addEventListener('click', ()=>{
  document.getElementById('cp-labels-modal').hidden = true;
});

document.getElementById('cp-new-label')?.addEventListener('keydown', async (e)=>{
  if (e.key === 'Enter'){
    const val = e.target.value.trim();
    if (!val) return;
    const labels = await loadLabels();
    if (!labels.includes(val)){
      labels.push(val);
      await saveLabels(labels);
      const list = document.getElementById('cp-labels-list');
      list.appendChild(chip(val, true, async (label, el)=>{
        const rest = (await loadLabels()).filter(x=>x!==label);
        await saveLabels(rest);
        el.remove();
      }));
    }
    e.target.value = '';
  }
});

// Labels save patch will be inserted here

// label filter live render
document.getElementById('cp-label-filter')?.addEventListener('input', async ()=>{
  const t = await loadTree();
  renderTree(t);
});
// ===== end addon =====
// Simple draggable support for panel
function makeDraggable(el) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = el.querySelector(".panel-header");
  (header || el).onmousedown = dragMouseDown;
  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    el.style.top = (el.offsetTop - pos2) + "px";
    el.style.left = (el.offsetLeft - pos1) + "px";
    el.style.position = "fixed";
  }
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const panel = document.querySelector(".panel-container");
  if (panel) makeDraggable(panel);
});


// Force panel to stay at 100% zoom regardless of Chrome zoom
document.addEventListener("DOMContentLoaded", () => {
  document.body.style.zoom = "100%";
  document.body.style.transform = "scale(1)";
  document.body.style.transformOrigin = "0 0";
});


// DPI-adaptive scaling to keep panel consistent across monitors
function fixDPI() {
  const scale = 1 / window.devicePixelRatio;
  document.body.style.transform = `scale(${scale})`;
  document.body.style.transformOrigin = "0 0";
  document.body.style.width = (100 * window.devicePixelRatio) + "%";
  document.body.style.height = (100 * window.devicePixelRatio) + "%";
}
window.addEventListener("resize", fixDPI);
window.addEventListener("load", fixDPI);
document.addEventListener("DOMContentLoaded", fixDPI);


// Hybrid DPI scaling fix (handles 100% zoom separately)
function hybridFixDPI() {
  let dpr = window.devicePixelRatio;

  if (dpr === 1) {
    // Native 100% zoom → render normally
    document.body.style.transform = "none";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
  } else {
    // Any other zoom/DPI → compensate with scaling
    const scale = 1 / dpr;
    document.body.style.transform = `scale(${scale})`;
    document.body.style.transformOrigin = "0 0";
    document.body.style.width = (100 * dpr) + "%";
    document.body.style.height = (100 * dpr) + "%";
  }
}

window.addEventListener("resize", hybridFixDPI);
window.addEventListener("load", hybridFixDPI);
document.addEventListener("DOMContentLoaded", hybridFixDPI);


// JS fallback to auto-correct header/search collapse at 100% zoom
function fixHeaderLayout() {
  const header = document.querySelector(".panel-header");
  const input = header?.querySelector("input");
  if (input && input.offsetWidth === 0) {
    input.style.minWidth = "1px"; // force reflow
  }
}
new ResizeObserver(fixHeaderLayout).observe(document.body);
