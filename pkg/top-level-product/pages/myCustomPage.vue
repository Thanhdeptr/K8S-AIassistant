<template>
  <div class="chat-widget">
    <div class="chat-header">
      <div class="header-left">
        🤖 <span>AI Assistant</span>
      </div>
      <div class="header-right">
        <span class="message-count" :title="`Có ${messages.length} tin nhắn trong lịch sử`">
          💬 {{ messages.length }}
        </span>
        <span class="storage-info" :title="storageInfo">
          💾 {{ formatStorageSize() }}
        </span>
      </div>
    </div>

    <div class="chat-messages">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role, { 'is-table': msg.isTable }]">
        <!-- Regular text message -->
        <div v-if="!msg.isLogs && !msg.isTable" class="message-text">
          {{ msg.text }}
        </div>
        
        <!-- Formatted logs display -->
        <div v-if="msg.isLogs" class="logs-container">
          <div class="logs-header">
            <span class="logs-title">📋 Kubernetes Logs</span>
            <span class="logs-count">{{ msg.logs.length }} entries</span>
          </div>
          <div class="logs-content">
            <div v-for="(log, logIndex) in msg.logs" :key="logIndex" class="log-entry">
              <div class="log-timestamp">{{ formatTimestamp(log.timestamp) }}</div>
              <div class="log-level" :class="getLogLevelClass(log.level)">
                {{ log.level }}
              </div>
              <div class="log-category">{{ log.category }}</div>
              <div class="log-message">{{ log.message }}</div>
            </div>
          </div>
        </div>

        <!-- Formatted markdown table display -->
        <div v-if="msg.isTable" class="table-container">
          <div v-if="msg.preamble" class="message-text table-preamble">{{ msg.preamble }}</div>
          <div class="table-content">
            <table class="markdown-table">
              <thead>
                <tr>
                  <th v-for="(h, i) in msg.table.headers" :key="i">{{ h }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rIdx) in msg.table.rows" :key="rIdx">
                  <td v-for="(cell, cIdx) in row" :key="cIdx">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="msg.afterText" class="message-text table-after">{{ msg.afterText }}</div>
        </div>
      </div>
    </div>

    <div class="chat-input">
      <input v-model="userInput" type="text" placeholder="Nhập tin nhắn..." @keyup.enter="sendMessage" />
      <div class="chat-controls">
        <button v-if="!isLoading" @click="sendMessage">
          Gửi
        </button>
        <button v-if="isLoading" @click="stopRequest" class="stop-btn">
          ⏹️ Dừng
        </button>
        <button @click="clearChatHistory" class="clear-btn" title="Xóa lịch sử chat">
          🗑️
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "Page1",
  data() {
    return {
      userInput: "",
      messages: [
        { role: "bot", text: "Xin chào! Tôi có thể giúp gì cho bạn hôm nay?" }
      ],
      isLoading: false,
      abortController: null,
      localStorageKey: 'chatbot-messages', // Key cho localStorage
      maxMessages: 100, // Giới hạn số tin nhắn lưu trữ
      storageInfo: '', // Thông tin về localStorage usage
    };
  },
  computed: {
    // Tính toán kích thước storage được sử dụng
    storageUsage() {
      try {
        const saved = localStorage.getItem(this.localStorageKey);
        return saved ? saved.length : 0;
      } catch {
        return 0;
      }
    }
  },
  mounted() {
    // Khôi phục lịch sử chat khi component được mount
    this.loadChatHistory();
    this.updateStorageInfo();
  },
  methods: {
    // Lưu lịch sử chat vào localStorage
    saveChatHistory() {
      try {
        // Chỉ lưu tối đa maxMessages tin nhắn gần nhất
        const messagesToSave = this.messages.slice(-this.maxMessages);
        const chatData = {
          messages: messagesToSave,
          timestamp: Date.now(),
          version: '1.0' // Để xử lý migration trong tương lai
        };
        localStorage.setItem(this.localStorageKey, JSON.stringify(chatData));
        console.log('💾 Đã lưu lịch sử chat vào localStorage');
        this.updateStorageInfo();
      } catch (error) {
        console.warn('❌ Không thể lưu lịch sử chat:', error);
      }
    },

    // Tải lịch sử chat từ localStorage
    loadChatHistory() {
      try {
        const saved = localStorage.getItem(this.localStorageKey);
        if (saved) {
          const chatData = JSON.parse(saved);
          
          // Kiểm tra version và structure
          if (chatData.version && chatData.messages && Array.isArray(chatData.messages)) {
            // Kiểm tra xem dữ liệu có quá cũ không (7 ngày)
            const now = Date.now();
            const savedTime = chatData.timestamp || 0;
            const daysDiff = (now - savedTime) / (1000 * 60 * 60 * 24);
            
            if (daysDiff < 7) {
              this.messages = chatData.messages.length > 0 ? chatData.messages : [
                { role: "bot", text: "Xin chào! Tôi có thể giúp gì cho bạn hôm nay?" }
              ];
              console.log('📂 Đã khôi phục lịch sử chat từ localStorage');
            } else {
              console.log('🗑️ Dữ liệu chat cũ hơn 7 ngày, bắt đầu cuộc hội thoại mới');
              this.clearChatHistory();
            }
          } else {
            console.log('🔄 Dữ liệu chat cũ không tương thích, bắt đầu cuộc hội thoại mới');
            this.clearChatHistory();
          }
        }
      } catch (error) {
        console.warn('❌ Không thể tải lịch sử chat:', error);
      }
    },

    // Xóa lịch sử chat
    clearChatHistory() {
      try {
        localStorage.removeItem(this.localStorageKey);
        this.messages = [
          { role: "bot", text: "Xin chào! Tôi có thể giúp gì cho bạn hôm nay?" }
        ];
        console.log('🗑️ Đã xóa lịch sử chat');
        this.updateStorageInfo();
      } catch (error) {
        console.warn('❌ Không thể xóa lịch sử chat:', error);
      }
    },

    // Làm sạch tin nhắn cũ khi vượt quá giới hạn
    cleanupOldMessages() {
      if (this.messages.length > this.maxMessages) {
        const keepMessages = this.messages.slice(-this.maxMessages);
        // Luôn giữ tin nhắn chào đầu tiên nếu có
        const firstBotMessage = this.messages.find(msg => msg.role === 'bot');
        if (firstBotMessage && !keepMessages.includes(firstBotMessage)) {
          keepMessages.unshift(firstBotMessage);
        }
        this.messages = keepMessages;
        console.log('🧹 Đã làm sạch tin nhắn cũ');
      }
    },

    async sendMessage() {
      const text = this.userInput.trim();
      if (!text || this.isLoading) return;

      this.messages.push({ role: "user", text });
      this.userInput = "";
      this.isLoading = true;
      
      // Tạo AbortController để có thể cancel request
      this.abortController = new AbortController();

      try {
        const res = await fetch("https://da10dc21d1f8.ngrok-free.app/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-oss:20b",
            messages: this.messages.map(msg => ({
              role: msg.role === "user" ? "user" : "assistant",
              content: msg.text
            })),
            stream: false
          }),
          signal: this.abortController.signal
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log("Response:", data);

        if (data.message && data.message.content) {
          const reply = data.message.content.trim();

          // Check if the reply contains Kubernetes logs (table format)
          if (this.isKubernetesLogs(reply)) {
            const formattedLogs = this.parseKubernetesLogs(reply);
            this.messages.push({ 
              role: "bot", 
              text: "Đây là logs từ Kubernetes:", 
              isLogs: true,
              logs: formattedLogs
            });
          } else if (this.isMarkdownTable(reply)) {
            // Parse generic Markdown table (e.g., list of Pods)
            const { table, preamble, afterText } = this.parseMarkdownTable(reply);
            this.messages.push({
              role: "bot",
              text: reply, // giữ nguyên nội dung gốc cho context hội thoại
              isTable: true,
              table,
              preamble,
              afterText
            });
          } else {
            this.messages.push({ role: "bot", text: reply });
          }
        } else {
          this.messages.push({ role: "bot", text: "❌ Không nhận được phản hồi từ Ollama." });
        }

        // Làm sạch tin nhắn cũ và lưu lịch sử sau khi nhận phản hồi
        this.cleanupOldMessages();
        this.saveChatHistory();

      } catch (err) {
        console.error("Fetch error:", err);
        // Chỉ hiển thị lỗi nếu không phải do cancel
        if (err.name !== 'AbortError') {
          this.messages.push({ role: "bot", text: `❌ Lỗi kết nối: ${err.message}` });
        }
      } finally {
        this.isLoading = false;
        this.abortController = null;
        
        // Lưu lịch sử ngay cả khi có lỗi (để lưu tin nhắn người dùng)
        this.saveChatHistory();
      }
    },

    // Check if the response contains Kubernetes logs in table format
    isKubernetesLogs(text) {
      return text.includes('| Timestamp | Level | Category | Message |') || 
             text.includes('Mười dòng cuối cùng của log container');
    },

    // Check if the response looks like a generic Markdown table or plain text table
    isMarkdownTable(text) {
      if (!text || typeof text !== 'string') return false;
      const lines = text.split('\n').map(l => l.trim());
      
      // Check for markdown table (with pipes and dashes)
      for (let i = 0; i < lines.length - 2; i++) {
        const header = lines[i];
        const separator = lines[i + 1];
        if (header.includes('|') && separator.includes('|') && /-\s*-/.test(separator)) {
          return true;
        }
      }
      
      // Check for plain text table (space-separated columns)
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.includes('NAMESPACE') && line.includes('NAME') && line.includes('STATUS')) {
          // Check if next line has similar structure
          const nextLine = lines[i + 1];
          if (nextLine && nextLine.split(/\s+/).length >= 3) {
            return true;
          }
        }
      }
      
      return false;
    },

    // Parse generic Markdown table or plain text table into headers and rows
    parseMarkdownTable(text) {
      const result = { headers: [], rows: [] };
      let preamble = '';
      let afterText = '';
      if (!text || typeof text !== 'string') return result;

      const lines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      // Check if it's a markdown table (with pipes)
      let headerIdx = -1;
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].includes('|') && lines[i + 1].includes('|') && /-\s*-/.test(lines[i + 1])) {
          headerIdx = i;
          break;
        }
      }

      // If markdown table found, parse it
      if (headerIdx !== -1) {
        // Everything before header becomes preamble
        if (headerIdx > 0) {
          preamble = lines.slice(0, headerIdx).join('\n');
        }

        const splitRow = (line) => {
          // Remove leading/trailing pipes and split
          const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
          return trimmed.split('|').map(s => s.trim()).filter(s => s.length > 0);
        };

        result.headers = splitRow(lines[headerIdx]);

        // Rows start after the separator
        let lastRowLine = headerIdx + 1;
        for (let i = headerIdx + 2; i < lines.length; i++) {
          const line = lines[i];
          if (!line.includes('|')) { lastRowLine = i - 1; break; } // stop when table ends
          if (/^\|?\s*-+/.test(line)) continue; // skip additional separators

          const cells = splitRow(line);
          // Normalize cell count to headers length
          const row = [];
          for (let c = 0; c < result.headers.length; c++) {
            row.push(cells[c] !== undefined ? cells[c] : '');
          }
          result.rows.push(row);
          lastRowLine = i;
        }

        // Anything after the last table row
        if (lastRowLine + 1 < lines.length) {
          afterText = lines.slice(lastRowLine + 1).join('\n');
        }
      } else {
        // Check if it's a plain text table (space-separated)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('NAMESPACE') && line.includes('NAME') && line.includes('STATUS')) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx !== -1) {
          // Everything before header becomes preamble
          if (headerIdx > 0) {
            preamble = lines.slice(0, headerIdx).join('\n');
          }

          // Parse plain text table headers
          const headerLine = lines[headerIdx];
          const headerParts = headerLine.split(/\s+/);
          result.headers = headerParts.filter(part => part.length > 0);

          // Parse rows
          let lastRowLine = headerIdx;
          for (let i = headerIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.length === 0) continue;
            
            // Skip code block markers
            if (line.includes('```')) continue;
            
            // Parse space-separated values
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
              const row = [];
              for (let c = 0; c < result.headers.length; c++) {
                row.push(parts[c] !== undefined ? parts[c] : '');
              }
              result.rows.push(row);
              lastRowLine = i;
            }
          }

          // Anything after the last table row
          if (lastRowLine + 1 < lines.length) {
            afterText = lines.slice(lastRowLine + 1).join('\n');
          }
        }
      }

      return { table: result, preamble, afterText };
    },

    // Parse Kubernetes logs from table format
    parseKubernetesLogs(text) {
      const logs = [];
      const lines = text.split('\n');
      
      for (const line of lines) {
        // Skip header lines and empty lines
        if (line.includes('|-----') || line.includes('| Timestamp') || 
            line.includes('| # |') || line.trim() === '') {
          continue;
        }
        
        // Parse table row
        const parts = line.split('|').map(part => part.trim()).filter(part => part);
        if (parts.length >= 4) {
          logs.push({
            timestamp: parts[1] || parts[0],
            level: parts[2] || parts[1],
            category: parts[3] || parts[2],
            message: parts[4] || parts[3] || ''
          });
        }
      }
      
      return logs;
    },

    // Format timestamp for better readability
    formatTimestamp(timestamp) {
      if (!timestamp) return '';
      
      try {
        // Handle different timestamp formats
        let date;
        if (timestamp.includes('T')) {
          date = new Date(timestamp);
        } else {
          // Handle other formats if needed
          date = new Date(timestamp);
        }
        
        return date.toLocaleString('vi-VN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      } catch (e) {
        return timestamp;
      }
    },

    // Get CSS class for log level styling
    getLogLevelClass(level) {
      const levelMap = {
        'I': 'level-info',
        'INFO': 'level-info',
        'E': 'level-error',
        'ERROR': 'level-error',
        'W': 'level-warning',
        'WARNING': 'level-warning',
        'D': 'level-debug',
        'DEBUG': 'level-debug'
      };
      return levelMap[level] || 'level-default';
    },

    // Dừng request đang chạy
    stopRequest() {
      if (this.abortController) {
        this.abortController.abort();
      }
    },

    // Format kích thước storage để hiển thị
    formatStorageSize() {
      const bytes = this.storageUsage;
      if (bytes === 0) return '0 B';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    },

    // Cập nhật thông tin storage
    updateStorageInfo() {
      try {
        const totalUsed = JSON.stringify(localStorage).length;
        const chatUsed = this.storageUsage;
        const maxStorage = 5 * 1024 * 1024; // Giả định 5MB limit cho localStorage
        
        this.storageInfo = [
          `Chat: ${this.formatStorageSize(chatUsed)}`,
          `Total LocalStorage: ${this.formatStorageSize(totalUsed)}`,
          `Max: ${this.formatStorageSize(maxStorage)}`,
          `Usage: ${((totalUsed / maxStorage) * 100).toFixed(1)}%`
        ].join('\n');
      } catch (error) {
        this.storageInfo = 'Không thể tính toán storage usage';
      }
    }
  }
};
</script>

