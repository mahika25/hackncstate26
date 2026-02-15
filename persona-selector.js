// Persona Selector Script

let personas = [];
let selectedQueries = new Set();
let filteredPersonas = [];
let currentFilter = 'all';

// DOM Elements
let personasContainer, searchInput, filterButtons;
let totalPersonas, totalQueries, selectedCount, footerCount;
let confirmBtn, cancelBtn, emptyState;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  await loadPersonas();
  setupEventListeners();
  renderPersonas();
  updateStats();
});

function initializeElements() {
  personasContainer = document.getElementById('personasContainer');
  searchInput = document.getElementById('searchInput');
  filterButtons = document.getElementById('filterButtons');
  
  totalPersonas = document.getElementById('totalPersonas');
  totalQueries = document.getElementById('totalQueries');
  selectedCount = document.getElementById('selectedCount');
  footerCount = document.getElementById('footerCount');
  
  confirmBtn = document.getElementById('confirmBtn');
  cancelBtn = document.getElementById('cancelBtn');
  emptyState = document.getElementById('emptyState');
}

async function loadPersonas() {
  try {
    const data = await chrome.storage.local.get(['tempPersonas', 'selectedQueries']);
    
    if (data.tempPersonas) {
      personas = data.tempPersonas;
      filteredPersonas = personas;
    }
    
    if (data.selectedQueries) {
      selectedQueries = new Set(data.selectedQueries);
    }
    
    // Generate filter categories
    generateFilterButtons();
    
  } catch (error) {
    console.error('Error loading personas:', error);
  }
}

function generateFilterButtons() {
  const categories = new Set();
  
  personas.forEach(persona => {
    if (persona.category) {
      categories.add(persona.category);
    }
  });
  
  categories.forEach(category => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.setAttribute('data-filter', category);
    btn.textContent = category;
    filterButtons.appendChild(btn);
  });
}

function setupEventListeners() {
  // Search
  searchInput.addEventListener('input', handleSearch);
  
  // Filter buttons
  filterButtons.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
      handleFilterChange(e.target);
    }
  });
  
  // Footer buttons
  confirmBtn.addEventListener('click', confirmSelection);
  cancelBtn.addEventListener('click', () => window.close());
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault();
      selectAllVisible();
    }
    if (e.key === 'Escape') {
      window.close();
    }
  });
}

