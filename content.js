// Sentient AI Explainer Content Script
class SentientExplainer {
  constructor() {
    this.ctrlPressCount = 0;
    this.ctrlTimeout = null;
    this.currentPopup = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.lastCtrlTime = 0;
    this.chatHistory = [];
    this.originalText = '';
    this.originalExplanation = '';
    this.init();
  }

  init() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
    document.addEventListener('click', this.handleDocumentClick.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentPopup) {
        this.closePopup();
      }
    });
  }

  handleKeyDown(event) {
    if (event.key === 'Control' && !event.repeat) {
      const currentTime = Date.now();
      if (currentTime - this.lastCtrlTime > 800) {
        this.ctrlPressCount = 0;
      }
      this.ctrlPressCount++;
      this.lastCtrlTime = currentTime;
      if (this.ctrlTimeout) {
        clearTimeout(this.ctrlTimeout);
      }
      if (this.ctrlPressCount === 2) {
        event.preventDefault();
        this.handleDoubleCtrl();
        this.ctrlPressCount = 0;
        return;
      }
      this.ctrlTimeout = setTimeout(() => {
        this.ctrlPressCount = 0;
      }, 800);
    }
  }

  handleKeyUp(event) {
    if (event.key !== 'Control') {
      this.ctrlPressCount = 0;
      if (this.ctrlTimeout) {
        clearTimeout(this.ctrlTimeout);
      }
    }
  }

  handleDoubleCtrl() {
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText || selectedText.length < 2) {
      return;
    }
    this.chatHistory = [];
    this.originalText = selectedText;
    this.closePopup();
    this.showLoadingPopup();
    this.explainText(selectedText);
  }

  handleMouseDown(event, popup) {
    if (event.target.closest('.eli5-popup-close') || event.target.closest('.chat-section')) {
      return;
    }
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
    let newX = event.clientX - this.dragOffset.x + scrollLeft;
    let newY = event.clientY - this.dragOffset.y + scrollTop;
    this.currentPopup.style.left = `${newX}px`;
    this.currentPopup.style.top = `${newY}px`;
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
      if (!chrome.runtime?.id) {
        console.log('Extension context invalidated');
        return;
      }
      const result = await chrome.storage.sync.get(['fireworksApiKey', 'preferredLanguage']);
      const apiKey = result.fireworksApiKey;
      const language = result.preferredLanguage || 'English';
      if (!apiKey) {
        this.showErrorPopup('⚠️ Please set your Fireworks AI API key in the extension settings first!');
        return;
      }
      const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sentientfoundation/dobby-unhinged-llama-3-3-70b-new',
          messages: [{ role: 'user', content: `Please explain this text in very simple, easy-to-understand language. Make it short and clear, like you're explaining to a friend who doesn't know much about this topic. Text: "${text}". IMPORTANT: Please respond in ${language} language. Keep your explanation: Short and simple (3-4 sentences max), use everyday words, not technical terms, make it conversational and friendly, focus on the main point only, and write in ${language} language.` }],
          max_tokens: 150, temperature: 0.5
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from API');
      }
      const explanation = data.choices[0].message.content;
      this.originalExplanation = explanation;
      this.showExplanationPopup(explanation);
    } catch (error) {
      console.error('AI Explanation Error:', error);
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

  async sendChatMessage(userMessage) {
    try {
      this.chatHistory.push({ role: 'user', content: userMessage });
      this.updateChatDisplay();
      this.showChatLoading();
      const result = await chrome.storage.sync.get(['fireworksApiKey', 'preferredLanguage']);
      const apiKey = result.fireworksApiKey;
      const language = result.preferredLanguage || 'English';
      if (!apiKey) {
        this.showChatError('⚠️ API key not found!');
        return;
      }
      const messages = [
        { role: 'system', content: `You are a helpful AI assistant. The user originally asked about this text: "${this.originalText}". You previously explained it as: "${this.originalExplanation}". Now continue the conversation naturally. Always respond in ${language} language and keep responses concise and helpful.` },
        ...this.chatHistory
      ];
      const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sentientfoundation/dobby-unhinged-llama-3-3-70b-new',
          messages: messages, max_tokens: 200, temperature: 0.7
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      this.chatHistory.push({ role: 'assistant', content: aiResponse });
      this.updateChatDisplay();
    } catch (error) {
      console.error('Chat Error:', error);
      this.showChatError('⚠️ Failed to send message. Try again.');
    }
  }

  showLoadingPopup() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const loaderHTML = `
      <div class="loading-container">
        <div class="loading-text">🤔 Thinking...</div>
        <div class="loader">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </div>
      </div>`;
    this.currentPopup = this.createPopup(loaderHTML, rect, true);
    document.body.appendChild(this.currentPopup);
  }

  showExplanationPopup(explanation) {
    // Note: The direct call to initializeChatEvents() is removed from here.
    // It's now handled by the updated `updatePopupContent` function.
    if (this.currentPopup) {
      const explanationWithChat = `
        <div class="explanation-content">${explanation}</div>
        <div class="chat-section">
          <div class="chat-messages" id="chatMessages"></div>
          <div class="chat-input-container">
            <input type="text" class="chat-input" id="chatInput" placeholder="Ask a follow-up question..." />
            <button class="chat-send-btn" id="chatSendBtn">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"></path></svg>
                <span>Send</span>
            </button>
          </div>
        </div>
      `;
      this.updatePopupContent(explanationWithChat, 'eli5');
    }
  }

  initializeChatEvents() {
    if (!this.currentPopup) return;
    const chatInput = this.currentPopup.querySelector('#chatInput');
    const sendBtn = this.currentPopup.querySelector('#chatSendBtn');
    if (chatInput && sendBtn) {
      const sendMessage = () => {
        const message = chatInput.value.trim();
        if (message) {
          this.sendChatMessage(message);
          chatInput.value = '';
          chatInput.focus();
        }
      };
      sendBtn.addEventListener('click', sendMessage);
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMessage();
        }
      });
    }
  }

  updateChatDisplay() {
    if (!this.currentPopup) return;
    const chatMessages = this.currentPopup.querySelector('#chatMessages');
    if (!chatMessages) return;
    const loading = chatMessages.querySelector('.chat-loading');
    if (loading) loading.remove();
    chatMessages.innerHTML = this.chatHistory.map(msg => {
      const sanitizedContent = msg.content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<div class="chat-message ${msg.role === 'user' ? 'user-message' : 'ai-message'}">${sanitizedContent}</div>`;
    }).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  showChatLoading() {
    if (!this.currentPopup) return;
    const chatMessages = this.currentPopup.querySelector('#chatMessages');
    if (!chatMessages) return;
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'chat-message ai-message chat-loading';
    loadingDiv.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  showChatError(message) {
    if (!this.currentPopup) return;
    const loading = this.currentPopup.querySelector('.chat-loading');
    if (loading) loading.remove();
    const chatMessages = this.currentPopup.querySelector('#chatMessages');
    if (!chatMessages) return;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'chat-message error-message';
    errorDiv.textContent = message;
    chatMessages.appendChild(errorDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  showErrorPopup(message) {
    if (this.currentPopup) {
      this.updatePopupContent(`<div class="error-message">${message}</div>`, 'error');
    }
  }

  createPopup(content, rect, isLoading = false, type = 'eli5') {
    const popup = document.createElement('div');
    popup.className = `eli5-popup eli5-popup-${type}`;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    let left = rect.left + scrollLeft;
    let top = rect.bottom + scrollTop + 10;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    const header = document.createElement('div');
    header.className = 'eli5-popup-header';
    header.innerHTML = isLoading ? '🤔 Loading...' : '🤖 Sentient AI';
    header.addEventListener('mousedown', (e) => this.handleMouseDown(e, popup));
    const contentDiv = document.createElement('div');
    contentDiv.className = 'eli5-popup-content';
    contentDiv.innerHTML = content;
    const closeButton = document.createElement('button');
    closeButton.className = 'eli5-popup-close';
    closeButton.innerHTML = '×';
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePopup();
    });
    popup.appendChild(header);
    popup.appendChild(contentDiv);
    popup.appendChild(closeButton);
    setTimeout(() => popup.classList.add('eli5-popup-show'), 10);
    return popup;
  }
  
  // ✅ FIXED FUNCTION
  updatePopupContent(content, type = 'eli5') {
    if (this.currentPopup) {
      const contentDiv = this.currentPopup.querySelector('.eli5-popup-content');
      const headerDiv = this.currentPopup.querySelector('.eli5-popup-header');
      
      if (contentDiv) {
        contentDiv.classList.add('content-fading');
        
        setTimeout(() => {
          contentDiv.innerHTML = content;
          
          if (headerDiv) {
            if (type === 'error') {
              headerDiv.textContent = '⚠️ Error';
              this.currentPopup.classList.add('eli5-popup-error');
            } else {
              headerDiv.textContent = '🤖 Sentient AI';
              this.currentPopup.classList.remove('eli5-popup-error');
            }
          }
          
          // ✅ CRITICAL FIX: Re-initialize chat events AFTER new content is loaded
          if (type === 'eli5') {
            this.initializeChatEvents();
          }

          contentDiv.classList.remove('content-fading');
        }, 200);
      }
    }
  }

  closePopup() {
    if (this.currentPopup) {
      this.currentPopup.classList.remove('eli5-popup-show');
      setTimeout(() => {
        if (this.currentPopup?.parentNode) {
          this.currentPopup.parentNode.removeChild(this.currentPopup);
        }
        this.currentPopup = null;
        this.isDragging = false;
        this.chatHistory = [];
        this.originalText = '';
        this.originalExplanation = '';
        document.body.style.cursor = '';
      }, 300);
    }
  }

  handleDocumentClick(event) {
    if (this.isDragging) return;
    if (this.currentPopup && !this.currentPopup.contains(event.target)) {
      this.closePopup();
    }
  }
}

new SentientExplainer();