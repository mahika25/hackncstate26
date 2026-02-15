// Background Service Worker for Privacy Shield Extension

const API_BASE_URL = 'http://localhost:5001';
const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q=';

// ── State ──────────────────────────────────────────────────────────
let isExecuting = false;
let stopRequested = false;
let executionTabId = null;

// ── Install ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('Privacy Shield installed');
  chrome.storage.local.set({
    executedQueries: [],
    selectedQueries: [],
    executionState: null,
    settings: {
      delayBetweenQueries: 3000,
      queriesPerSession: 10,
      notifications: true,
      closeTabs: true
    }
  });
  chrome.contextMenus.create({
    id: 'addToPersona',
    title: 'Add to Privacy Shield',
    contexts: ['selection']
  });
});

// ── Message router ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {

    case 'executeQueries':
      handleExecuteQueries(msg.queries, false);
      sendResponse({ success: true });
      break;

    case 'resumeExecution':
      resumeExecution();
      sendResponse({ success: true });
      break;

    case 'stopExecution':
      stopQueryExecution();
      sendResponse({ success: true });
      break;

    case 'openPersonaSelector':
      openPersonaSelector(msg.personas);
      sendResponse({ success: true });
      break;

    case 'getStatus':
      getExecutionStatus().then(s => sendResponse(s));
      return true;

    case 'deletePersona':
      handleDeletePersona(msg.personaIndex).then(r => sendResponse(r));
      return true;

    case 'regeneratePersona':
      handleRegeneratePersona(msg.profile).then(r => sendResponse(r));
      return true;

    case 'settingsUpdated':
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  return true;
});

// ── Query Execution ────────────────────────────────────────────────

async function handleExecuteQueries(queries, isResume) {
  if (isExecuting) {
    console.log('Already executing');
    return;
  }

  isExecuting = true;
  stopRequested = false;

  const { settings } = await chrome.storage.local.get(['settings']);
  const delay = settings?.delayBetweenQueries || 3000;
  const shouldCloseTabs = settings?.closeTabs !== false;

  let queue, startIndex;
  if (isResume) {
    const { executionState } = await chrome.storage.local.get(['executionState']);
    if (!executionState || !executionState.queue.length) {
      isExecuting = false;
      return;
    }
    queue = executionState.queue;
    startIndex = executionState.currentIndex;
  } else {
    queue = [...queries];
    startIndex = 0;
  }

  const total = queue.length;

  await chrome.storage.local.set({
    executionState: { queue, currentIndex: startIndex, total }
  });

  // Create reusable tab
  try {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    executionTabId = tab.id;
  } catch (err) {
    console.error('Tab creation failed:', err);
    isExecuting = false;
    return;
  }

  let completed = startIndex;
  const newExecuted = [];

  for (let i = startIndex; i < total; i++) {
    if (stopRequested) {
      console.log(`Stop requested at index ${i}`);
      await chrome.storage.local.set({
        executionState: { queue, currentIndex: i, total }
      });
      break;
    }

    try {
      await executeQuery(queue[i]);
      newExecuted.push({ query: queue[i], timestamp: Date.now(), searchEngine: 'google' });
      completed = i + 1;

      await chrome.storage.local.set({
        executionState: { queue, currentIndex: completed, total }
      });

      chrome.runtime.sendMessage({
        action: 'queryProgress', current: completed, total
      }).catch(() => {});

    } catch (error) {
      console.error('Query error:', error);
      completed = i + 1;
    }

    if (i < total - 1 && !stopRequested) {
      await interruptableSleep(delay);
    }
  }

  // Cleanup tab
  if (executionTabId !== null && shouldCloseTabs) {
    chrome.tabs.remove(executionTabId).catch(() => {});
  }
  executionTabId = null;

  // Persist executed queries
  if (newExecuted.length > 0) {
    const { executedQueries: existing } = await chrome.storage.local.get(['executedQueries']);
    await chrome.storage.local.set({
      executedQueries: [...(existing || []), ...newExecuted]
    });
  }

  const finished = completed >= total;
  if (finished) {
    await chrome.storage.local.set({ executionState: null });
  }

  isExecuting = false;
  stopRequested = false;

  chrome.runtime.sendMessage({
    action: 'queriesComplete',
    count: newExecuted.length,
    finished,
    stoppedAt: finished ? null : completed
  }).catch(() => {});
}

async function resumeExecution() {
  await handleExecuteQueries([], true);
}

async function executeQuery(query) {
  const searchUrl = GOOGLE_SEARCH_URL + encodeURIComponent(query);

  return new Promise((resolve, reject) => {
    chrome.tabs.update(executionTabId, { url: searchUrl }, () => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);

      let settled = false;

      function listener(tabId, info) {
        if (tabId === executionTabId && info.status === 'complete') {
          if (settled) return;
          settled = true;
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 2000);
        }
      }

      chrome.tabs.onUpdated.addListener(listener);

      setTimeout(() => {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 15000);
    });
  });
}

function stopQueryExecution() {
  stopRequested = true;

  if (executionTabId !== null) {
    chrome.tabs.remove(executionTabId).catch(() => {});
    executionTabId = null;
  }

  console.log('Stop requested');
}

function interruptableSleep(ms) {
  return new Promise(resolve => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (stopRequested || Date.now() - start >= ms) {
        clearInterval(iv);
        resolve();
      }
    }, 200);
  });
}

// ── Persona management ─────────────────────────────────────────────

async function handleDeletePersona(personaIndex) {
  const { personas, selectedQueries } = await chrome.storage.local.get(['personas', 'selectedQueries']);
  if (!personas || personaIndex < 0 || personaIndex >= personas.length) {
    return { success: false, error: 'Invalid index' };
  }

  const removedQueries = new Set(personas[personaIndex].queries || []);
  const cleaned = (selectedQueries || []).filter(q => !removedQueries.has(q));

  personas.splice(personaIndex, 1);
  await chrome.storage.local.set({ personas, selectedQueries: cleaned });
  return { success: true, personas };
}

async function handleRegeneratePersona(profile) {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/generate-personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, count: 1 })
    });
    if (!resp.ok) throw new Error('Backend error');
    const data = await resp.json();

    const { personas } = await chrome.storage.local.get(['personas']);
    const updated = [...(personas || []), data.personas[0]];
    await chrome.storage.local.set({ personas: updated });

    return { success: true, personas: updated };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Persona selector window ────────────────────────────────────────

function openPersonaSelector(personas) {
  chrome.storage.local.set({ tempPersonas: personas }, () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('persona-selector.html'),
      type: 'popup', width: 1000, height: 700,
      left: Math.round((screen.width - 1000) / 2),
      top: Math.round((screen.height - 700) / 2)
    });
  });
}

// ── Status ─────────────────────────────────────────────────────────

async function getExecutionStatus() {
  const data = await chrome.storage.local.get([
    'executedQueries', 'selectedQueries', 'executionState', 'personas'
  ]);
  return {
    isExecuting,
    stopRequested,
    executionState: data.executionState || null,
    totalExecuted: data.executedQueries?.length || 0,
    totalSelected: data.selectedQueries?.length || 0,
    personaCount: data.personas?.length || 0
  };
}

// ── Context menu ───────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'addToPersona' && info.selectionText) {
    const { selectedQueries } = await chrome.storage.local.get(['selectedQueries']);
    await chrome.storage.local.set({
      selectedQueries: [...(selectedQueries || []), info.selectionText]
    });
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: 'Privacy Shield', message: 'Query added to selection'
    });
  }
});

chrome.runtime.onSuspend.addListener(() => {
  stopQueryExecution();
});

console.log('Privacy Shield background service worker loaded');
