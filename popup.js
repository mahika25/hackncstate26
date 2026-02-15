// Configuration
const API_BASE_URL = 'http://localhost:5001';

// DOM Elements
let uploadArea, fileInput, fileInfo, analyzeBtn;
let personaCard, personaStatus, viewPersonasBtn, executeQueriesBtn;
let statsCard, queriesExecuted, profileScore;
let dashboardBtn, settingsBtn, startAutoBtn;
let statusMessage, loading;

// State
let currentFile = null;
let uploadedHistory = null;
let generatedPersonas = null;
let selectedQueries = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  setupEventListeners();
  loadStoredData();
});

function initializeElements() {
  uploadArea = document.getElementById('uploadArea');
  fileInput = document.getElementById('fileInput');
  fileInfo = document.getElementById('fileInfo');
  analyzeBtn = document.getElementById('analyzeBtn');
  
  personaCard = document.getElementById('personaCard');
  personaStatus = document.getElementById('personaStatus');
  viewPersonasBtn = document.getElementById('viewPersonasBtn');
  executeQueriesBtn = document.getElementById('executeQueriesBtn');
  
  statsCard = document.getElementById('statsCard');
  queriesExecuted = document.getElementById('queriesExecuted');
  profileScore = document.getElementById('profileScore');
  
  dashboardBtn = document.getElementById('dashboardBtn');
  settingsBtn = document.getElementById('settingsBtn');
  startAutoBtn = document.getElementById('startAutoBtn');
  
  statusMessage = document.getElementById('statusMessage');
  loading = document.getElementById('loading');
}

function setupEventListeners() {
  // File upload
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', handleDragOver);
  uploadArea.addEventListener('dragleave', handleDragLeave);
  uploadArea.addEventListener('drop', handleDrop);
  fileInput.addEventListener('change', handleFileSelect);
  
  // Buttons
  analyzeBtn.addEventListener('click', analyzeSearchHistory);
  viewPersonasBtn.addEventListener('click', openPersonaSelector);
  executeQueriesBtn.addEventListener('click', executeSelectedQueries);
  dashboardBtn.addEventListener('click', openDashboard);
  settingsBtn.addEventListener('click', openSettings);
  startAutoBtn.addEventListener('click', toggleAutoMode);
}

// File handling
function handleDragOver(e) {
  e.preventDefault();
  uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
  }
}

function handleFile(file) {
  if (!file.name.endsWith('.json')) {
    showStatus('Please upload a JSON file', 'error');
    return;
  }
  
  currentFile = file;
  fileInfo.textContent = `📄 ${file.name} (${formatFileSize(file.size)})`;
  fileInfo.style.display = 'block';
  analyzeBtn.disabled = false;
  
  // Read file content
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      uploadedHistory = JSON.parse(e.target.result);
      showStatus('File loaded successfully', 'success');
    } catch (error) {
      showStatus('Invalid JSON format', 'error');
      analyzeBtn.disabled = true;
    }
  };
  reader.readAsText(file);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// API calls
