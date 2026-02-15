// background.js — blurB Service Worker

const FLASK_BASE = "http://localhost:5000";

let ghostTabId = null;

// ── SSE: connect to Flask stream and open tabs as queries arrive ───────────────
function connectToStream() {
  // Service workers can't use EventSource directly, so we use fetch + ReadableStream
  fetch(`${FLASK_BASE}/api/stream`)
    .then(res => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            // Stream closed — reconnect after a short delay
            console.log("SSE stream closed, reconnecting in 3s...");
            setTimeout(connectToStream, 3000);
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          // SSE messages are separated by double newlines
          const parts = buffer.split("\n\n");
          buffer = parts.pop(); // keep incomplete last chunk

          parts.forEach(part => {
            const line = part.trim();
            if (line.startsWith("data:")) {
              const raw = line.slice(5).trim();
              try {
                const { query } = JSON.parse(raw);
                if (query) openTab(query);
              } catch (e) {
                console.error("Failed to parse SSE message:", raw, e);
              }
            }
          });

          read(); // keep reading
        }).catch(err => {
          console.error("SSE read error:", err);
          setTimeout(connectToStream, 3000);
        });
      }

      read();
    })
    .catch(err => {
      console.error("SSE connect error:", err);
      setTimeout(connectToStream, 3000);
    });
}

// ── Open / reuse ghost tab ─────────────────────────────────────────────────────
async function openTab(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  try {
    if (ghostTabId !== null) {
      const tab = await chrome.tabs.get(ghostTabId).catch(() => null);
      if (tab) {
        await chrome.tabs.update(ghostTabId, { url });
        return;
      }
    }

    const newTab = await chrome.tabs.create({ url, active: false });
    ghostTabId = newTab.id;

  } catch (e) {
    console.error("Failed to open tab:", e);
  }
}

// Track if user closes the ghost tab
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === ghostTabId) ghostTabId = null;
});

// ── Message handler (from popup, if needed) ────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "INJECT_QUERY") {
    openTab(msg.query).then(sendResponse);
    return true;
  }
});

// ── Start SSE connection when service worker starts ────────────────────────────
connectToStream();
