const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// MCP Server wrapper - Kết nối với MCP đang chạy
class MCPServer {
  constructor() {
    this.process = null;
  }

  // Kết nối với MCP server đang chạy
  connect() {
    // Tạo process mới để giao tiếp với MCP server
    this.process = spawn('node', ['dist/index.js'], {
      cwd: '/home/hatthanh/mcp-server-kubernetes'
    });
    console.log('✅ Connected to MCP Server');
  }

  async callTool(toolName, params = {}) { // ← Sửa arguments thành params
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: params // ← Sử dụng params ở đây
        }
      };

      console.log('Sending to MCP:', JSON.stringify(request, null, 2));

      this.process.stdin.write(JSON.stringify(request) + '\n');

      this.process.stdout.once('data', (data) => {
        try {
          const response = JSON.parse(data.toString());
          console.log('MCP Response:', JSON.stringify(response, null, 2));
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error('MCP Error:', data.toString());
      });
    });
  }
}

const mcpServer = new MCPServer();
mcpServer.connect(); // Chỉ connect, không start

// AI Local để phân tích prompt thành JSON-RPC
async function analyzeWithAILocal(userPrompt) {
  try {
    const systemPrompt = `Bạn là một AI assistant chuyên phân tích prompt Kubernetes và chuyển đổi thành JSON-RPC format cho MCP server.

Hãy phân tích prompt sau và trả về JSON với format chính xác:

{
  "isK8sCommand": true/false,
  "tool": "tool_name",
  "arguments": {
    // các tham số phù hợp
  }
}

Các tool có sẵn:
- kubectl_get: lấy thông tin resources (pods, deployments, services, etc.)
- kubectl_create: tạo resources (pods, deployments, services, etc.)
- kubectl_delete: xóa resources
- kubectl_describe: mô tả chi tiết resources
- kubectl_logs: xem logs của pods
- kubectl_scale: scale deployments
- kubectl_rollout: quản lý rollout

Ví dụ:
- "tạo pod nginx" → { "isK8sCommand": true, "tool": "kubectl_create", "arguments": { "resourceType": "pod", "name": "nginx-pod", "image": "nginx" } }
- "xem pods" → { "isK8sCommand": true, "tool": "kubectl_get", "arguments": { "resourceType": "pods", "namespace": "default" } }
- "xóa pod test" → { "isK8sCommand": true, "tool": "kubectl_delete", "arguments": { "resourceType": "pod", "name": "test", "namespace": "default" } }

Prompt: "${userPrompt}"

Chỉ trả về JSON, không có text khác.`;

    const response = await axios.post('http://192.168.10.18:11435/api/generate', {
      model: "llama3.2:1b",
      prompt: systemPrompt,
      stream: false
    });

    console.log('Raw AI API res', response.data);
    const raw = response.data;
    const aiResponse = raw.response ?? raw.message?.content ?? null;
    if (!aiResponse) return null;
    console.log('AI Response:', aiResponse);

    let analysis;
    try {
      analysis = JSON.parse(aiResponse);
    } catch (e) {
      console.error('Không parse được JSON từ AI:', aiResponse);
      analysis = null;
    }

    return JSON.parse(aiResponse);
  } catch (error) {
    console.error('AI Local error:', error);
    return null;
  }
}

// API endpoint chính
app.post('/api/chat', async (req, res) => {
  try {
    const userMessages = req.body.messages;
    const userPrompt = userMessages[userMessages.length - 1].content;

    console.log('User prompt:', userPrompt);

    // Bước 1: AI Local phân tích prompt
    const analysis = await analyzeWithAILocal(userPrompt);
    
    if (analysis && analysis.isK8sCommand) {
      console.log('AI Analysis:', JSON.stringify(analysis, null, 2));
      
      // Bước 2: Gọi MCP server với JSON-RPC format
      const result = await mcpServer.callTool(analysis.tool, analysis.arguments);
      
      if (result.result && result.result.content) {
        const content = result.result.content[0]?.text || 'Command executed successfully';
        res.json({ 
          message: { 
            content: `✅ K8s Command Result:\n${content}` 
          } 
        });
      } else {
        res.json({ 
          message: { 
            content: '✅ Command executed successfully' 
          } 
        });
      }
    } else {
       try {
    const chatRes = await axios.post('http://192.168.10.18:11435/api/chat', {
      model: "llama3.2:1b",
      messages: userMessages.map(m => ({ role: m.role, content: m.content })),
      stream: false
    }, { timeout: 20000 });

    const reply = chatRes?.data?.message?.content;
    return res.json({ message: { content: reply || '❌ Không nhận được phản hồi' } });
  } catch (err) {
    console.error('Chat error:', err?.message || err);
    return res.status(502).json({ message: { content: '❌ Lỗi gọi AI local' } });
  }
}

  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ message: { content: "❌ Lỗi xử lý request" } });
  }
});

// API để test trực tiếp
app.post('/api/test', async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log('Test prompt:', prompt);
    
    const analysis = await analyzeWithAILocal(prompt);
    res.json({ analysis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(8055, () => {
  console.log("✅ Backend mới với AI Local → JSON-RPC → MCP Server chạy tại http://localhost:8055");
});
