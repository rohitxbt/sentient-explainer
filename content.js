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
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentPopup) {
        this.closePopup();
      }
    });
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
        event.preventDefault(); // Prevent any default behavior
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
    if (!selectedText || selectedText.length < 2) {
      return;
    }
    
    // Close existing popup
    this.closePopup();
    
    // Show loading popup
    this.showLoadingPopup();
    
    // Send to AI for explanation
    this.explainText(selectedText);
  }

  handleMouseDown(event, popup) {
    // Don't drag if clicking on interactive elements
    if (event.target.closest('.eli5-popup-close')) {
      return;
    }
    
    // Only allow dragging from header
    if (!event.target.closest('.eli5-popup-header')) {
      return;
    }
    
    this.isDragging = true;
    popup.classList.add('eli5-popup-dragging');
    document.body.style.cursor = 'grabbing';
    
    const rect = popup.getBoundingClientRect();
    this.dragOffset.x = event.clientX - rect.left;
    this.dragOffset.y = event.clientY - rect.top;
    
    event.preventDefault();
    event.stopPropagation();
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
    
    const clampedX = Math.max(10, Math.min(newX, viewportWidth - popupRect.width - 10 + scrollLeft));
    const clampedY = Math.max(10, Math.min(newY, viewportHeight - popupRect.height - 10 + scrollTop));
    
    this.currentPopup.style.left = `${clampedX}px`;
    this.currentPopup.style.top = `${clampedY}px`;
  }

  handleMouseUp(event) {
    if (this.isDragging && this.currentPopup) {
      this.isDragging = false;
      this.currentPopup.classList.remove('eli5-popup-dragging');
      document.body.style.cursor = '';
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

      console.log('Making API request with model: sentientfoundation/dobby-unhinged-llama-3-3-70b-new');

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
              content: `Please explain this text in very simple, easy-to-understand language. Make it short and clear, like you're explaining to a friend who doesn't know much about this topic.

Text: "${text}"

Keep your explanation:
- Short and simple (3-4 sentences max)
- Use everyday words, not technical terms
- Make it conversational and friendly
- Focus on the main point only`
            }
          ],
          max_tokens: 150, // Reduced for shorter responses
          temperature: 0.5 // Reduced for more focused responses
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
      
      // Handle different error types
      let errorMessage = '⚠️ AI is confused, try again.';
      
      if (error.message && error.message.includes('Extension context invalidated')) {
        errorMessage = '⚠️ Extension was reloaded, please refresh the page.';
      } else if (error.message && error.message.includes('chrome.storage')) {
        errorMessage = '⚠️ Extension error, please refresh the page.';
      } else if (error.name === 'AbortError' || error.message.includes('timeout')) {
        errorMessage = '⚠️ Request timeout, try again.';
      } else if (error.message.includes('API Error')) {
        errorMessage = '⚠️ API Error. Check your API key in settings.';
      }
      
      this.showErrorPopup(errorMessage);
    }
  }

  showLoadingPopup() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Simple loading HTML that fits the smaller popup
    const loaderHTML = `
      <div class="loading-container">
        <div class="loading-text">🤔 Thinking...</div>
        <div class="loader">
          <span class="bar"></span>
          <span class="bar"></span>
          <span class="bar"></span>
        </div>
      </div>
    `;

    this.currentPopup = this.createPopup(loaderHTML, rect, true);
    document.body.appendChild(this.currentPopup);
  }

  showExplanationPopup(explanation) {
    if (this.currentPopup) {
      this.updatePopupContent(explanation, 'eli5');
    }
  }

  showErrorPopup(message) {
    if (this.currentPopup) {
      this.updatePopupContent(`<div class="error-message">${message}</div>`, 'error');
    } else {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      this.currentPopup = this.createPopup(`<div class="error-message">${message}</div>`, rect, false, 'error');
      document.body.appendChild(this.currentPopup);
    }
  }

  createPopup(content, rect, isLoading = false, type = 'eli5') {
    const popup = document.createElement('div');
    popup.className = `eli5-popup eli5-popup-${type}`;
    
    // Better positioning logic
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // Calculate position with viewport bounds checking
    let left = rect.left + scrollLeft;
    let top = rect.bottom + scrollTop + 10;
    
    // Ensure popup fits in viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popupWidth = 320; // Fixed popup width
    const popupHeight = 250; // Estimated popup height
    
    // Adjust horizontal position
    if (left + popupWidth > viewportWidth) {
      left = viewportWidth - popupWidth - 20;
    }
    if (left < 10) left = 10;
    
    // Adjust vertical position
    if (top + popupHeight > viewportHeight + scrollTop) {
      top = rect.top + scrollTop - popupHeight - 10;
    }
    if (top < scrollTop + 10) {
      top = scrollTop + 10;
    }
    
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    
    // Create header
    const header = document.createElement('div');
    header.className = 'eli5-popup-header';
    header.innerHTML = isLoading ? '🤔 Loading...' : '🤖 Sentient AI';
    
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
    closeButton.title = 'Close explanation';
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.closePopup();
    });
    
    popup.appendChild(header);
    popup.appendChild(contentDiv);
    popup.appendChild(closeButton);
    
    // Add show animation after brief delay
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
      
      if (headerDiv) {
        if (type === 'error') {
          headerDiv.textContent = '⚠️ Error';
          this.currentPopup.classList.add('eli5-popup-error');
        } else {
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
        this.isDragging = false;
        document.body.style.cursor = '';
      }, 200);
    }
  }

  handleDocumentClick(event) {
    // Don't close popup if we're dragging or clicking inside popup
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