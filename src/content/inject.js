let CP_SETTINGS = { theme:'auto', panelWidth:420, fontSize:'normal', compact:false, launcher:true, float:true };
// content/inject.js
const HOST_ID = 'chatpilot-shadow-host';

function ensurePanel() {
  if (document.getElementById(HOST_ID)) return document.getElementById(HOST_ID);
  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed', top: '0px', right: '0px', bottom:'0px', zIndex: 2147483646
  });
  const shadow = host.attachShadow({ mode: 'open' });
  const dragger = document.createElement('div');
  dragger.id = 'cp-dragger';
  dragger.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:28px;cursor:move;z-index:2;';
  shadow.appendChild(dragger);
  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('content/panel.html'); iframe.id='chatpilot-frame';
  iframe.style.width = '420px'; // default width; updated later by settings
  iframe.style.height = '100vh';
  iframe.style.border = '0'; iframe.style.display='block'; iframe.style.overflow='hidden';
  iframe.style.borderRadius = '16px';
  shadow.appendChild(iframe);
  document.documentElement.appendChild(host);
  (function(){
    let dragging=false, sx=0, sy=0, ox=0, oy=0;
    dragger.addEventListener('mousedown', (ev)=>{
      if (!CP_SETTINGS.float) return;
      dragging = true;
      sx = ev.clientX; sy = ev.clientY;
      const r = host.getBoundingClientRect();
      host.style.right = 'auto';
      host.style.left = r.left + 'px';
      host.style.top = r.top + 'px';
      ox = r.left; oy = r.top;
      ev.preventDefault();
    });
    window.addEventListener('mousemove', (ev)=>{
      if (!dragging) return;
      const nx = Math.min(window.innerWidth - 50, Math.max(0, ox + (ev.clientX - sx)));
      const ny = Math.min(window.innerHeight - 50, Math.max(0, oy + (ev.clientY - sy)));
      host.style.left = nx + 'px';
      host.style.top  = ny + 'px';
    });
    window.addEventListener('mouseup', ()=> dragging=false);
    dragger.addEventListener('dblclick', ()=>{
      host.style.left = '';
      host.style.top = '0px';
      host.style.right = '0px';
    });
  })();
  try { chrome.runtime.sendMessage({type:'CP_PANEL_STATE', open:true}); } catch(e){}
  return host;
}

function togglePanel() {
  const host = document.getElementById(HOST_ID);
  if (host) {
    const nowOpen = host.style.display === 'none';
    host.style.display = nowOpen ? '' : 'none';
    try { chrome.runtime.sendMessage({type:'CP_PANEL_STATE', open: nowOpen}); } catch(e){}
  
  } else {
    ensurePanel(); try { chrome.runtime.sendMessage({type:'CP_PANEL_STATE', open:true}); } catch(e){}
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'CHATPILOT_TOGGLE') togglePanel();
});

// Auto-mount once for visibility; user can close with Esc or Alt+P
ensurePanel(); try { chrome.runtime.sendMessage({type:'CP_PANEL_STATE', open:true}); } catch(e){}

// Global key handling (Esc to close)
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const host = document.getElementById(HOST_ID);
    if (host) host.style.display = 'none';
  }
});

// Forward Cmd/Ctrl+K to command palette (focus search)
addEventListener('keydown', (e) => {
  const isModK = (e.key.toLowerCase() === 'k') && (e.ctrlKey || e.metaKey);
  if (isModK) {
    const host = document.getElementById(HOST_ID) || ensurePanel(); try { chrome.runtime.sendMessage({type:'CP_PANEL_STATE', open:true}); } catch(e){}
    const shadow = host.shadowRoot;
    const iframe = shadow && shadow.querySelector('iframe');
    if (iframe) {
      iframe.contentWindow.postMessage({ type: 'CHATPILOT_COMMAND_PALETTE' }, '*');
      e.preventDefault();
    }
  }
});

// Also support close from inside panel via postMessage
addEventListener('message', (ev) => {
  if (ev?.data?.type === 'CHATPILOT_CLOSE') {
    const host = document.getElementById(HOST_ID);
    if (host) host.style.display = 'none';
  }
});


// Listen for insertion requests from panel iframe
function cpFindChatInput(doc) {
  // Common selectors (ChatGPT/Claude)
  const sels = [
    'textarea[placeholder*="Message"]',
    'form textarea',
    'div[contenteditable="true"][data-testid*="input"]',
    'div[contenteditable="true"]',
    'textarea'
  ];
  for (const s of sels) {
    const el = doc.querySelector(s);
    if (el) return el;
  }
  return null;
}

