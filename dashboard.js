// Dashboard JavaScript — auto-refreshes every 3 seconds

let refreshTimer = null;

// ── Init ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('addPersonaBtn').addEventListener('click', addPersona);
  document.getElementById('execAction').addEventListener('click', handleExecAction);

  refresh();
  refreshTimer = setInterval(refresh, 3000);
});

// ── Main refresh ───────────────────────────────────────────────────

async function refresh() {
  try {
    const data = await chrome.storage.local.get([
      'initialProfile', 'updatedProfile', 'profileComparison',
      'executedQueries', 'personas', 'executionState',
      'selectedQueries'
    ]);

    // Also get live status from background
    let liveStatus = null;
    try {
      liveStatus = await chrome.runtime.sendMessage({ action: 'getStatus' });
    } catch (e) { /* background may not be ready */ }

    const hasData = data.initialProfile || (data.personas && data.personas.length > 0) ||
                    (data.executedQueries && data.executedQueries.length > 0);

    if (!hasData) {
      showEmptyState();
      return;
    }

    hideEmptyState();
    updateExecBanner(liveStatus, data.executionState);
    updateMetrics(data, liveStatus);
    updatePersonaList(data.personas || []);
    updateTimeline(data.executedQueries || [], data.personas || []);
    updateComparisonTable(data.profileComparison);
    updateRecommendation(data.profileComparison);

    // Tick indicator
    const ind = document.getElementById('refreshIndicator');
    ind.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    console.error('Dashboard refresh error:', e);
  }
}

// ── Execution Banner ───────────────────────────────────────────────

function updateExecBanner(status, execState) {
  const banner = document.getElementById('execBanner');
  const label = document.getElementById('execLabel');
  const progress = document.getElementById('execProgress');
  const count = document.getElementById('execCount');
  const btn = document.getElementById('execAction');

  const running = status?.isExecuting;
  const paused = execState && execState.currentIndex < execState.total && !running;

  if (running && execState) {
    banner.className = 'exec-banner running';
    const pct = (execState.currentIndex / execState.total) * 100;
    label.textContent = '⏳ Executing queries...';
    progress.style.width = pct + '%';
    count.textContent = `${execState.currentIndex} / ${execState.total}`;
    btn.textContent = '⏹ Stop';
    btn.className = 'btn-stop';
    btn.dataset.action = 'stop';
  } else if (paused) {
    banner.className = 'exec-banner paused';
    const pct = (execState.currentIndex / execState.total) * 100;
    label.textContent = '⏸ Paused';
    progress.style.width = pct + '%';
    count.textContent = `${execState.currentIndex} / ${execState.total}`;
    btn.textContent = '▶️ Resume';
    btn.className = 'btn-resume';
    btn.dataset.action = 'resume';
  } else {
    banner.className = 'exec-banner idle';
  }
}

function handleExecAction() {
  const btn = document.getElementById('execAction');
  if (btn.dataset.action === 'stop') {
    chrome.runtime.sendMessage({ action: 'stopExecution' });
  } else if (btn.dataset.action === 'resume') {
    chrome.runtime.sendMessage({ action: 'resumeExecution' });
  }
}

// ── Metrics ────────────────────────────────────────────────────────

function updateMetrics(data, status) {
  const comparison = data.profileComparison;
  const obfScore = comparison?.obfuscation_score || 0;

  document.getElementById('obfuscationScore').textContent = Math.round(obfScore) + '%';
  const change = document.getElementById('scoreChange');
  if (obfScore > 0) {
    change.textContent = `↑ ${Math.round(obfScore)}% from baseline`;
  } else {
    change.textContent = 'Run queries to see changes';
  }

  document.getElementById('metricExecuted').textContent = data.executedQueries?.length || 0;
  document.getElementById('metricPersonas').textContent = data.personas?.length || 0;
}

// ── Persona List ───────────────────────────────────────────────────

function updatePersonaList(personas) {
  const container = document.getElementById('personaList');

  if (!personas.length) {
    container.innerHTML = '<p style="color:#6c757d;">No personas yet. Generate them from the popup.</p>';
    return;
  }

  container.innerHTML = personas.map((p, i) => {
    const qCount = p.queries?.length || 0;
    return `
      <div class="persona-item" data-index="${i}">
        <div class="persona-item-info">
          <div class="persona-item-title">${escapeHtml(p.title || 'Persona ' + (i + 1))}</div>
          <div class="persona-item-meta">${qCount} queries · ${p.category || 'General'}</div>
        </div>
        <button class="delete-persona-btn" data-index="${i}">🗑️ Delete</button>
      </div>
    `;
  }).join('');

  // Bind delete buttons
  container.querySelectorAll('.delete-persona-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.dataset.index);
      const result = await chrome.runtime.sendMessage({ action: 'deletePersona', personaIndex: idx });
      if (result.success) refresh();
    });
  });
}

