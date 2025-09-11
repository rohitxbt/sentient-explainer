// Background Service Worker for Sentient AI Explainer
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Sentient AI Explainer installed');
    
    // Open settings page on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    });
  } else if (details.reason === 'update') {
    console.log('Sentient AI Explainer updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically due to default_popup in manifest
  console.log('Extension icon clicked');
});

// Handle keyboard shortcut if we add one later
chrome.commands?.onCommand.addListener((command) => {
  if (command === 'activate-explainer') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'activate' });
      }
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkApiKey') {
    chrome.storage.sync.get(['fireworksApiKey'], (result) => {
      sendResponse({ hasKey: !!result.fireworksApiKey });
    });
    return true; // Keep message channel open for async response
  }
});

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  console.log('Sentient AI Explainer suspended');
});

// Handle extension errors
chrome.runtime.onStartup.addListener(() => {
  console.log('Sentient AI Explainer started');
});