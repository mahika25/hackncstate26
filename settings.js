const DEFAULT_SETTINGS = {
  delayBetweenQueries: 3000,
  queriesPerSession: 10,
  notifications: true,
  closeTabs: true
};

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get(['settings']);

  if (data.settings) {
    const settings = data.settings;
    document.getElementById('queryDelay').value = (settings.delayBetweenQueries || 3000) / 1000;
    document.getElementById('queriesPerSession').value = settings.queriesPerSession || 10;
    document.getElementById('notifications').checked = settings.notifications !== false;
    document.getElementById('closeTabs').checked = settings.closeTabs !== false;
  }

  document.getElementById('cancelBtn').addEventListener('click', () => window.close());
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('clearDataBtn').addEventListener('click', clearAllData);
});

async function saveSettings() {
  try {
    const settings = {
      delayBetweenQueries: parseInt(document.getElementById('queryDelay').value) * 1000,
      queriesPerSession: parseInt(document.getElementById('queriesPerSession').value),
      notifications: document.getElementById('notifications').checked,
      closeTabs: document.getElementById('closeTabs').checked
    };

    await chrome.storage.local.set({ settings });

    showMessage('Settings saved successfully!', 'success');

    chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });

    setTimeout(() => {
      window.close();
    }, 1500);

  } catch (error) {
    console.error('Error saving settings:', error);
    showMessage('Failed to save settings', 'error');
  }
}

async function clearAllData() {
  if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.local.clear();

    await chrome.storage.local.set({
      executedQueries: [],
      selectedQueries: [],
      settings: DEFAULT_SETTINGS
    });

    showMessage('All data cleared successfully', 'success');

    setTimeout(() => {
      window.close();
    }, 1500);

  } catch (error) {
    console.error('Error clearing data:', error);
    showMessage('Failed to clear data', 'error');
  }
}

function showMessage(text, type) {
  const message = document.getElementById('statusMessage');
  message.textContent = text;
  message.className = `status-message ${type}`;
  message.style.display = 'block';

  setTimeout(() => {
    message.style.display = 'none';
  }, 3000);
}
