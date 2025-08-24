console.log('[ChatPilot] service worker ready');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ChatPilot] installed');
});