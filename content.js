// Sentient AI Explainer Content Script
class SentientExplainer {
  constructor() {
    this.ctrlPressCount = 0;
    this.ctrlTimeout = null;
    this.currentPopup = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.lastCtrlTime = 0;
    this.init();
  }

  init() {
    // Listen for keydown/keyup events for better control detection
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
    
    // Listen for clicks outside popup to close it
    document.addEventListener('click', this.handleDocumentClick.bind(this));
    
    // Mouse events for dragging
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  handleKeyDown(event) {
    // Only count Ctrl press if it's actually pressed (not held)
    if (event.key === 'Control' && !event.repeat) {
      const currentTime = Date.now();
      
      // Reset if too much time has passed
      if (currentTime - this.lastCtrlTime > 800) {
        this.ctrlPressCount = 0;
      }
      
      this.ctrlPressCount++;
      this.lastCtrlTime = currentTime;
      
      // Clear existing timeout
      if (this.ctrlTimeout) {
        clearTimeout(this.ctrlTimeout);
      }
      
      // Check for double Ctrl press
      if (this.ctrlPressCount === 2) {
        this.handleDoubleCtrl();
        this.ctrlPressCount = 0;
        return;
      }
      
      // Reset counter after 800ms
      this.ctrlTimeout = setTimeout(() => {
        this.ctrlPressCount = 0;
      }, 800);
    }
  }

  handleKeyUp(event) {
    // Reset if any other key is pressed
    if (event.key !== 'Control') {
      this.ctrlPressCount = 0;
      if (this.ctrlTimeout) {
        clearTimeout(this.ctrlTimeout);
      }
    }
  }

  handleDoubleCtrl() {
    const selectedText = window.getSelection().toString().trim();
    
    // Do nothing if no text is selected
    if (!selectedText || selectedText.length < 3) {
      return;
    }
    
    // Close existing popup
    this.closePopup();
    
    // Show loading popup
    this.showLoadingPopup();
    
    // Send to AI with ELI5 by default
    this.explainText(selectedText, 'eli5');
  }

  handleMouseDown(event, popup) {
    if (event.target.closest('.eli5-popup-close')) {
      return; // Don't drag if clicking close button
    }
    
    this.isDragging = true;
    popup.classList.add('eli5-popup-dragging');
    
    const rect = popup.getBoundingClientRect();
    this.dragOffset.x = event.clientX - rect.left;
    this.dragOffset.y = event.clientY - rect.top;
    
    event.preventDefault();
  }

  handleMouseMove(event) {
    if (!this.isDragging || !this.currentPopup) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    const newX = event.clientX - this.dragOffset.x + scrollLeft;
    const newY = event.clientY - this.dragOffset.y + scrollTop;
    
    // Keep popup within viewport bounds
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popupRect = this.currentPopup.getBoundingClientRect();
    
    const clampedX = Math.max(0, Math.min(newX, viewportWidth - popupRect.width + scrollLeft));
    const clampedY = Math.max(0, Math.min(newY, viewportHeight - popupRect.height + scrollTop));
    
    this.currentPopup.style.left = `${clampedX}px`;
    this.currentPopup.style.top = `${clampedY}px`;
  }

  handleMouseUp(event) {
    if (this.isDragging && this.currentPopup) {
      this.isDragging = false;
      this.currentPopup.classList.remove('eli5-popup-dragging');
    }
  }

  async explainText(text) {
    try {
      // Check if extension context is valid
      if (!chrome.runtime?.id) {
        console.log('Extension context invalidated');
        return;
      }
      
      // Get API key from storage
      const result = await chrome.storage.sync.get(['fireworksApiKey']);
      const apiKey = result.fireworksApiKey;
      
      if (!apiKey) {
        this.showErrorPopup('⚠️ Please set your Fireworks AI API key in the extension settings first!');
        return;
      }

      console.log('Making API request with model: accounts/sentientfoundation/models/dobby-unhinged-llama-3-3-70b-new');

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
              content: `Explain this like I'm 5 years old, with simple words: "${text}"`
            }
          ],
          max_tokens: 200,
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(15000)
      });

      console.log('API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('API response data:', data);
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from API');
      }
      
      const explanation = data.choices[0].message.content;
      
      this.showExplanationPopup(explanation);
      
    } catch (error) {
      console.error('AI Explanation Error:', error);
      
      // Handle specific extension context errors
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.log('Extension was reloaded, please refresh the page');
        return;
      }
      
      // Handle chrome.storage errors
      if (error.message && error.message.includes('chrome.storage')) {
        this.showErrorPopup('⚠️ Extension error, please refresh the page.');
        return;
      }
      
      // Handle timeout errors
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        this.showErrorPopup('⚠️ Request timeout, try again.');
        return;
      }
      
      // Handle API errors with more details
      if (error.message.includes('API Error')) {
        this.showErrorPopup('⚠️ API Error. Check console for details.');
        return;
      }
      
      this.showErrorPopup('⚠️ AI is confused, try again.');
    }
  }

  showLoadingPopup() {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Loader HTML with text + bars side by side
  const loaderHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <div>🤔 Thinking...</div>
      <div class="loader">
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
      </div>
    </div>
  `;

  this.currentPopup = this.createPopup(loaderHTML, rect);
  document.body.appendChild(this.currentPopup);
}


  showExplanationPopup(explanation, type = 'eli5') {
    if (this.currentPopup) {
      this.updatePopupContent(explanation, type);
    }
  }

  showErrorPopup(message) {
    if (this.currentPopup) {
      this.updatePopupContent(message, 'error');
    } else {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      this.currentPopup = this.createPopup(message, rect, 'error');
      document.body.appendChild(this.currentPopup);
    }
  }

  createPopup(content, rect, type = 'eli5') {
    const popup = document.createElement('div');
    popup.className = `eli5-popup eli5-popup-${type}`;
    
    // Position popup
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    popup.style.left = `${rect.left + scrollLeft}px`;
    popup.style.top = `${rect.bottom + scrollTop + 10}px`;
    
    // Create header with type indicator
    const header = document.createElement('div');
    header.className = 'eli5-popup-header';
    if (type === 'summary') {
      header.textContent = '📄 Summary';
    } else if (type === 'eli5') {
      header.textContent = '🤖 Sentient AI';
    } else if (type === 'error') {
      header.textContent = '⚠️ Error';
    } else {
      header.textContent = '🤔 Loading...';
    }
    
    // Add drag functionality to header
    header.addEventListener('mousedown', (e) => {
      this.handleMouseDown(e, popup);
    });
    
    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'eli5-popup-content';
    contentDiv.innerHTML = content;
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.className = 'eli5-popup-close';
    closeButton.innerHTML = '×';
    closeButton.title = 'Close (Click to close)';
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.closePopup();
    });
    
    // Prevent dragging when clicking close button
    closeButton.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    
    popup.appendChild(header);
    popup.appendChild(contentDiv);
    popup.appendChild(closeButton);
    
    // Add animation class after a brief delay
    setTimeout(() => {
      popup.classList.add('eli5-popup-show');
    }, 10);
    
    return popup;
  }

  updatePopupContent(content, type = 'eli5') {
    if (this.currentPopup) {
      const contentDiv = this.currentPopup.querySelector('.eli5-popup-content');
      const headerDiv = this.currentPopup.querySelector('.eli5-popup-header');
      
      if (contentDiv) {
        contentDiv.innerHTML = content;
      }
      
      if (headerDiv && type !== 'error') {
        if (type === 'summary') {
          headerDiv.textContent = '📄 Summary';
        } else if (type === 'eli5') {
          headerDiv.textContent = '🤖 Sentient AI';
        }
        
        // Update popup class
        this.currentPopup.className = `eli5-popup eli5-popup-${type} eli5-popup-show`;
      }
    }
  }

  closePopup() {
    if (this.currentPopup) {
      this.currentPopup.classList.remove('eli5-popup-show');
      setTimeout(() => {
        if (this.currentPopup && this.currentPopup.parentNode) {
          this.currentPopup.parentNode.removeChild(this.currentPopup);
        }
        this.currentPopup = null;
        this.isDragging = false; // Reset dragging state
      }, 200);
    }
  }

  handleDocumentClick(event) {
    // Don't close popup if we're dragging or if clicking inside popup
    if (this.isDragging) return;
    
    // Close popup if clicking outside of it
    if (this.currentPopup && !this.currentPopup.contains(event.target)) {
      this.closePopup();
    }
  }
}

// Initialize the explainer when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SentientExplainer();
  });
} else {
  new SentientExplainer();
}