// Configuration
const API_BASE_URL = 'http://localhost:5001';

// DOM refs
let uploadArea, fileInput, fileInfo, analyzeBtn;
let personaCard, personaStatus, viewPersonasBtn, executeQueriesBtn;
let stopBtn, resumeBtn, progressSection, progressFill, progressText;
let addPersonaBtn, deletePersonaBtn;
let statsCard, queriesExecuted, profileScore;
let dashboardBtn, settingsBtn;
let statusMessage, loading, loadingText;

// State
let uploadedHistory = null;
let generatedPersonas = null;


document.addEventListener('DOMContentLoaded', async () => {
  initElements();
  setupListeners();

  await chrome.storage.local.set({ selectedQueries: [] });

  await loadStoredData();
  startStatusPolling();
});

function initElements() {
  uploadArea = document.getElementById('uploadArea');
  fileInput = document.getElementById('fileInput');
  fileInfo = document.getElementById('fileInfo');
  analyzeBtn = document.getElementById('analyzeBtn');

  personaCard = document.getElementById('personaCard');
  personaStatus = document.getElementById('personaStatus');
  viewPersonasBtn = document.getElementById('viewPersonasBtn');
  executeQueriesBtn = document.getElementById('executeQueriesBtn');
  stopBtn = document.getElementById('stopBtn');
  resumeBtn = document.getElementById('resumeBtn');
  progressSection = document.getElementById('progressSection');
  progressFill = document.getElementById('progressFill');
  progressText = document.getElementById('progressText');
  addPersonaBtn = document.getElementById('addPersonaBtn');
  deletePersonaBtn = document.getElementById('deletePersonaBtn');

  statsCard = document.getElementById('statsCard');
  queriesExecuted = document.getElementById('queriesExecuted');
  profileScore = document.getElementById('profileScore');

  dashboardBtn = document.getElementById('dashboardBtn');
  settingsBtn = document.getElementById('settingsBtn');

  statusMessage = document.getElementById('statusMessage');
  loading = document.getElementById('loading');
  loadingText = document.getElementById('loadingText');
}

function setupListeners() {
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', e => { e.preventDefault(); uploadArea.classList.remove('dragover'); });
  uploadArea.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

  analyzeBtn.addEventListener('click', analyzeSearchHistory);
  viewPersonasBtn.addEventListener('click', openPersonaSelector);
  executeQueriesBtn.addEventListener('click', executeSelectedQueries);
  stopBtn.addEventListener('click', stopExecution);
  resumeBtn.addEventListener('click', resumeExecution);

  addPersonaBtn.addEventListener('click', addNewPersona);
  deletePersonaBtn.addEventListener('click', deleteLastPersona);

  dashboardBtn.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }));
  settingsBtn.addEventListener('click', () => chrome.windows.create({ url: chrome.runtime.getURL('settings.html'), type: 'popup', width: 600, height: 700 }));
}


let pollTimer = null;

function startStatusPolling() {
  pollTimer = setInterval(refreshStatus, 2000);
}

async function refreshStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
    updateUIFromStatus(status);
  } catch (e) {
  }
}

function updateUIFromStatus(status) {
  if (!status) return;

  const { isExecuting: running, executionState, totalExecuted } = status;

  if (running) {
    stopBtn.style.display = 'block';
    executeQueriesBtn.style.display = 'none';
    resumeBtn.style.display = 'none';
  } else if (executionState && executionState.currentIndex < executionState.total) {
    stopBtn.style.display = 'none';
    executeQueriesBtn.style.display = 'none';
    resumeBtn.style.display = 'block';
  } else {
    stopBtn.style.display = 'none';
    resumeBtn.style.display = 'none';
    executeQueriesBtn.style.display = 'block';
  }

  if (running && executionState) {
    progressSection.style.display = 'block';
    const pct = (executionState.currentIndex / executionState.total) * 100;
    progressFill.style.width = pct + '%';
    progressText.textContent = `${executionState.currentIndex} / ${executionState.total}`;
  } else if (executionState && executionState.currentIndex < executionState.total) {
    progressSection.style.display = 'block';
    const pct = (executionState.currentIndex / executionState.total) * 100;
    progressFill.style.width = pct + '%';
    progressText.textContent = `Paused at ${executionState.currentIndex} / ${executionState.total}`;
  } else {
    progressSection.style.display = 'none';
  }

  queriesExecuted.textContent = totalExecuted;
}


