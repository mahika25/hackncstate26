// Dashboard JavaScript

let confidenceChart = null;
let interestsChart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Dashboard loading...');
  await loadDashboardData();
});

async function loadDashboardData() {
  try {
    const data = await chrome.storage.local.get([
      'initialProfile',
      'updatedProfile',
      'profileComparison',
      'executedQueries',
      'personas'
    ]);
    
    console.log('Loaded data:', data);
    
    if (!data.initialProfile) {
      showEmptyState();
      return;
    }
    
    hideEmptyState();
    populateDashboard(data);
    
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showEmptyState();
  }
}

function populateDashboard(data) {
  const { 
    initialProfile, 
    updatedProfile, 
    profileComparison, 
    executedQueries, 
    personas 
  } = data;
  
  // Update metrics
  updateMetrics(profileComparison, executedQueries, personas);
  
  // Update comparison table
  updateComparisonTable(initialProfile, updatedProfile, profileComparison);
  
  // Update charts
  updateConfidenceChart(profileComparison);
  updateInterestsChart(initialProfile, updatedProfile);
  
  // Update timeline
  updateTimeline(executedQueries, personas);
  
  // Show recommendation
  showRecommendation(profileComparison);
}

function updateMetrics(comparison, executedQueries, personas) {
  // Obfuscation score
  const obfuscationScore = comparison?.obfuscation_score || 0;
  document.getElementById('obfuscationScore').textContent = Math.round(obfuscationScore) + '%';
  
  const scoreChange = document.getElementById('scoreChange');
  if (obfuscationScore > 0) {
    scoreChange.textContent = `↑ ${Math.round(obfuscationScore)}% increase`;
    scoreChange.className = 'metric-change positive';
  }
  
  // Queries executed
  document.getElementById('queriesExecuted').textContent = executedQueries?.length || 0;
  
  // Personas generated
  document.getElementById('personasGenerated').textContent = personas?.length || 0;
  
  // Interest diversity
  const interestChanges = comparison?.interest_changes;
  if (interestChanges) {
    const diversity = interestChanges.new_interests?.length || 0;
    document.getElementById('interestDiversity').textContent = diversity;
    
    if (diversity > 0) {
      const diversityChange = document.getElementById('diversityChange');
      diversityChange.textContent = `+${diversity} new categories`;
      diversityChange.className = 'metric-change positive';
    }
  }
}

function updateComparisonTable(initial, updated, comparison) {
  const tbody = document.querySelector('#comparisonTable tbody');
  tbody.innerHTML = '';
  
  if (!comparison || !comparison.demographic_changes) {
    return;
  }
  
  const changes = comparison.demographic_changes;
  const confidenceDeltas = comparison.confidence_deltas || {};
  
  const attributeLabels = {
    'age_range': '👤 Age Range',
    'gender': '⚧ Gender',
    'profession': '💼 Profession',
    'marital_status': '💑 Marital Status'
  };
  
  for (const [key, value] of Object.entries(changes)) {
    const row = document.createElement('tr');
    
    const delta = confidenceDeltas[key];
    const initialConf = delta?.initial_confidence || 0;
    const updatedConf = delta?.updated_confidence || 0;
    const deltaValue = delta?.delta || 0;
    
    const deltaClass = deltaValue < 0 ? 'negative' : deltaValue > 0 ? 'positive' : 'neutral';
    const deltaSign = deltaValue < 0 ? '' : '+';
    const deltaPercent = Math.abs(Math.round(deltaValue * 100));
    
    row.innerHTML = `
      <td><strong>${attributeLabels[key] || key}</strong></td>
      <td>
        ${value.initial || 'unknown'}
        <div class="confidence-bar">
          <div class="confidence-fill" style="width: ${initialConf * 100}%"></div>
        </div>
        <small style="color: #6c757d;">${Math.round(initialConf * 100)}% confidence</small>
      </td>
      <td>
        ${value.updated || 'unknown'}
        <div class="confidence-bar">
          <div class="confidence-fill" style="width: ${updatedConf * 100}%"></div>
        </div>
        <small style="color: #6c757d;">${Math.round(updatedConf * 100)}% confidence</small>
      </td>
      <td>
        <span class="delta ${deltaClass}">
          ${deltaSign}${deltaPercent}%
        </span>
      </td>
    `;
    
    tbody.appendChild(row);
  }
}

function updateConfidenceChart(comparison) {
  if (!comparison || !comparison.confidence_deltas) {
    return;
  }
  
  const ctx = document.getElementById('confidenceChart').getContext('2d');
  
  const labels = [];
  const initialData = [];
  const updatedData = [];
  
  for (const [key, value] of Object.entries(comparison.confidence_deltas)) {
    const label = key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    labels.push(label);
    initialData.push(Math.round(value.initial_confidence * 100));
    updatedData.push(Math.round(value.updated_confidence * 100));
  }
  
  if (confidenceChart) {
    confidenceChart.destroy();
  }
  
  confidenceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Initial Confidence',
          data: initialData,
          backgroundColor: 'rgba(102, 126, 234, 0.6)',
          borderColor: 'rgba(102, 126, 234, 1)',
          borderWidth: 2
        },
        {
          label: 'Current Confidence',
          data: updatedData,
          backgroundColor: 'rgba(118, 75, 162, 0.6)',
          borderColor: 'rgba(118, 75, 162, 1)',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%';
            }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y + '%';
            }
          }
        }
      }
    }
  });
}