function cpInsertText(text) {
  const doc = document;
  const el = cpFindChatInput(doc);
  if (!el) return false;
  el.focus();
  if ('value' in el) {
    el.value = text;
  } else {
    el.textContent = text;
  }
  // Fire input events so frameworks react
  const ev1 = new InputEvent('input', { bubbles: true, cancelable: true, data: text, inputType: 'insertText' });
  el.dispatchEvent(ev1);
  const ev2 = new Event('change', { bubbles: true });
  el.dispatchEvent(ev2);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

addEventListener('message', (e) => {
  if (e?.data?.type === 'CHATPILOT_INSERT') {
    try {
      const ok = cpInsertText(e.data.text || '');
      // Optional ACK back to panel
      e.source?.postMessage?.({ type: 'CHATPILOT_INSERT_ACK', ok }, '*');
    } catch (err) {
      e.source?.postMessage?.({ type: 'CHATPILOT_INSERT_ACK', ok: false, error: String(err) }, '*');
    }
  }
});


// Settings listener from panel (width + launcher visibility)
window.addEventListener('message', (e)=>{
  if (e?.data?.type === 'CHATPILOT_APPLY_SETTINGS') {
    CP_SETTINGS = Object.assign(CP_SETTINGS, e.data.settings || {});
    applyPanelPrefs();
    toggleLauncher();
  }
});

function applyPanelPrefs(){
  const frame = document.getElementById('chatpilot-frame');
  const h = document.getElementById(HOST_ID);
  const widthPx = (CP_SETTINGS.panelWidth || 420) + 'px';
  if (frame) frame.style.width = widthPx;
  if (h){
    if (CP_SETTINGS.float){
      if (frame) frame.style.borderRadius = '16px';
    } else {
      if (frame) frame.style.borderRadius = '0px';
      h.style.left = ''; 
      h.style.top = '0px'; 
      h.style.right = '0px';
    }
  }
}
function ensureLauncher(){
  let btn = document.getElementById('chatpilot-launcher');
  if (!btn){
    btn = document.createElement('div');
    btn.id = 'chatpilot-launcher';
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:999999;border-radius:999px;background:#2f6efc;color:#fff;padding:10px 12px;font:600 13px/1.2 system-ui, -apple-system, Segoe UI; box-shadow:0 8px 22px rgba(0,0,0,.25); cursor:pointer; user-select:none;';
    btn.textContent = 'ChatPilot';
    btn.title = 'Open ChatPilot';
    btn.addEventListener('click', ()=> window.postMessage({ type:'CHATPILOT_TOGGLE' }, '*'));
    // draggable
    let drag=false, sx=0, sy=0, bx=0, by=0;
    btn.addEventListener('mousedown', (ev)=>{ drag=true; sx=ev.clientX; sy=ev.clientY; const r=btn.getBoundingClientRect(); bx=r.right; by=r.bottom; ev.preventDefault(); });
    window.addEventListener('mousemove', (ev)=>{
      if(!drag) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      btn.style.right = Math.max(8, (window.innerWidth - bx - dx)) + 'px';
      btn.style.bottom = Math.max(8, (window.innerHeight - by - dy)) + 'px';
    });
    window.addEventListener('mouseup', ()=> drag=false);
    document.documentElement.appendChild(btn);
  }
  return btn;
}

function toggleLauncher(){
  const btn = ensureLauncher();
  btn.style.display = CP_SETTINGS.launcher ? 'block' : 'none';
}

// initialize from stored settings
chrome.storage?.local?.get('chatpilot/settings').then((obj)=>{
  CP_SETTINGS = Object.assign(CP_SETTINGS, obj['chatpilot/settings'] || {});
  applyPanelPrefs();
  toggleLauncher();
});


let CP_BACKDROP = null;
function ensureBackdrop(){
  if (CP_BACKDROP) return CP_BACKDROP;
  const d = document.createElement('div');
  d.id = 'chatpilot-backdrop';
  d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:saturate(80%) blur(1px);z-index:2147483646;display:none;';
  d.addEventListener('click', ()=> window.postMessage({ type:'CHATPILOT_TOGGLE' }, '*'));
  document.documentElement.appendChild(d);
  CP_BACKDROP = d;
  return d;
}

function setExpanded(on){
  const frame = document.getElementById('chatpilot-frame');
  const back = ensureBackdrop();
  if (!frame) { return; }
  if (on){
    back.style.display = 'block';
    frame.style.width = 'min(96vw, 1100px)';
    frame.style.height = '86vh';
    frame.style.right = '50%';
    frame.style.transform = 'translateX(50%)';
    frame.style.top = '7vh';
    frame.style.bottom = 'auto';
    frame.style.borderRadius = '14px';
    frame.style.boxShadow = '0 16px 48px rgba(0,0,0,.35)';
    frame.style.zIndex = '2147483647';
  }else{
    back.style.display = 'none';
    frame.style.width = (CP_SETTINGS.panelWidth || 380) + 'px';
    frame.style.height = '100vh';
    frame.style.right = '0px';
    frame.style.transform = 'none';
    frame.style.top = '0px';
    frame.style.bottom = '0px';
    frame.style.borderRadius = '0px';
    frame.style.boxShadow = 'none';
    frame.style.zIndex = '999999';
  }
}

window.addEventListener('message', (e)=>{
  if (e?.data?.type === 'CHATPILOT_EXPAND'){
    setExpanded(!!e.data.value);
  }
});

// strengthen sticky button z-index & pointer events
(function(){
  const style = document.createElement('style');
  style.textContent = '#chatpilot-launcher{z-index:2147483647 !important; pointer-events:auto !important;}';
  document.documentElement.appendChild(style);
})();


// Dock handler: shift page content when panel is docked
window.addEventListener('message', (e) => {
  if (e?.data?.type === 'CHATPILOT_DOCK') {
    const dock = !!e.data.dock;
    const w = Math.min(e.data.width || 380, Math.max(window.innerWidth * 0.96, 360));
    if (dock) {
      document.documentElement.style.marginRight = (e.data.width || 380) + 'px';
      const h = document.getElementById(HOST_ID);
      if (h) h.style.right = '0px';
    } else {
      document.documentElement.style.marginRight = '';
    }
  }
});
