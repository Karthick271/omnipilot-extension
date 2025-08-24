const KEY = 'settings';
const el = document.getElementById('minimap');
chrome.storage.sync.get([KEY], (res) => {
  const s = res[KEY] || {};
  el.checked = !!s.minimap;
});
el?.addEventListener('change', () => {
  chrome.storage.sync.get([KEY], (res) => {
    const s = res[KEY] || {};
    s.minimap = el.checked;
    chrome.storage.sync.set({ [KEY]: s });
  });
});