async function analyzeSearchHistory() {
  if (!uploadedHistory) {
    showStatus('Please upload a file first', 'error');
    return;
  }
  
  showLoading(true);
  analyzeBtn.disabled = true;
  
  try {
    // Parse search history
    const searches = parseSearchHistory(uploadedHistory);
    
    console.log('📤 Sending searches to backend:', searches.length);
    
    // Send to backend for analysis
    const response = await fetch(`${API_BASE_URL}/api/analyze-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searches })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Analysis failed');
    }
    
    const data = await response.json();
    console.log('✅ Profile received:', data);
    
    // Store initial profile
    await chrome.storage.local.set({
      initialProfile: data.profile,
      profileTimestamp: Date.now()
    });
    
    showStatus('Initial profile created successfully', 'success');
    
    // Generate inverse personas
    await generatePersonas(data.profile);
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
    showStatus(`Failed: ${error.message}. Make sure backend is running.`, 'error');
    analyzeBtn.disabled = false;
  } finally {
    showLoading(false);
  }
}

async function generatePersonas(initialProfile) {
  showLoading(true);
  
  try {
    console.log('📤 Requesting persona generation...');
    
    const response = await fetch(`${API_BASE_URL}/api/generate-personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        profile: initialProfile,
        count: 3 
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Persona generation failed');
    }
    
    const data = await response.json();
    console.log('✅ Personas received:', data);
    
    generatedPersonas = data.personas;
    
    // Validate personas have queries
    const totalQueries = generatedPersonas.reduce((sum, p) => sum + (p.queries?.length || 0), 0);
    console.log(`📊 Total queries across all personas: ${totalQueries}`);
    
    if (totalQueries === 0) {
      throw new Error('No queries were generated. Check backend logs.');
    }
    
    // Store personas
    await chrome.storage.local.set({
      personas: generatedPersonas,
      personasTimestamp: Date.now()
    });
    
    // Update UI
    displayPersonas();
    showStatus(`${generatedPersonas.length} personas with ${totalQueries} queries generated!`, 'success');
    
  } catch (error) {
    console.error('❌ Persona generation error:', error);
    showStatus(`Failed to generate personas: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

function displayPersonas() {
  personaCard.style.display = 'block';
  statsCard.style.display = 'block';
  
  const totalQueries = generatedPersonas.reduce((sum, p) => sum + (p.queries?.length || 0), 0);
  personaStatus.innerHTML = `
    <span class="persona-count">${generatedPersonas.length}</span> personas with 
    <span class="persona-count">${totalQueries}</span> total queries generated
  `;
  
  viewPersonasBtn.disabled = false;
  
  console.log('✅ Personas displayed, button enabled');
}

function parseSearchHistory(data) {
  // Support multiple formats
  let searches = [];
  
  // Google Takeout format
  if (Array.isArray(data)) {
    searches = data.map(item => ({
      query: item.title || item.query || item.titleUrl || '',
      timestamp: item.time || item.timestamp || Date.now()
    }));
  }
  // Custom format
  else if (data.searches) {
    searches = data.searches;
  }
  // Simple array of strings
  else if (typeof data === 'object' && data.queries) {
    searches = data.queries.map(q => ({
      query: q,
      timestamp: Date.now()
    }));
  }
  
  return searches.filter(s => s.query && s.query.trim().length > 0);
}

// Persona selector - FIXED VERSION
async function openPersonaSelector() {
  console.log('🎭 Opening persona selector...');
  
  try {
    // First, store personas in a way the selector can access them
    await chrome.storage.local.set({
      tempPersonas: generatedPersonas
    });
    
    console.log('✅ Personas stored, opening window...');
    
    // Open the selector window directly
    chrome.windows.create({
      url: chrome.runtime.getURL('persona-selector.html'),
      type: 'popup',
      width: 1000,
      height: 700,
      left: Math.round((screen.availWidth - 1000) / 2),
      top: Math.round((screen.availHeight - 700) / 2)
    }, (window) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Error opening window:', chrome.runtime.lastError);
        showStatus('Failed to open selector window', 'error');
      } else {
        console.log('✅ Selector window opened:', window.id);
      }
    });
    
  } catch (error) {
    console.error('❌ Error in openPersonaSelector:', error);
    showStatus('Failed to open persona selector', 'error');
  }
}

// Query execution
async function executeSelectedQueries() {
  const { selectedQueries: stored } = await chrome.storage.local.get(['selectedQueries']);
  
  if (!stored || stored.length === 0) {
    showStatus('Please select queries first', 'error');
    return;
  }
  
  showLoading(true);
  executeQueriesBtn.disabled = true;
  
  try {
    // Send queries to background script for execution
    chrome.runtime.sendMessage({
      action: 'executeQueries',
      queries: stored
    }, async (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Error sending message:', chrome.runtime.lastError);
        showStatus('Failed to start query execution', 'error');
        executeQueriesBtn.disabled = false;
        showLoading(false);
        return;
      }
      
      if (response && response.success) {
        showStatus(`Executing ${stored.length} queries...`, 'info');
        
        // Wait for queries to complete
        setTimeout(async () => {
          await updateProfile();
        }, 5000);
      } else {
        showStatus('Failed to start query execution', 'error');
        executeQueriesBtn.disabled = false;
      }
    });
    
  } catch (error) {
    console.error('Query execution error:', error);
    showStatus('Failed to execute queries', 'error');
    executeQueriesBtn.disabled = false;
  } finally {
    showLoading(false);
  }
}

async function updateProfile() {
  try {
    // Get executed queries from storage
    const { executedQueries, initialProfile } = await chrome.storage.local.get([
      'executedQueries',
      'initialProfile'
    ]);
    
    // Combine original history with new queries
    const combinedHistory = [
      ...(uploadedHistory || []),
      ...(executedQueries || [])
    ];
    
    // Send to backend for updated profile
    const response = await fetch(`${API_BASE_URL}/api/analyze-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        searches: parseSearchHistory(combinedHistory)
      })
    });
    
    if (!response.ok) throw new Error('Profile update failed');
    
    const data = await response.json();
    
    // Store updated profile
    await chrome.storage.local.set({
      updatedProfile: data.profile,
      updatedTimestamp: Date.now()
    });
    
    // Calculate comparison
    await calculateProfileComparison(initialProfile, data.profile);
    
    showStatus('Profile updated successfully', 'success');
    executeQueriesBtn.disabled = false;
    
  } catch (error) {
    console.error('Profile update error:', error);
    showStatus('Failed to update profile', 'error');
  }
}

