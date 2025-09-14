// Popup Script for Sentient AI Explainer
document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const languageInput = document.getElementById('preferredLanguage');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const status = document.getElementById('status');

  // Check if Chrome APIs are available
  if (!chrome?.storage) {
    showStatus('Extension error: Please restart Chrome', 'error');
    return;
  }

  // Load existing API key and language
  try {
    chrome.storage.sync.get(['fireworksApiKey', 'preferredLanguage'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        return;
      }
      if (result.fireworksApiKey) {
        apiKeyInput.value = result.fireworksApiKey;
      }
      if (result.preferredLanguage) {
        languageInput.value = result.preferredLanguage;
      }
    });
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  // Save API key and language
  saveBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    const language = languageInput.value.trim() || 'English'; // Default to English
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    try {
      chrome.storage.sync.set({ 
        fireworksApiKey: apiKey,
        preferredLanguage: language
      }, function() {
        if (chrome.runtime.lastError) {
          showStatus('Failed to save settings', 'error');
          return;
        }
        showStatus(`✅ Settings saved! Language: ${language}`, 'success');
      });
    } catch (error) {
      showStatus('Storage error: Please restart extension', 'error');
    }
  });

  // Test API key with language
  testBtn.addEventListener('click', async function() {
    const apiKey = apiKeyInput.value.trim();
    const language = languageInput.value.trim() || 'English';
    
    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    showStatus('Testing API key...', 'success');
    
    try {
      const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'sentientfoundation/dobby-unhinged-llama-3-3-70b-new',
          messages: [
            {
              role: 'user',
              content: `Explain what 2+2 equals like I'm 5 years old, with simple words. Please respond in ${language} language.`
            }
          ],
          max_tokens: 100,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        showStatus(`✅ API works! Language: ${language}`, 'success');
        
        // Save the working settings
        chrome.storage.sync.set({ 
          fireworksApiKey: apiKey,
          preferredLanguage: language
        });
      } else {
        const errorData = await response.text();
        showStatus('❌ API key invalid. Please check your key.', 'error');
      }
    } catch (error) {
      showStatus('❌ Connection failed. Check your internet.', 'error');
    }
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type} show`;
    
    setTimeout(() => {
      status.classList.remove('show');
    }, 3000);
  }

  // Auto-focus on API key input
  apiKeyInput.focus();
});