async function addPersona() {
  const { initialProfile } = await chrome.storage.local.get(['initialProfile']);
  if (!initialProfile) {
    alert('Analyze your search history first from the popup.');
    return;
  }

  const btn = document.getElementById('addPersonaBtn');
  btn.textContent = 'Generating...';
  btn.disabled = true;

  const result = await chrome.runtime.sendMessage({ action: 'regeneratePersona', profile: initialProfile });

  btn.textContent = '+ New Persona';
  btn.disabled = false;

  if (result.success) {
    refresh();
  } else {
    alert('Failed: ' + result.error);
  }
}

// ── Timeline ───────────────────────────────────────────────────────

function updateTimeline(executedQueries, personas) {
  const container = document.getElementById('timeline');
  const events = [];

  // Persona creation events
  personas.forEach((p, i) => {
    if (p.created_at) {
      events.push({
        time: new Date(p.created_at),
        text: `🎭 Generated persona: ${p.title || 'Persona ' + (i + 1)}`
      });
    }
  });

  // Group executed queries by day
  const byDay = {};
  (executedQueries || []).forEach(q => {
    const d = new Date(q.timestamp);
    const key = d.toLocaleDateString();
    if (!byDay[key]) byDay[key] = { date: d, count: 0, queries: [] };
    byDay[key].count++;
    if (byDay[key].queries.length < 3) byDay[key].queries.push(q.query);
  });

  Object.values(byDay).forEach(g => {
    const preview = g.queries.map(q => `"${q}"`).join(', ');
    events.push({
      time: g.date,
      text: `🔍 Executed ${g.count} queries (${preview}${g.count > 3 ? '...' : ''})`
    });
  });

  events.sort((a, b) => b.time - a.time);

  if (events.length === 0) {
    container.innerHTML = '<p style="color:#6c757d;text-align:center;padding:20px;">No activity yet.</p>';
    return;
  }

  container.innerHTML = events.slice(0, 15).map(ev => `
    <div class="timeline-item">
      <div class="timeline-content">
        <div class="timeline-time">${formatTimeAgo(ev.time)}</div>
        <div class="timeline-text">${escapeHtml(ev.text)}</div>
      </div>
    </div>
  `).join('');
}

// ── Comparison Table ───────────────────────────────────────────────

function updateComparisonTable(comparison) {
  const tbody = document.querySelector('#comparisonTable tbody');
  if (!comparison || !comparison.demographic_changes) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#6c757d;text-align:center;padding:20px;">Run queries then check for profile changes</td></tr>';
    return;
  }

  const labels = {
    age_range: '👤 Age Range', gender: '⚧ Gender',
    profession: '💼 Profession', marital_status: '💑 Marital Status'
  };

  const deltas = comparison.confidence_deltas || {};

  tbody.innerHTML = Object.entries(comparison.demographic_changes).map(([key, val]) => {
    const d = deltas[key] || {};
    const iConf = d.initial_confidence || 0;
    const uConf = d.updated_confidence || 0;
    const delta = d.delta || 0;
    const cls = delta < 0 ? 'negative' : delta > 0 ? 'positive' : 'neutral';
    const sign = delta < 0 ? '' : '+';

    return `<tr>
      <td><strong>${labels[key] || key}</strong></td>
      <td>
        ${val.initial || '?'}
        <div class="confidence-bar"><div class="confidence-fill" style="width:${iConf * 100}%"></div></div>
        <small style="color:#6c757d">${Math.round(iConf * 100)}%</small>
      </td>
      <td>
        ${val.updated || '?'}
        <div class="confidence-bar"><div class="confidence-fill" style="width:${uConf * 100}%"></div></div>
        <small style="color:#6c757d">${Math.round(uConf * 100)}%</small>
      </td>
      <td><span class="delta ${cls}">${sign}${Math.round(Math.abs(delta) * 100)}%</span></td>
    </tr>`;
  }).join('');
}

// ── Recommendation ─────────────────────────────────────────────────

function updateRecommendation(comparison) {
  const box = document.getElementById('recommendationBox');
  const text = document.getElementById('recommendationText');
  if (!comparison?.summary?.recommendation) {
    box.style.display = 'none';
    return;
  }
  text.textContent = comparison.summary.recommendation;
  box.style.display = 'block';
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatTimeAgo(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return date.toLocaleDateString();
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function showEmptyState() {
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('metricsGrid').style.display = 'none';
  document.querySelectorAll('.content-grid').forEach(e => e.style.display = 'none');
}

function hideEmptyState() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('metricsGrid').style.display = 'grid';
  document.querySelectorAll('.content-grid').forEach(e => e.style.display = 'grid');
}

async function exportData() {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `privacy-shield-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function openSettings() {
  chrome.windows.create({
    url: chrome.runtime.getURL('settings.html'),
    type: 'popup', width: 600, height: 700
  });
}
