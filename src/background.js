// background.js (MV3 Service Worker)
chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreen();
  chrome.contextMenus.create({
    id: "chatpilot-save-selection",
    title: "Save selection to ChatPilot → Pins",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "chatpilot-save-selection" && info.selectionText) {
    const key = `chatpilot/pins`;
    const { [key]: pins = [] } = await chrome.storage.local.get(key);
    pins.push({ text: info.selectionText, url: info.pageUrl, ts: Date.now() });
    await chrome.storage.local.set({ [key]: pins });
    chrome.notifications?.create?.({
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: "Pinned to ChatPilot",
      message: info.selectionText.slice(0, 120)
    });
  }
});

// Keyboard shortcut toggle (Alt+P)
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "toggle-panel") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "CHATPILOT_TOGGLE" });
  }
});


async function ensureOffscreen() {
  try {
    const hasDoc = await chrome.offscreen.hasDocument?.();
    if (!hasDoc) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Write to clipboard from extension UI (panel iframe)'
      });
    }
  } catch (e) {
    // if createDocument throws because it already exists, ignore
    console.debug('ensureOffscreen create', e?.message || e);
  }
  // Wait until offscreen is listening
  for (let i = 0; i < 10; i++) {
    try {
      const pong = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' }, (resp) => {
            resolve(resp);
          });
        } catch (e) {
          resolve(null);
        }
      });
      if (pong && pong.ok) return true;
    } catch(e) {}
    await new Promise(r => setTimeout(r, 50));
  }
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => { /*cp-log*/ console.debug('BG got', msg);
  if (msg?.type === 'COPY_TO_CLIPBOARD') { /* copy handler */
    (async () => {
      try {
        await ensureOffscreen();
        chrome.runtime.sendMessage({ type: 'OFFSCREEN_COPY', text: msg.text }, (resp) => { const err = chrome.runtime.lastError; if (err) { console.debug('copy err', err); return sendResponse({ ok:false, error: String(err.message || err) }); }
          sendResponse(resp || { ok: false });
        });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async
  }
});


// Robust insert via scripting API
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'INSERT_TEXT') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab' });
        const text = msg.text || '';
        const [{ result } = {}] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: (inText) => {
            // Search across shadow roots
            function* allNodes(root=document){
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
              let n = root;
              yield n;
              while ((n = walker.nextNode())) {
                yield n;
                const sr = n.shadowRoot;
                if (sr) yield* allNodes(sr);
              }
            }
            function findInput(){
              // Try explicit selectors first
              const sels = [
                '#prompt-textarea', 'textarea#prompt-textarea',
                'textarea[placeholder*="Message"]',
                'form textarea',
                '[role="textbox"]',
                'div[contenteditable="true"]',
                'textarea'
              ];
              for (const s of sels) {
                const el = document.querySelector(s);
                if (el) return el;
              }
              // Shadow/role scan
              for (const el of allNodes()) {
                if (el.matches?.('[role="textbox"],textarea,div[contenteditable="true"]')) return el;
              }
              return null;
            }
            const el = findInput();
            if (!el) return { ok:false, error:'Input not found' };

            if (el.tagName === 'TEXTAREA' || 'value' in el) {
              const nativeSetter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set;
              if (nativeSetter) nativeSetter.call(el, inText);
              else el.value = inText;
              el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true }));
              try { el.setSelectionRange(inText.length, inText.length); } catch {}
              el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            } else {
              el.focus();
              el.textContent = inText;
              el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, composed: true, data: inText }));
            }
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { ok:true };
          },
          args: [text]
        });
        sendResponse(result || { ok: false });
      } catch (e) {
        sendResponse({ ok:false, error: String(e) });
      }
    })();
    return true; // async
  }
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'COPY_VIA_PAGE') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return sendResponse({ ok:false, error:'No active tab' });
        const text = msg.text || '';
        const [{ result } = {}] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: (txt) => {
            try {
              // Prefer modern API first
              if (navigator.clipboard?.writeText) {
                return navigator.clipboard.writeText(txt).then(()=>({ok:true})).catch(()=>{
                  // fallback
                  const ta = document.createElement('textarea');
                  ta.value = txt;
                  ta.style.position='fixed'; ta.style.left='-9999px'; ta.style.opacity='0';
                  document.body.appendChild(ta);
                  ta.focus(); ta.select();
                  const ok = document.execCommand('copy');
                  document.body.removeChild(ta);
                  return { ok: !!ok };
                });
              } else {
                const ta = document.createElement('textarea');
                ta.value = txt;
                ta.style.position='fixed'; ta.style.left='-9999px'; ta.style.opacity='0';
                document.body.appendChild(ta);
                ta.focus(); ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return { ok: !!ok };
              }
            } catch (e) {
              return { ok:false, error: String(e) };
            }
          },
          args: [text],
          world: 'MAIN'
        });
        // result may be a Promise if clipboard.writeText path; unwrap best-effort
        if (result && typeof result.then === 'function') {
          result.then(r => sendResponse(r)).catch(e => sendResponse({ok:false, error:String(e)}));
        } else {
          sendResponse(result || { ok:false });
        }
      } catch (e) {
        sendResponse({ ok:false, error:String(e) });
      }
    })();
    return true; // async
  }
});


// --- ChatPilot: icon state + offscreen helper ---