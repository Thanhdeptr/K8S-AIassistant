<template>
  <div class="ai-chat-container">
    <div class="chat-header">
      <h1>AI Chat Assistant</h1>
      <div class="api-config">
        <input 
          v-model="openaiApiKey" 
          @change="saveApiKey"
          placeholder="Nhập OpenAI API Key..."
          type="password"
          class="api-key-input"
        />
        <button @click="testApiKey" :disabled="!openaiApiKey">Test API</button>
      </div>
    </div>
    
    <div class="chat-messages" ref="messagesContainer">
      <div 
        v-for="(message, index) in messages" 
        :key="index" 
        :class="['message', message.type]"
      >
        <div class="message-content">
          <div class="message-text">{{ message.text }}</div>
          <div class="message-time">{{ formatTime(message.timestamp) }}</div>
        </div>
      </div>
    </div>
    
    <div class="chat-input">
      <div class="input-container">
        <textarea 
          v-model="newMessage" 
          @keydown.enter.prevent="sendMessage"
          placeholder="Nhập tin nhắn của bạn..."
          rows="3"
        ></textarea>
        <button @click="sendMessage" :disabled="isLoading || !openaiApiKey">
          {{ isLoading ? 'Đang gửi...' : 'Gửi' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ChatPage',
  data() {
    return {
      messages: [
        {
          type: 'ai',
          text: 'Xin chào! Tôi là AI Assistant được tích hợp với OpenAI. Vui lòng nhập API Key của bạn để bắt đầu chat.',
          timestamp: new Date()
        }
      ],
      newMessage: '',
      isLoading: false,
      openaiApiKey: localStorage.getItem('openai_api_key') || ''
    };
  },
  methods: {
    async sendMessage() {
      if (!this.newMessage.trim() || this.isLoading || !this.openaiApiKey) {
        if (!this.openaiApiKey) {
          this.addMessage('ai', 'Vui lòng nhập OpenAI API Key trước khi chat.');
        }
        return;
      }
      
      const userMessage = {
        type: 'user',
        text: this.newMessage,
        timestamp: new Date()
      };
      
      this.messages.push(userMessage);
      this.newMessage = '';
      this.isLoading = true;
      
      try {
        const response = await this.callOpenAI(userMessage.text);
        this.addMessage('ai', response);
      } catch (error) {
        console.error('OpenAI API Error:', error);
        this.addMessage('ai', `Lỗi: ${error.message}`);
      } finally {
        this.isLoading = false;
      }
    },
    
    async callOpenAI(userMessage) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'Bạn là một AI Assistant chuyên về Kubernetes, Docker, Rancher và DevOps. Hãy trả lời bằng tiếng Việt một cách ngắn gọn và dễ hiểu.'
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Lỗi kết nối OpenAI API');
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
    },
    
    addMessage(type, text) {
      this.messages.push({
        type,
        text,
        timestamp: new Date()
      });
      this.scrollToBottom();
    },
    
    saveApiKey() {
      localStorage.setItem('openai_api_key', this.openaiApiKey);
    },
    
    async testApiKey() {
      if (!this.openaiApiKey) return;
      
      this.isLoading = true;
      try {
        await this.callOpenAI('Xin chào! Hãy trả lời "OK" nếu bạn nhận được tin nhắn này.');
        this.addMessage('ai', '✅ API Key hoạt động tốt! Bạn có thể bắt đầu chat.');
      } catch (error) {
        this.addMessage('ai', `❌ Lỗi API Key: ${error.message}`);
      } finally {
        this.isLoading = false;
      }
    },
    
    formatTime(timestamp) {
      return timestamp.toLocaleTimeString();
    },
    
    scrollToBottom() {
      this.$nextTick(() => {
        const container = this.$refs.messagesContainer;
        container.scrollTop = container.scrollHeight;
      });
    }
  },
  
  mounted() {
    this.scrollToBottom();
  }
};
</script>

<style scoped>
.ai-chat-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.chat-header {
  background: #2c3e50;
  color: white;
  padding: 1rem;
  text-align: center;
}

.chat-header h1 {
  margin: 0 0 1rem 0;
  font-size: 1.5rem;
}

.api-config {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  align-items: center;
}

.api-key-input {
  padding: 0.5rem;
  border: none;
  border-radius: 0.25rem;
  width: 300px;
  font-family: monospace;
}

.api-config button {
  padding: 0.5rem 1rem;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.api-config button:hover {
  background: #229954;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  max-width: 70%;
  margin-bottom: 1rem;
}

.message.user {
  align-self: flex-end;
}

.message.ai {
  align-self: flex-start;
}

.message-content {
  padding: 1rem;
  border-radius: 1rem;
  position: relative;
}

.message.user .message-content {
  background: #3498db;
  color: white;
  border-bottom-right-radius: 0.25rem;
}

.message.ai .message-content {
  background: white;
  color: #333;
  border: 1px solid #ddd;
  border-bottom-left-radius: 0.25rem;
}

.message-time {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-top: 0.5rem;
}

.chat-input {
  background: white;
  border-top: 1px solid #ddd;
  padding: 1rem;
}

.input-container {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  resize: none;
  font-family: inherit;
}

button {
  padding: 0.75rem 1.5rem;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: bold;
}

button:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

button:hover:not(:disabled) {
  background: #2980b9;
}
</style>