<style scoped>
.chat-widget {
  width: 100%;
  height: 90vh;
  margin: 30px auto;
  border: 1px solid #ccc;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  background: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-family: Arial, sans-serif;
}

.chat-header {
  background-color: #006cff;
  color: white;
  padding: 12px;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
}

.header-left span {
  font-size: 20px;
  font-weight: 700;
  margin-left: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.message-count,
.storage-info {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  cursor: help;
}

.message-count:hover,
.storage-info:hover {
  background: rgba(255, 255, 255, 0.3);
}

.chat-messages {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  background: #f9f9f9;
  display: flex;
  flex-direction: column;
}

.message {
  max-width: 85%;
  padding: 10px 14px;
  margin: 8px 0;
  border-radius: 12px;
  word-wrap: break-word;
  font-size: 15px;
}

.message.user {
  align-self: flex-end;
  background: #007bff;
  color: white;
  border-bottom-right-radius: 2px;
}

.message.bot {
  align-self: flex-start;
  background: #e0e0e0;
  color: #333;
  border-bottom-left-radius: 2px;
}

/* Make table messages span full width */
.message.is-table {
  max-width: 100%;
  width: 100%;
  padding: 0; /* container controls padding */
  background: transparent; /* use table-container visuals */
}

.message-text {
  line-height: 1.4;
  white-space: pre-wrap; /* giữ \n và khoảng trắng để content không dính một hàng */
}

/* Logs styling */
.logs-container {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 8px;
}

.logs-header {
  background: #e9ecef;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #dee2e6;
}

.logs-title {
  font-weight: 600;
  color: #495057;
}

.logs-count {
  font-size: 12px;
  color: #6c757d;
  background: #fff;
  padding: 2px 8px;
  border-radius: 12px;
}

.logs-content {
  max-height: 300px;
  overflow-y: auto;
}

.log-entry {
  padding: 8px 12px;
  border-bottom: 1px solid #f1f3f4;
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-timestamp {
  color: #6c757d;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  white-space: nowrap;
}

.log-level {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  min-width: 40px;
}

.level-info {
  background: #d1ecf1;
  color: #0c5460;
}

.level-error {
  background: #f8d7da;
  color: #721c24;
}

.level-warning {
  background: #fff3cd;
  color: #856404;
}

.level-debug {
  background: #e2e3e5;
  color: #383d41;
}

.level-default {
  background: #f8f9fa;
  color: #6c757d;
}

.log-category {
  color: #495057;
  font-weight: 500;
  font-size: 11px;
}

.log-message {
  color: #212529;
  line-height: 1.3;
  word-break: break-word;
}

/* Markdown table styling */
.table-container {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 8px;
  width: 100%;
}

/* Removed header elements per request */

.table-content {
  overflow-x: auto;
  width: 100%;
}

.markdown-table {
  width: 100%;
  border-collapse: collapse;
}

.markdown-table th,
.markdown-table td {
  border: 1px solid #f1f3f4;
  padding: 8px 10px;
  text-align: left;
  font-size: 13px;
}

.markdown-table thead th {
  background: #f6f8fa;
  font-weight: 600;
}

.chat-input {
  display: flex;
  border-top: 1px solid #ccc;
}

.chat-input input {
  flex: 1;
  padding: 10px;
  border: none;
  border-bottom-left-radius: 12px;
  outline: none;
}

.chat-controls {
  display: flex;
}

.chat-input button {
  padding: 10px 15px;
  background-color: #006cff;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 14px;
}

.chat-input button:first-child {
  border-bottom-right-radius: 0;
}

.chat-input button:last-child {
  border-bottom-right-radius: 12px;
}

.chat-input button:hover {
  background-color: #0056b3;
}

.chat-input button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.stop-btn {
  background-color: #006cff !important;
}

.stop-btn:hover {
  background-color: #0056b3 !important;
}

.clear-btn {
  background-color: #dc3545 !important;
  padding: 10px 12px !important;
}

.clear-btn:hover {
  background-color: #c82333 !important;
}

/* Responsive design */
@media (max-width: 768px) {
  .message {
    max-width: 95%;
  }
  
  .log-entry {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  
  .log-timestamp {
    font-size: 10px;
  }
  
  .log-level {
    font-size: 10px;
    min-width: 35px;
  }
}
</style>
