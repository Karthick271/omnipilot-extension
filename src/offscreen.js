
// offscreen.js — lives in extension origin, not blocked by site Permissions-Policy
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg?.type === 'OFFSCREEN_COPY') {
    try {
      await navigator.clipboard.writeText(msg.text || '');
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true; // async
  }
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'OFFSCREEN_PING') {
    sendResponse({ ok: true });
    return true;
  }
});
