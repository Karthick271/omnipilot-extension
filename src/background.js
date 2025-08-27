// background.js (MV3, module)
chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) { console.warn('setPanelBehavior failed:', e); }
  }
});

chrome.commands?.onCommand?.addListener(async (cmd) => {
  if (cmd !== 'toggle-panel' || !chrome.sidePanel?.open) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) { try { await chrome.sidePanel.open({ tabId: tab.id }); } catch (e) { console.warn(e); } }
});