async function calculateProfileComparison(initial, updated) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/compare-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        initialProfile: initial,
        updatedProfile: updated
      })
    });
    
    if (!response.ok) throw new Error('Comparison failed');
    
    const comparisonData = await response.json();
    const comparison = comparisonData.comparison;
    
    // Store comparison
    await chrome.storage.local.set({
      profileComparison: comparison,
      comparisonTimestamp: Date.now()
    });
    
    // Update stats
    updateStats(comparison);
    
  } catch (error) {
    console.error('Comparison error:', error);
  }
}

function updateStats(comparison) {
  chrome.storage.local.get(['executedQueries'], (data) => {
    queriesExecuted.textContent = data.executedQueries?.length || 0;
  });
  profileScore.textContent = Math.round(comparison.obfuscation_score || 0) + '%';
}

// Navigation
function openDashboard() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard.html')
  });
}

function openSettings() {
  chrome.windows.create({
    url: chrome.runtime.getURL('settings.html'),
    type: 'popup',
    width: 600,
    height: 700
  });
}

// Auto mode
async function toggleAutoMode() {
  const { autoMode } = await chrome.storage.local.get(['autoMode']);
  const newMode = !autoMode;
  
  await chrome.storage.local.set({ autoMode: newMode });
  
  startAutoBtn.textContent = newMode ? '⏸️ Stop Auto Mode' : '🤖 Start Auto Mode';
  startAutoBtn.style.background = newMode ? 'rgba(245, 101, 101, 0.3)' : 'rgba(255, 255, 255, 0.2)';
  
  // Notify background script
  chrome.runtime.sendMessage({
    action: 'toggleAutoMode',
    enabled: newMode
  });
  
  showStatus(`Auto mode ${newMode ? 'enabled' : 'disabled'}`, 'info');
}

// UI helpers
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.style.display = 'block';
  
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 5000);
}

function showLoading(show) {
  loading.style.display = show ? 'block' : 'none';
}

// Load stored data on popup open
async function loadStoredData() {
  try {
    const data = await chrome.storage.local.get([
      'personas',
      'initialProfile',
      'executedQueries',
      'selectedQueries',
      'autoMode'
    ]);
    
    if (data.personas) {
      generatedPersonas = data.personas;
      displayPersonas();
    }
    
    if (data.executedQueries) {
      queriesExecuted.textContent = data.executedQueries.length;
    }
    
    if (data.selectedQueries && data.selectedQueries.length > 0) {
      executeQueriesBtn.disabled = false;
    }
    
    if (data.autoMode) {
      startAutoBtn.textContent = '⏸️ Stop Auto Mode';
      startAutoBtn.style.background = 'rgba(245, 101, 101, 0.3)';
    }
    
    if (data.initialProfile) {
      statsCard.style.display = 'block';
    }
    
  } catch (error) {
    console.error('Error loading stored data:', error);
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'queriesComplete') {
    showStatus(`Completed ${message.count} queries`, 'success');
    // Update the executed count directly; obfuscation score comes from profile comparison
    chrome.storage.local.get(['executedQueries'], (data) => {
      queriesExecuted.textContent = data.executedQueries?.length || 0;
    });
    executeQueriesBtn.disabled = false;
    showLoading(false);
  }
  
  if (message.action === 'queryProgress') {
    showStatus(`Progress: ${message.current}/${message.total}`, 'info');
  }
  
  if (message.action === 'queriesSelected') {
    console.log('✅ Queries selected from selector');
    executeQueriesBtn.disabled = false;
    showStatus(`${message.count} queries selected and ready`, 'success');
  }
});