<template>
  <div class="chat-widget">
    <div class="chat-header">🤖 <span>AI Assistant</span></div>

    <div class="chat-messages">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        {{ msg.text }}
      </div>
    </div>

    <div class="chat-input">
      <input v-model="userInput" type="text" placeholder="Nhập tin nhắn..." @keyup.enter="sendMessage" />
      <button @click="sendMessage" :disabled="isLoading">
        {{ isLoading ? "..." : "Gửi" }}
      </button>
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
    };
  },
  methods: {
    async sendMessage() {
      const text = this.userInput.trim();
      if (!text || this.isLoading) return;

      this.messages.push({ role: "user", text });
      this.userInput = "";
      this.isLoading = true;

      try {
        // const res = await fetch("https://da10dc21d1f8.ngrok-free.app/api/chat", {
        const res = await fetch("https://192.168.10.18:8055/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama3.2:1b",
            messages: this.messages.map(msg => ({
              role: msg.role === "user" ? "user" : "assistant",
              content: msg.text
            })),
            stream: false
          })
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log("Response:", data);

        if (data.message && data.message.content) {
          const reply = data.message.content.trim();
          this.messages.push({ role: "bot", text: reply });
        } else {
          this.messages.push({ role: "bot", text: "❌ Không nhận được phản hồi từ Ollama." });
        }

      } catch (err) {
        console.error("Fetch error:", err);
        this.messages.push({ role: "bot", text: `❌ Lỗi kết nối: ${err.message}` });
      } finally {
        this.isLoading = false;
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
  text-align: center;
  font-size: 20px;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
}

.chat-header span {
  font-size: 22px;
  font-weight: 700;
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
  max-width: 75%;
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

.chat-input button {
  padding: 10px 20px;
  background-color: #006cff;
  color: white;
  border: none;
  cursor: pointer;
  border-bottom-right-radius: 12px;
}
</style>
