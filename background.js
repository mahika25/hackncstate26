// background.js — BrowseGuard Service Worker
// Manages the single ghost tab only. User closes it manually.

let ghostTabId = null;

// ── Message Router ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "INJECT_QUERY") {
    injectQuery(msg.query).then(sendResponse);
    return true;
  }

});

// ── Ghost Tab Management ───────────────────────────────────────────────────────
async function injectQuery(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  try {
    // If ghost tab already exists and is still open, just update its URL
    if (ghostTabId !== null) {
      const tab = await chrome.tabs.get(ghostTabId).catch(() => null);
      if (tab) {
        await chrome.tabs.update(ghostTabId, { url });
        return { ok: true, tabId: ghostTabId, action: "updated" };
      }
    }

    // Otherwise open a new background tab — user closes it when done
    const newTab = await chrome.tabs.create({ url, active: false });
    ghostTabId = newTab.id;
    return { ok: true, tabId: ghostTabId, action: "created" };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Track if user manually closes the ghost tab so we open a fresh one next time
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === ghostTabId) ghostTabId = null;
});
