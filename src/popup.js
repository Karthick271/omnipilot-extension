document.getElementById("togglePanel").addEventListener("click", async () => {
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      // Chrome 116+ with side panel API
      await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    } else {
      // Fallback for older Chrome versions: open in popup window
      chrome.windows.create({
        url: "content/panel.html",
        type: "popup",
        width: 400,
        height: 600
      });
    }
  } catch (e) {
    console.error("Error opening panel:", e);
  }
});