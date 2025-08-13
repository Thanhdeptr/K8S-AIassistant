<template>
  <div class="chat-widget">
    <div class="chat-header">
      <div class="header-left">
        <img class="header-logo" :src="logoSrc" alt="AI Assistant" />
        <span>AI Assistant</span>
      </div>
      <div class="header-right">
        <span class="message-count" :title="`Có ${messages.length} tin nhắn trong lịch sử`">
          💬 {{ messages.length }}
        </span>
        <span class="storage-info" :title="storageInfo">
          💾 {{ formatStorageSize() }}
        </span>
        <button 
          @click="confirmClearHistory" 
          class="header-delete-btn" 
          title="Xóa lịch sử chat"
        >
          ×
        </button>
      </div>
    </div>

    <div class="chat-messages">
      <div 
        v-for="(msg, index) in messages" 
        :key="index" 
        :class="['message', msg.role, { 'is-table': msg.isTable }]"
        :data-message-index="index"
        @mouseenter="showMessageMenu(index)"
        @mouseleave="hideMessageMenu(index)"
      >
        <!-- Message content wrapper -->
        <div class="message-content">
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
        
        <!-- Message menu (3 dots) - bên ngoài tin nhắn -->
        <div 
          v-if="hoveredMessageIndex === index" 
          :class="['message-menu-trigger', msg.role === 'user' ? 'user-menu' : 'bot-menu']"
          @click="toggleMessageMenu(index, $event)"
        >
          ⋯
        </div>
        
        <!-- Message options menu - bên ngoài tin nhắn -->
        <div 
          v-if="activeMessageMenu === index" 
          :class="['message-options-menu', msg.role === 'user' ? 'user-menu' : 'bot-menu']"
          :style="getMenuPosition(index, msg.role)"
        >
          <div class="menu-item" @click="deleteMessage(index)">
            Xóa
          </div>
          <div class="menu-item" @click="copyMessage(index)">
            Sao chép
          </div>
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
      logoSrc: require('./images/Kubernetes-Logo.wine.png'),
      messages: [
        { role: "bot", text: "Xin chào! Tôi có thể giúp gì cho bạn hôm nay?" }
      ],
      isLoading: false,
      abortController: null,
      localStorageKey: 'chatbot-messages', // Key cho localStorage
      maxMessages: 100, // Giới hạn số tin nhắn lưu trữ
      storageInfo: '', // Thông tin về localStorage usage
      hoveredMessageIndex: null, // Index của tin nhắn đang hover
      activeMessageMenu: null, // Index của menu đang mở
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
    
    // Thêm global function để context menu có thể gọi
    window.deleteMessageAt = (index) => {
      this.deleteMessage(index);
    };
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

          // Check if AI explicitly marked as table
          if (reply.includes('isMarkTable:true') || reply.includes('isMarkTable: true')) {
            const tableContent = reply.replace(/isMarkTable:\s*true\s*\n?/i, '').trim();
            const { table, preamble, afterText } = this.parseMarkdownTable(tableContent);
            this.messages.push({
              role: "bot",
              text: tableContent, // giữ nguyên nội dung gốc cho context hội thoại
              isTable: true,
              table,
              preamble,
              afterText
            });
          } else if (this.isKubernetesLogs(reply)) {
            const formattedLogs = this.parseKubernetesLogs(reply);
            this.messages.push({ 
              role: "bot", 
              text: reply, // giữ nguyên nội dung gốc cho context hội thoại
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

    // Check if the response contains Kubernetes logs (table format, JSON format, or plain text format)
    isKubernetesLogs(text) {
      if (!text || typeof text !== 'string') return false;
      
      // Kiểm tra table format logs
      if (text.includes('| Timestamp | Level | Category | Message |') || 
          text.includes('Mười dòng cuối cùng của log container')) {
        return true;
      }
      
      // Kiểm tra JSON format logs
      const jsonMatches = text.match(/\{[^{}]*\}/g);
      if (jsonMatches && jsonMatches.length >= 2) {
        // Kiểm tra xem có phải là logs không (có timestamp, message, etc.)
        const sampleJson = jsonMatches[0];
        try {
          const parsed = JSON.parse(sampleJson);
          return parsed.timestamp || parsed.time || parsed.ts || 
                 parsed.message || parsed.msg || 
                 parsed.level || parsed.log || 
                 parsed.attr || parsed.attributes;
        } catch {
          return false;
        }
      }
      
      // Kiểm tra plain text format logs
      if (text.includes('dòng log') || text.includes('log cuối cùng') || 
          text.includes('pod `') || text.includes('container') ||
          text.includes('yarn run') || text.includes('node:') ||
          text.includes('Warning:') || text.includes('Error:') ||
          text.includes('server is up') || text.includes('port')) {
        return true;
      }
      
      return false;
    },

    // Check if the response looks like a generic Markdown table or plain text table
    isMarkdownTable(text) {
      if (!text || typeof text !== 'string') return false;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // Check for markdown table (with pipes and dashes)
      for (let i = 0; i < lines.length - 2; i++) {
        const header = lines[i];
        const separator = lines[i + 1];
        if (header.includes('|') && separator.includes('|') && /-\s*-/.test(separator)) {
          return true;
        }
      }
      
      // Check for plain text table (more flexible approach)
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const nextLine = lines[i + 1];
        
        if (!nextLine) continue;
        
        // Check if current line looks like a header (contains common table headers)
        const headerWords = line.toUpperCase().split(/\s+/);
        const hasCommonHeaders = headerWords.some(word => 
          ['NAME', 'STATUS', 'TYPE', 'READY', 'AGE', 'IP', 'NODE', 'NAMESPACE', 'RESTARTS', 
           'CLUSTER-IP', 'EXTERNAL-IP', 'UP-TO-DATE', 'AVAILABLE', 'REPLICAS', 'VERSION',
           'CREATED', 'SIZE', 'CAPACITY', 'ACCESS', 'MODE', 'PERSISTENTVOLUMES',
           'PERSISTENTVOLUMECLAIMS', 'STORAGECLASS', 'VOLUME', 'CLAIM', 'REFERENCE'].includes(word)
        );
        
        if (hasCommonHeaders) {
          // Check if next line has similar structure (multiple columns)
          const nextLineColumns = nextLine.split(/\s+/).filter(col => col.length > 0);
          
          // If next line has at least 3 columns and looks like data (not another header)
          if (nextLineColumns.length >= 3) {
            // Additional check: next line shouldn't be all uppercase (likely another header)
            const isNextLineData = !nextLine.toUpperCase().split(/\s+/).every(word => 
              ['NAME', 'STATUS', 'TYPE', 'READY', 'AGE', 'IP', 'NODE', 'NAMESPACE', 'RESTARTS',
               'CLUSTER-IP', 'EXTERNAL-IP', 'UP-TO-DATE', 'AVAILABLE', 'REPLICAS', 'VERSION',
               'CREATED', 'SIZE', 'CAPACITY', 'ACCESS', 'MODE', 'PERSISTENTVOLUMES',
               'PERSISTENTVOLUMECLAIMS', 'STORAGECLASS', 'VOLUME', 'CLAIM', 'REFERENCE'].includes(word)
            );
            
            if (isNextLineData) {
              return true;
            }
          }
        }
        
        // Check for table with at least 3 columns and consistent structure
        const currentColumns = line.split(/\s+/).filter(col => col.length > 0);
        const nextColumns = nextLine.split(/\s+/).filter(col => col.length > 0);
        
        if (currentColumns.length >= 3 && nextColumns.length >= 3) {
          // Check if both lines have similar column structure
          const hasSimilarStructure = Math.abs(currentColumns.length - nextColumns.length) <= 1;
          
          if (hasSimilarStructure) {
            // Check if it looks like header + data pattern
            const currentIsHeader = currentColumns.every(col => 
              col === col.toUpperCase() && col.length > 1
            );
            
            const nextIsData = nextColumns.some(col => 
              col !== col.toUpperCase() || col.length <= 1 || /\d/.test(col)
            );
            
            if (currentIsHeader && nextIsData) {
              return true;
            }
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
        // Generic plain-text table detection (spacing-based, header/data heuristic)
        const splitCols = (s) => s.split(/\s{2,}/).map(x => x.trim()).filter(Boolean);

        // Find header by looking for two consecutive lines with 3+ columns
        // where the first line is mostly uppercase (header-like) and the next has numbers or lowercase (data-like)
        for (let i = 0; i < lines.length - 1; i++) {
          const cols = splitCols(lines[i]);
          const nextCols = splitCols(lines[i + 1]);
          if (cols.length >= 3 && nextCols.length >= 3) {
            const headerLikeCount = cols.filter(c => c === c.toUpperCase()).length;
            const headerLike = headerLikeCount / cols.length >= 0.6;
            const dataLike = nextCols.some(c => /\d/.test(c) || c !== c.toUpperCase());
            if (headerLike && dataLike) { headerIdx = i; break; }
          }
        }

        if (headerIdx !== -1) {
          // Everything before header becomes preamble
          if (headerIdx > 0) {
            preamble = lines.slice(0, headerIdx).join('\n');
          }

          // Headers
          result.headers = splitCols(lines[headerIdx]);

          // Rows
          let lastRowLine = headerIdx;
          for (let i = headerIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.trim().length === 0) break;
            if (line.includes('```')) continue; // skip code block markers

            const parts = splitCols(line);
            if (parts.length >= 2) {
              const row = [];
              for (let c = 0; c < result.headers.length; c++) {
                row.push(parts[c] !== undefined ? parts[c] : '');
              }
              result.rows.push(row);
              lastRowLine = i;
            } else {
              // stop if structure breaks
              break;
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

    // Parse Kubernetes logs from table format, JSON format, or plain text format
    parseKubernetesLogs(text) {
      const logs = [];
      
      // Kiểm tra nếu là JSON format
      const jsonMatches = text.match(/\{[^{}]*\}/g);
      if (jsonMatches && jsonMatches.length >= 2) {
        // Parse JSON logs
        for (const jsonStr of jsonMatches) {
          try {
            const logEntry = JSON.parse(jsonStr);
            logs.push({
              timestamp: logEntry.timestamp || logEntry.time || logEntry.ts || '',
              level: logEntry.level || logEntry.log || 'INFO',
              category: logEntry.category || logEntry.context || '',
              message: logEntry.message || logEntry.msg || 
                      (logEntry.attr && logEntry.attr.message) || 
                      JSON.stringify(logEntry)
            });
          } catch (e) {
            // Nếu không parse được JSON, thêm như text thường
            logs.push({
              timestamp: '',
              level: 'ERROR',
              category: 'PARSE_ERROR',
              message: jsonStr
            });
          }
        }
      } else if (text.includes('| Timestamp | Level | Category | Message |')) {
        // Parse table format logs
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
      } else {
        // Parse plain text format logs
        const lines = text.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          // Skip markdown formatting and empty lines
          if (line.startsWith('**') || line.startsWith('```') || 
              line.includes('dòng log') || line.includes('pod `') ||
              line.trim() === '') {
            continue;
          }
          
          // Determine log level based on content
          let level = 'INFO';
          if (line.includes('Warning:')) level = 'WARNING';
          else if (line.includes('Error:')) level = 'ERROR';
          else if (line.includes('yarn run')) level = 'INFO';
          else if (line.includes('node:')) level = 'WARNING';
          else if (line.includes('server is up')) level = 'INFO';
          
          // Determine category based on content
          let category = 'Application';
          if (line.includes('yarn')) category = 'Package Manager';
          else if (line.includes('node:')) category = 'Node.js';
          else if (line.includes('server')) category = 'Server';
          
          logs.push({
            timestamp: new Date().toISOString(), // Use current time for plain text logs
            level: level,
            category: category,
            message: line.trim()
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
    },

    // Xác nhận trước khi xóa toàn bộ lịch sử
    confirmClearHistory() {
      if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử chat? Hành động này không thể hoàn tác.')) {
        this.clearChatHistory();
      }
    },

    // Xóa tin nhắn cụ thể
    deleteMessage(index) {
      if (confirm('Bạn có chắc chắn muốn xóa tin nhắn này?')) {
        this.messages.splice(index, 1);
        this.saveChatHistory();
        console.log(`🗑️ Đã xóa tin nhắn tại vị trí ${index}`);
        this.showToast('🗑️ Đã xóa tin nhắn thành công!', 'success');
      }
    },

    // Hiển thị menu 3 chấm khi hover
    showMessageMenu(index) {
      this.hoveredMessageIndex = index;
    },
    
    // Ẩn menu 3 chấm khi không hover
    hideMessageMenu(index) {
      // Delay để tránh menu biến mất quá nhanh
      setTimeout(() => {
        if (this.hoveredMessageIndex === index) {
          this.hoveredMessageIndex = null;
        }
      }, 150);
    },
    
    // Toggle message menu
    toggleMessageMenu(index, event) {
      event.stopPropagation();
      
      if (this.activeMessageMenu === index) {
        this.activeMessageMenu = null;
      } else {
        this.activeMessageMenu = index;
        
        // Đóng menu khi click ra ngoài
        const closeMenu = (e) => {
          if (!e.target.closest('.message-options-menu') && !e.target.closest('.message-menu-trigger')) {
            this.activeMessageMenu = null;
            document.removeEventListener('click', closeMenu);
          }
        };
        
        setTimeout(() => {
          document.addEventListener('click', closeMenu);
        }, 100);
      }
    },
    

    
    // Tính toán vị trí menu
    getMenuPosition(index, role) {
      const messageElement = document.querySelector(`[data-message-index="${index}"]`);
      if (!messageElement) return {};
      
      const rect = messageElement.getBoundingClientRect();
      const menuWidth = 135; // Nhỏ hơn 25% (từ 180 xuống 135)
      const menuHeight = 120; // Nhỏ hơn 25% (từ 160 xuống 120)
      
      let left, top;
      
      if (role === 'user') {
        // Menu bên trái tin nhắn user
        left = rect.left - menuWidth - 10;
      } else {
        // Menu bên phải tin nhắn bot
        left = rect.right + 10;
      }
      
      top = rect.top;
      
      // Đảm bảo menu không vượt ra ngoài viewport
      if (left < 10) {
        left = 10;
      }
      if (left + menuWidth > window.innerWidth - 10) {
        left = window.innerWidth - menuWidth - 10;
      }
      if (top + menuHeight > window.innerHeight - 20) {
        top = window.innerHeight - menuHeight - 20;
      }
      
      return {
        left: left + 'px',
        top: top + 'px'
      };
    },
    
    // Sao chép tin nhắn
    copyMessage(index) {
      try {
        const message = this.messages[index];
        let textToCopy = '';
        
        if (message.isLogs) {
          textToCopy = message.logs.map(log => 
            `${log.timestamp} [${log.level}] ${log.category}: ${log.message}`
          ).join('\n');
        } else if (message.isTable) {
          textToCopy = message.text;
        } else {
          textToCopy = message.text;
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
          this.showToast('📋 Đã sao chép tin nhắn vào clipboard!', 'success');
        }).catch(() => {
          // Fallback cho trình duyệt cũ
          const textArea = document.createElement('textarea');
          textArea.value = textToCopy;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          this.showToast('📋 Đã sao chép tin nhắn vào clipboard!', 'success');
        });
      } catch (error) {
        this.showToast('❌ Không thể sao chép tin nhắn', 'error');
      }
    },
    

    
    // Hiển thị toast notification
    showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span class="toast-message">${message}</span>
      `;
      
      document.body.appendChild(toast);
      
      // Animation hiển thị
      requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      });
      
      // Tự động ẩn sau 3 giây
      setTimeout(() => {
        toast.style.transform = 'translateY(-100px)';
        toast.style.opacity = '0';
        setTimeout(() => {
          if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
          }
        }, 300);
      }, 3000);
    }
  }
};
</script>

<style scoped>
/* Global styles for better layout */
:global(*) {
  box-sizing: border-box;
}
.chat-widget {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  background: white;
  box-shadow: none;
  font-family: Arial, sans-serif;
  position: relative;
  overflow: hidden;
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
  border-radius: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left span {
  font-size: 26px;
  font-weight: 800;
  margin-left: 0;
}

.header-logo {
  width: 37px;
  height: 37px;
  object-fit: contain;
  display: block;
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
  position: relative;
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
  border-bottom-left-radius: 0;
  border-radius: 0;
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
  border-radius: 0;
}

.chat-input button:first-child {
  border-bottom-right-radius: 0;
}

.chat-input button:last-child {
  border-bottom-right-radius: 0;
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



/* Header delete button */
.header-delete-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: #1e40af;
  color: white;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  margin-left: 8px;
}

.header-delete-btn:hover {
  background: #1d4ed8;
  transform: scale(1.1);
}

/* Extended hover area using CSS pseudo-elements */
.message::before {
  content: '';
  position: absolute;
  top: 0;
  width: 40px;
  height: 100%;
  z-index: 999;
  pointer-events: none;
}

/* Vùng hover cho tin nhắn user (bên trái) */
.message.user::before {
  left: -40px;
  pointer-events: auto;
}

/* Vùng hover cho tin nhắn bot (bên phải) */
.message.bot::before {
  right: -40px;
  pointer-events: auto;
}

/* Message menu trigger (3 dots) - bên ngoài tin nhắn */
.message-menu-trigger {
  position: absolute;
  top: 8px;
  width: 24px;
  height: 24px;
  background: rgba(128, 128, 128, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  color: #666;
  transition: all 0.2s ease;
  z-index: 1000;
}

/* Vị trí cho tin nhắn user (bên trái tin nhắn) */
.message-menu-trigger.user-menu {
  left: -32px;
}

/* Vị trí cho tin nhắn bot (bên phải tin nhắn) */
.message-menu-trigger.bot-menu {
  right: -32px;
}

.message-menu-trigger:hover {
  background: rgba(128, 128, 128, 0.4);
  color: #333;
  transform: scale(1.1);
}

/* Message options menu - bên ngoài tin nhắn */
.message-options-menu {
  position: fixed;
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 128, 0, 0.08);
  padding: 8px 0;
  min-width: 135px;
  z-index: 10000;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}



.menu-item {
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  position: relative;
  user-select: none;
  text-align: center;
  font-weight: 500;
  color: #495057;
}

.menu-item:hover {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
}

.menu-item:active {
  background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%);
}

/* Toast notifications */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10001;
  transform: translateY(-100px);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-width: 300px;
  backdrop-filter: blur(10px);
}

.toast-success {
  border-left: 4px solid #28a745;
}

.toast-error {
  border-left: 4px solid #dc3545;
}

.toast-info {
  border-left: 4px solid #17a2b8;
}

.toast-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.toast-message {
  font-size: 14px;
  font-weight: 500;
  color: #495057;
  line-height: 1.4;
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
