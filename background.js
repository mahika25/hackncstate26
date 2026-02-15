// Background Service Worker for Privacy Shield Extension

const API_BASE_URL = 'http://localhost:5001';
const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q='
};

// State management
let queryQueue = [];
let isExecuting = false;
let autoModeInterval = null;

// Installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Privacy Shield installed:', details.reason);
  
  // Initialize storage
  chrome.storage.local.set({
    executedQueries: [],
    selectedQueries: [],
    autoMode: false,
    settings: {
      searchEngine: 'google',
      delayBetweenQueries: 3000,
      queriesPerSession: 10,
      autoModeInterval: 3600000 // 1 hour
    }
  });
  
  // Create alarm for periodic tasks
  chrome.alarms.create('periodicCheck', { periodInMinutes: 60 });
});

// Message handling from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message.action);
  
  switch (message.action) {
    case 'executeQueries':
      handleExecuteQueries(message.queries);
      sendResponse({ success: true });
      break;
      
    case 'openPersonaSelector':
      openPersonaSelector(message.personas);
      sendResponse({ success: true });
      break;
      
    case 'toggleAutoMode':
      handleAutoModeToggle(message.enabled);
      sendResponse({ success: true });
      break;
      
    case 'stopExecution':
      stopQueryExecution();
      sendResponse({ success: true });
      break;
      
    case 'getStatus':
      getExecutionStatus().then(status => sendResponse(status));
      return true; // Keep channel open for async response
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

// Query execution
async function handleExecuteQueries(queries) {
  if (isExecuting) {
    console.log('Already executing queries');
    return;
  }
  
  queryQueue = [...queries];
  isExecuting = true;
  
  const { settings } = await chrome.storage.local.get(['settings']);
  const delay = settings?.delayBetweenQueries || 3000;
  const searchEngine = settings?.searchEngine || 'google';
  
  console.log(`Starting execution of ${queryQueue.length} queries`);
  
  let completed = 0;
  const executedQueries = [];
  
  for (const query of queryQueue) {
    if (!isExecuting) break; // Stop if cancelled
    
    try {
      await executeQuery(query, searchEngine);
      executedQueries.push({
        query: query,
        timestamp: Date.now(),
        searchEngine: searchEngine
      });
      
      completed++;
      
      // Notify popup of progress
      chrome.runtime.sendMessage({
        action: 'queryProgress',
        current: completed,
        total: queryQueue.length
      });
      
      // Wait between queries
      if (completed < queryQueue.length) {
        await sleep(delay);
      }
      
    } catch (error) {
      console.error('Query execution error:', error);
    }
  }
  
  // Store executed queries
  const { executedQueries: existing } = await chrome.storage.local.get(['executedQueries']);
  await chrome.storage.local.set({
    executedQueries: [...(existing || []), ...executedQueries]
  });
  
  isExecuting = false;
  
  // Notify completion
  chrome.runtime.sendMessage({
    action: 'queriesComplete',
    count: completed,
    stats: {
      executed: completed,
      failed: queryQueue.length - completed
    }
  });
  
  console.log(`Completed ${completed} of ${queryQueue.length} queries`);
}

async function executeQuery(query, searchEngine = 'google') {
  const searchUrl = SEARCH_ENGINES[searchEngine] + encodeURIComponent(query);
  const { settings } = await chrome.storage.local.get(['settings']);
  const shouldCloseTabs = settings?.closeTabs !== false;
  
  return new Promise((resolve, reject) => {
    // Create a new tab for the search
    chrome.tabs.create({
      url: searchUrl,
      active: false // Open in background
    }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      let settled = false;
      
      function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          if (settled) return;
          settled = true;
          chrome.tabs.onUpdated.removeListener(listener);
          
          // Keep tab open for a few seconds to simulate real browsing
          setTimeout(() => {
            if (shouldCloseTabs) {
              chrome.tabs.remove(tab.id).catch(err => {
                console.log('Tab already closed:', err);
              });
            }
            resolve();
          }, 2000);
        }
      }

      chrome.tabs.onUpdated.addListener(listener);
      
      // Safety timeout — also clean up the listener
      setTimeout(() => {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(listener);
        if (shouldCloseTabs) {
          chrome.tabs.remove(tab.id).catch(() => {});
        }
        resolve();
      }, 15000);
    });
  });
}

function stopQueryExecution() {
  isExecuting = false;
  queryQueue = [];
  console.log('Query execution stopped');
}

// Persona selector
function openPersonaSelector(personas) {
  const width = 800;
  const height = 600;
  
  chrome.windows.create({
    url: chrome.runtime.getURL('persona-selector.html'),
    type: 'popup',
    width: width,
    height: height,
    left: Math.round((screen.width - width) / 2),
    top: Math.round((screen.height - height) / 2)
  }, (window) => {
    // Store personas for the selector to access
    chrome.storage.local.set({
      tempPersonas: personas,
      selectorWindowId: window.id
    });
  });
}

// Auto mode
async function handleAutoModeToggle(enabled) {
  await chrome.storage.local.set({ autoMode: enabled });
  
  if (enabled) {
    startAutoMode();
  } else {
    stopAutoMode();
  }
}

async function startAutoMode() {
  const { settings } = await chrome.storage.local.get(['settings']);
  const intervalMinutes = (settings?.autoModeInterval || 3600000) / 60000;

  chrome.alarms.create('autoMode', { periodInMinutes: intervalMinutes });
  await executeAutoQueries(); // run immediately
}

function stopAutoMode() {
  chrome.alarms.clear('autoMode');
}

async function executeAutoQueries() {
  console.log('Executing auto queries');
  
  const { selectedQueries, settings } = await chrome.storage.local.get([
    'selectedQueries',
    'settings'
  ]);
  
  if (!selectedQueries || selectedQueries.length === 0) {
    console.log('No queries selected for auto mode');
    return;
  }
  
  const queriesPerSession = settings?.queriesPerSession || 10;
  const queriesToExecute = selectedQueries
    .sort(() => Math.random() - 0.5) // Randomize
    .slice(0, queriesPerSession);
  
  await handleExecuteQueries(queriesToExecute);
}

// Alarm handling for periodic tasks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodicCheck' || alarm.name === 'autoMode') {
    const { autoMode } = await chrome.storage.local.get(['autoMode']);
    if (autoMode && !isExecuting) {
      await executeAutoQueries();
    }
  }
});

// Status reporting
async function getExecutionStatus() {
  const data = await chrome.storage.local.get([
    'executedQueries',
    'selectedQueries',
    'autoMode'
  ]);
  
  return {
    isExecuting: isExecuting,
    queueLength: queryQueue.length,
    totalExecuted: data.executedQueries?.length || 0,
    totalSelected: data.selectedQueries?.length || 0,
    autoMode: data.autoMode || false
  };
}

// Utility functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Context menu integration (optional)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addToPersona',
    title: 'Add to Privacy Shield',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'addToPersona' && info.selectionText) {
    const { selectedQueries } = await chrome.storage.local.get(['selectedQueries']);
    const updated = [...(selectedQueries || []), info.selectionText];
    
    await chrome.storage.local.set({ selectedQueries: updated });
    
    // Notify user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Privacy Shield',
      message: 'Query added to selection'
    });
  }
});

// Error handling
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending, cleaning up...');
  stopAutoMode();
  stopQueryExecution();
});

console.log('Privacy Shield background service worker loaded');