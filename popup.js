// Popup Script for Sentient AI Explainer
document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const status = document.getElementById('status');

  // Check if Chrome APIs are available
  if (!chrome?.storage) {
    showStatus('Extension error: Please restart Chrome', 'error');
    return;
  }

  // Load existing API key
  try {
    chrome.storage.sync.get(['fireworksApiKey'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        return;
      }
      if (result.fireworksApiKey) {
        apiKeyInput.value = result.fireworksApiKey;
      }
    });
  } catch (error) {
    console.error('Failed to load API key:', error);
  }

  // Save API key
  saveBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    try {
      chrome.storage.sync.set({ fireworksApiKey: apiKey }, function() {
        if (chrome.runtime.lastError) {
          showStatus('Failed to save API key', 'error');
          return;
        }
        showStatus('✅ API key saved successfully!', 'success');
      });
    } catch (error) {
      showStatus('Storage error: Please restart extension', 'error');
    }
  });

  // Test API key
  testBtn.addEventListener('click', async function() {
    const apiKey = apiKeyInput.value.trim();
    
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
              content: 'Explain what 2+2 equals like I\'m 5 years old, with simple words.'
            }
          ],
          max_tokens: 50,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        showStatus('✅ API key works! You\'re all set!', 'success');
        
        // Save the working API key
        chrome.storage.sync.set({ fireworksApiKey: apiKey });
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