function updateInterestsChart(initial, updated) {
  if (!initial || !updated) {
    return;
  }
  
  const ctx = document.getElementById('interestsChart').getContext('2d');
  
  const initialInterests = initial.interests?.categories || {};
  const updatedInterests = updated.interests?.categories || {};
  
  // Get all unique categories
  const allCategories = new Set([
    ...Object.keys(initialInterests),
    ...Object.keys(updatedInterests)
  ]);
  
  const labels = Array.from(allCategories).map(cat => 
    cat.charAt(0).toUpperCase() + cat.slice(1)
  );
  
  const initialData = labels.map((_, i) => {
    const cat = Array.from(allCategories)[i];
    return initialInterests[cat]?.percentage || 0;
  });
  
  const updatedData = labels.map((_, i) => {
    const cat = Array.from(allCategories)[i];
    return updatedInterests[cat]?.percentage || 0;
  });
  
  if (interestsChart) {
    interestsChart.destroy();
  }
  
  interestsChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Initial Profile',
          data: initialData,
          backgroundColor: 'rgba(102, 126, 234, 0.2)',
          borderColor: 'rgba(102, 126, 234, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(102, 126, 234, 1)'
        },
        {
          label: 'Current Profile',
          data: updatedData,
          backgroundColor: 'rgba(118, 75, 162, 0.2)',
          borderColor: 'rgba(118, 75, 162, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(118, 75, 162, 1)'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%';
            }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      }
    }
  });
}

function updateTimeline(executedQueries, personas) {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';
  
  const events = [];
  
  // Add persona generation event
  if (personas && personas.length > 0) {
    const firstPersona = personas[0];
    if (firstPersona.created_at) {
      events.push({
        time: new Date(firstPersona.created_at),
        text: `Generated ${personas.length} inverse personas`,
        icon: '🎭'
      });
    }
  }
  
  // Add query execution events
  if (executedQueries && executedQueries.length > 0) {
    const groupedByDay = {};
    
    executedQueries.forEach(query => {
      const date = new Date(query.timestamp);
      const dayKey = date.toLocaleDateString();
      
      if (!groupedByDay[dayKey]) {
        groupedByDay[dayKey] = {
          date: date,
          count: 0
        };
      }
      groupedByDay[dayKey].count++;
    });
    
    Object.values(groupedByDay).forEach(group => {
      events.push({
        time: group.date,
        text: `Executed ${group.count} obfuscation queries`,
        icon: '🔍'
      });
    });
  }
  
  // Sort events by time (most recent first)
  events.sort((a, b) => b.time - a.time);
  
  // Show only last 10 events
  events.slice(0, 10).forEach(event => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    
    item.innerHTML = `
      <div class="timeline-content">
        <div class="timeline-time">${formatTimeAgo(event.time)}</div>
        <div class="timeline-text">${event.icon} ${event.text}</div>
      </div>
    `;
    
    timeline.appendChild(item);
  });
  
  if (events.length === 0) {
    timeline.innerHTML = `
      <div style="text-align: center; color: #6c757d; padding: 20px;">
        No activity yet. Start executing queries to see your timeline.
      </div>
    `;
  }
}

function showRecommendation(comparison) {
  if (!comparison || !comparison.summary) {
    return;
  }
  
  const box = document.getElementById('recommendationBox');
  const text = document.getElementById('recommendationText');
  
  text.textContent = comparison.summary.recommendation || 
    'Continue executing queries to improve obfuscation.';
  
  box.style.display = 'block';
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
  
  return date.toLocaleDateString();
}

function showEmptyState() {
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('metricsGrid').style.display = 'none';
  document.querySelectorAll('.content-grid').forEach(el => el.style.display = 'none');
}

function hideEmptyState() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('metricsGrid').style.display = 'grid';
  document.querySelectorAll('.content-grid').forEach(el => el.style.display = 'grid');
}

// Action functions
async function refreshData() {
  console.log('Refreshing dashboard data...');
  await loadDashboardData();
}

async function exportData() {
  try {
    const data = await chrome.storage.local.get([
      'initialProfile',
      'updatedProfile',
      'profileComparison',
      'executedQueries',
      'personas'
    ]);
    
    const exportData = {
      exportDate: new Date().toISOString(),
      ...data
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `privacy-shield-data-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    console.log('Data exported successfully');
    
  } catch (error) {
    console.error('Export error:', error);
    alert('Failed to export data');
  }
}

function openSettings() {
  chrome.windows.create({
    url: chrome.runtime.getURL('settings.html'),
    type: 'popup',
    width: 600,
    height: 700
  });
}

function openExtension() {
  chrome.action.openPopup();
}

function viewDetails() {
  // Could open a detailed view or modal
  alert('Detailed view coming soon!');
}

// Listen for updates from extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'dashboardUpdate') {
    console.log('Received dashboard update');
    refreshData();
  }
});