function renderPersonas() {
  personasContainer.innerHTML = '';
  
  if (filteredPersonas.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  
  filteredPersonas.forEach((persona, index) => {
    const card = createPersonaCard(persona, index);
    personasContainer.appendChild(card);
  });
}

function createPersonaCard(persona, index) {
  const card = document.createElement('div');
  card.className = 'persona-card';
  card.setAttribute('data-persona-id', index);
  
  const selectedInPersona = persona.queries.filter(q => selectedQueries.has(q)).length;
  const allSelected = selectedInPersona === persona.queries.length;
  
  card.innerHTML = `
    <div class="persona-header" onclick="togglePersonaExpansion(${index})">
      <div class="persona-info">
        <div class="persona-title">
          ${persona.title || `Persona ${index + 1}`}
        </div>
        <div class="persona-description">
          ${persona.description || 'Inverse profile designed to obscure your digital footprint'}
        </div>
        <div class="persona-meta">
          ${persona.demographics ? Object.entries(persona.demographics).map(([key, value]) => `
            <span class="meta-item">${key}: ${value}</span>
          `).join('') : ''}
          <span class="meta-item">${persona.queries.length} queries</span>
          <span class="meta-item">${selectedInPersona} selected</span>
        </div>
      </div>
      <div class="persona-controls">
        <button 
          class="select-all-btn" 
          onclick="event.stopPropagation(); togglePersonaSelection(${index})"
        >
          ${allSelected ? 'Deselect All' : 'Select All'}
        </button>
        <button class="expand-btn">
          View Queries
        </button>
      </div>
    </div>
    <div class="queries-list" id="queries-${index}">
      ${persona.queries.map((query, qIndex) => createQueryItem(query, index, qIndex)).join('')}
    </div>
  `;
  
  return card;
}

function createQueryItem(query, personaIndex, queryIndex) {
  const isSelected = selectedQueries.has(query);
  const queryId = `query-${personaIndex}-${queryIndex}`;
  
  return `
    <div class="query-item ${isSelected ? 'selected' : ''}" 
         data-query="${escapeHtml(query)}"
         onclick="toggleQuerySelection('${queryId}', '${escapeHtml(query)}')">
      <input 
        type="checkbox" 
        class="query-checkbox" 
        id="${queryId}"
        ${isSelected ? 'checked' : ''}
        onclick="event.stopPropagation()"
        onchange="toggleQuerySelection('${queryId}', '${escapeHtml(query)}')"
      >
      <span class="query-text">${escapeHtml(query)}</span>
      <div class="query-tags">
        ${getQueryTags(query).map(tag => `<span class="query-tag">${tag}</span>`).join('')}
      </div>
    </div>
  `;
}

function getQueryTags(query) {
  const tags = [];
  const lower = query.toLowerCase();
  
  // Category detection
  if (lower.match(/buy|purchase|shop|price/)) tags.push('shopping');
  if (lower.match(/recipe|cook|food|restaurant/)) tags.push('food');
  if (lower.match(/travel|hotel|flight|vacation/)) tags.push('travel');
  if (lower.match(/job|career|resume|hiring/)) tags.push('career');
  if (lower.match(/movie|music|book|game/)) tags.push('entertainment');
  if (lower.match(/health|fitness|medical|doctor/)) tags.push('health');
  if (lower.match(/news|politics|election/)) tags.push('news');
  
  return tags.slice(0, 2); // Limit to 2 tags
}

function togglePersonaExpansion(index) {
  const card = document.querySelector(`[data-persona-id="${index}"]`);
  const queriesList = document.getElementById(`queries-${index}`);
  
  if (card.classList.contains('expanded')) {
    card.classList.remove('expanded');
    queriesList.classList.remove('expanded');
  } else {
    // Close all others
    document.querySelectorAll('.persona-card').forEach(c => {
      c.classList.remove('expanded');
    });
    document.querySelectorAll('.queries-list').forEach(q => {
      q.classList.remove('expanded');
    });
    
    // Open this one
    card.classList.add('expanded');
    queriesList.classList.add('expanded');
  }
}

function togglePersonaSelection(index) {
  const persona = filteredPersonas[index];
  const allSelected = persona.queries.every(q => selectedQueries.has(q));
  
  if (allSelected) {
    // Deselect all
    persona.queries.forEach(q => selectedQueries.delete(q));
  } else {
    // Select all
    persona.queries.forEach(q => selectedQueries.add(q));
  }
  
  renderPersonas();
  updateStats();
}

window.toggleQuerySelection = function(queryId, query) {
  const checkbox = document.getElementById(queryId);
  const queryItem = checkbox.closest('.query-item');
  
  if (selectedQueries.has(query)) {
    selectedQueries.delete(query);
    queryItem.classList.remove('selected');
    checkbox.checked = false;
  } else {
    selectedQueries.add(query);
    queryItem.classList.add('selected');
    checkbox.checked = true;
  }
  
  updateStats();
};

function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase();
  
  if (!searchTerm) {
    filteredPersonas = filterByCategory(personas, currentFilter);
  } else {
    filteredPersonas = personas.filter(persona => {
      // Search in persona title and description
      const titleMatch = (persona.title || '').toLowerCase().includes(searchTerm);
      const descMatch = (persona.description || '').toLowerCase().includes(searchTerm);
      
      // Search in queries
      const queryMatch = persona.queries.some(q => 
        q.toLowerCase().includes(searchTerm)
      );
      
      return titleMatch || descMatch || queryMatch;
    });
    
    filteredPersonas = filterByCategory(filteredPersonas, currentFilter);
  }
  
  renderPersonas();
  updateStats();
}

function handleFilterChange(btn) {
  // Update active state
  filterButtons.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.remove('active');
  });
  btn.classList.add('active');
  
  currentFilter = btn.getAttribute('data-filter');
  filteredPersonas = filterByCategory(personas, currentFilter);
  
  renderPersonas();
}

function filterByCategory(personaList, category) {
  if (category === 'all') return personaList;
  return personaList.filter(p => p.category === category);
}

function selectAllVisible() {
  filteredPersonas.forEach(persona => {
    persona.queries.forEach(q => selectedQueries.add(q));
  });
  
  renderPersonas();
  updateStats();
}

function updateStats() {
  totalPersonas.textContent = personas.length;
  
  const allQueriesCount = personas.reduce((sum, p) => sum + p.queries.length, 0);
  totalQueries.textContent = allQueriesCount;
  
  selectedCount.textContent = selectedQueries.size;
  footerCount.textContent = selectedQueries.size;
  
  confirmBtn.disabled = selectedQueries.size === 0;
}

async function confirmSelection() {
  try {
    // Save selected queries to storage
    await chrome.storage.local.set({
      selectedQueries: Array.from(selectedQueries)
    });
    
    // Notify popup
    chrome.runtime.sendMessage({
      action: 'queriesSelected',
      count: selectedQueries.size
    });
    
    window.close();
    
  } catch (error) {
    console.error('Error saving selection:', error);
    alert('Failed to save selection. Please try again.');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Expose global functions
window.togglePersonaExpansion = togglePersonaExpansion;