function handleFile(file) {
  if (!file.name.endsWith('.json')) {
    showStatus('Please upload a JSON file', 'error');
    return;
  }
  fileInfo.textContent = `📄 ${file.name} (${formatSize(file.size)})`;
  fileInfo.style.display = 'block';
  analyzeBtn.disabled = false;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      uploadedHistory = JSON.parse(e.target.result);
      showStatus('File loaded successfully', 'success');
    } catch {
      showStatus('Invalid JSON format', 'error');
      analyzeBtn.disabled = true;
    }
  };
  reader.readAsText(file);
}

function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

async function analyzeSearchHistory() {
  if (!uploadedHistory) return showStatus('Upload a file first', 'error');

  showLoading(true, 'Analyzing search history...');
  analyzeBtn.disabled = true;

  try {
    const searches = parseSearchHistory(uploadedHistory);
    const resp = await fetch(`${API_BASE_URL}/api/analyze-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searches })
    });
    if (!resp.ok) throw new Error((await resp.json()).error || 'Analysis failed');

    const { profile } = await resp.json();
    await chrome.storage.local.set({ initialProfile: profile, profileTimestamp: Date.now() });
    showStatus('Profile created – generating personas...', 'success');

    await generatePersonas(profile);
  } catch (e) {
    showStatus(`Failed: ${e.message}. Is the backend running?`, 'error');
    analyzeBtn.disabled = false;
  } finally {
    showLoading(false);
  }
}

async function generatePersonas(profile) {
  showLoading(true, 'Generating inverse personas...');
  try {
    const resp = await fetch(`${API_BASE_URL}/api/generate-personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, count: 3 })
    });
    if (!resp.ok) throw new Error((await resp.json()).error || 'Generation failed');

    const data = await resp.json();
    generatedPersonas = data.personas;

    const totalQ = generatedPersonas.reduce((s, p) => s + (p.queries?.length || 0), 0);
    if (totalQ === 0) throw new Error('No queries generated. Check backend.');

    await chrome.storage.local.set({ personas: generatedPersonas, personasTimestamp: Date.now() });
    displayPersonas();
    showStatus(`${generatedPersonas.length} personas with ${totalQ} queries generated!`, 'success');
  } catch (e) {
    showStatus(`Persona error: ${e.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

function displayPersonas() {
  personaCard.style.display = 'block';
  statsCard.style.display = 'block';

  const totalQ = generatedPersonas.reduce((s, p) => s + (p.queries?.length || 0), 0);
  personaStatus.innerHTML = `
    <span class="persona-count">${generatedPersonas.length}</span> personas with
    <span class="persona-count">${totalQ}</span> total queries
  `;
  viewPersonasBtn.disabled = false;
}

function parseSearchHistory(data) {
  let searches = [];
  if (Array.isArray(data)) {
    searches = data.map(item => ({
      query: item.title || item.query || item.titleUrl || '',
      timestamp: item.time || item.timestamp || Date.now()
    }));
  } else if (data.searches) {
    searches = data.searches;
  } else if (data.queries) {
    searches = data.queries.map(q => ({ query: q, timestamp: Date.now() }));
  }
  return searches.filter(s => s.query && s.query.trim().length > 0);
}

async function openPersonaSelector() {
  await chrome.storage.local.set({ tempPersonas: generatedPersonas });
  chrome.windows.create({
    url: chrome.runtime.getURL('persona-selector.html'),
    type: 'popup', width: 1000, height: 700,
    left: Math.round((screen.availWidth - 1000) / 2),
    top: Math.round((screen.availHeight - 700) / 2)
  });
}

async function executeSelectedQueries() {
  const { selectedQueries: stored } = await chrome.storage.local.get(['selectedQueries']);
  if (!stored || stored.length === 0) return showStatus('Select queries first', 'error');

  executeQueriesBtn.disabled = true;
  showStatus(`Executing ${stored.length} queries...`, 'info');

  chrome.runtime.sendMessage({ action: 'executeQueries', queries: stored });
}

function stopExecution() {
  chrome.runtime.sendMessage({ action: 'stopExecution' });
  showStatus('Stopping...', 'info');
}

function resumeExecution() {
  chrome.runtime.sendMessage({ action: 'resumeExecution' });
  showStatus('Resuming...', 'info');
}

async function addNewPersona() {
  const { initialProfile } = await chrome.storage.local.get(['initialProfile']);
  if (!initialProfile) return showStatus('Analyze history first', 'error');

  showLoading(true, 'Generating new persona...');
  const result = await chrome.runtime.sendMessage({ action: 'regeneratePersona', profile: initialProfile });
  showLoading(false);

  if (result.success) {
    generatedPersonas = result.personas;
    displayPersonas();
    showStatus('New persona added!', 'success');
  } else {
    showStatus(`Failed: ${result.error}`, 'error');
  }
}

async function deleteLastPersona() {
  if (!generatedPersonas || generatedPersonas.length === 0) return;

  const idx = generatedPersonas.length - 1;
  const result = await chrome.runtime.sendMessage({ action: 'deletePersona', personaIndex: idx });
  if (result.success) {
    generatedPersonas = result.personas;
    displayPersonas();
    showStatus('Persona deleted', 'info');
    if (generatedPersonas.length === 0) {
      personaCard.style.display = 'none';
    }
  }
}

function showStatus(msg, type) {
  statusMessage.textContent = msg;
  statusMessage.className = `status ${type}`;
  statusMessage.style.display = 'block';
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => { statusMessage.style.display = 'none'; }, 5000);
}

function showLoading(show, text) {
  loading.style.display = show ? 'block' : 'none';
  if (text) loadingText.textContent = text;
}

async function loadStoredData() {
  const data = await chrome.storage.local.get([
    'personas', 'initialProfile', 'executedQueries', 'profileComparison'
  ]);

  if (data.personas && data.personas.length > 0) {
    generatedPersonas = data.personas;
    displayPersonas();
  }

  if (data.executedQueries) {
    queriesExecuted.textContent = data.executedQueries.length;
  }

  if (data.profileComparison) {
    profileScore.textContent = Math.round(data.profileComparison.obfuscation_score || 0) + '%';
  }

  if (data.initialProfile) {
    statsCard.style.display = 'block';
  }

  const { selectedQueries } = await chrome.storage.local.get(['selectedQueries']);
  if (selectedQueries && selectedQueries.length > 0) {
    executeQueriesBtn.disabled = false;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'queriesComplete') {
    if (msg.finished) {
      showStatus(`Completed all ${msg.count} queries`, 'success');
    } else {
      showStatus(`Stopped after ${msg.count} queries – resume anytime`, 'info');
    }
    executeQueriesBtn.disabled = false;
    showLoading(false);
  }

  if (msg.action === 'queryProgress') {
    progressSection.style.display = 'block';
    const pct = (msg.current / msg.total) * 100;
    progressFill.style.width = pct + '%';
    progressText.textContent = `${msg.current} / ${msg.total}`;
  }

  if (msg.action === 'queriesSelected') {
    executeQueriesBtn.disabled = false;
    showStatus(`${msg.count} queries selected and ready`, 'success');
  }
});
