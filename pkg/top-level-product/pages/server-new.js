const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

// Polyfill fetch cho Node.js versions cũ
try {
  // Thử sử dụng undici (preferred)
  const { fetch, Headers, Request, Response } = require('undici');
  if (!globalThis.fetch) {
    globalThis.fetch = fetch;
    globalThis.Headers = Headers;
    globalThis.Request = Request;
    globalThis.Response = Response;
  }
} catch (err) {
  // Fallback to node-fetch v2
  const fetch = require('node-fetch');
  if (!globalThis.fetch) {
    globalThis.fetch = fetch;
    globalThis.Headers = fetch.Headers;
    globalThis.Request = fetch.Request;
    globalThis.Response = fetch.Response;
  }
}

const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Khởi tạo OpenAI client
const openai = new OpenAI({
  baseURL: "http://192.168.10.32:11434/v1",
  apiKey: "ollama"
});

// MCP Server wrapper - Kết nối với MCP server remote
class MCPServer {
  constructor() {
    this.serverUrl = process.env.MCP_SERVER_URL || 'http://192.168.10.18:3000'; // URL của MCP server (SSE mode)
    this.sseEndpoint = '/sse'; // SSE endpoint
    this.messagesEndpoint = '/messages'; // Messages endpoint
    this.sseEnabled = process.env.MCP_SSE_MODE === 'true'; // Flag để xác định sử dụng SSE hay STDIO
    this.isConnected = false;
  }

  // Kết nối với MCP server remote
  async connect() {
    try {
      console.log('Trying to connect to MCP server at:', this.serverUrl);
      
      // For SSE MCP server, just test basic connectivity
      // The actual SSE connection will be established during tool calls
      const response = await axios.get(`${this.serverUrl}/`, {
        timeout: 5000,
        validateStatus: (status) => {
          // Accept any response that indicates server is running
          return status >= 200 && status < 500;
        }
      }).catch(async (rootError) => {
        // If root fails, try head request
        console.log('Root endpoint failed, trying HEAD request...');
        try {
          return await axios.head(this.serverUrl, { timeout: 5000 });
        } catch (headError) {
          throw rootError; // Throw original error
        }
      });
      
      if (response.status >= 200 && response.status < 500) {
        console.log('✅ Connected to MCP Server (SSE ready)');
        this.isConnected = true;
        return true;
      } else {
        console.error('❌ MCP Server connectivity check failed');
        this.isConnected = false;
        return false;
      }
    } catch (error) {
      console.error('❌ Error connecting to MCP Server:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async callTool(toolName, params = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('MCP Server not connected');
      }

      const request = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: params
        }
      };

      console.log('Sending to MCP:', JSON.stringify(request, null, 2));

      const response = await axios.post(`${this.serverUrl}${this.messagesEndpoint}`, request, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        params: {
          sessionId: 'default-session' // SSE requires sessionId
        }
      });

      console.log('MCP Response:', JSON.stringify(response.data, null, 2));
      return response.data;

    } catch (error) {
      console.error('MCP Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Kiểm tra trạng thái kết nối
  isServerConnected() {
    return this.isConnected;
  }
}

const mcpServer = new MCPServer();

// Kết nối MCP server khi khởi động
mcpServer.connect().then(() => {
  console.log('MCP Server connection initialized');
}).catch((error) => {
  console.error('Failed to initialize MCP Server connection:', error);
});

// OpenAI Structured Output để phân tích prompt thành JSON-RPC
async function analyzeWithOpenAI(userPrompt) {
  try {
    const systemPrompt = `Bạn là một AI assistant chuyên phân tích prompt Kubernetes và chuyển đổi thành JSON-RPC format cho MCP server.

Phân tích prompt sau và xác định:
1. Liệu đây có phải là Kubernetes command không
2. Tool nào cần sử dụng (nếu là K8s command)
3. Arguments phù hợp cho tool đó

Các tool có sẵn:
- kubectl_get: lấy thông tin resources (pods, deployments, services, etc.)
- kubectl_create: tạo resources (pods, deployments, services, etc.)
- kubectl_delete: xóa resources
- kubectl_describe: mô tả chi tiết resources
- kubectl_logs: xem logs của pods
- kubectl_scale: scale deployments
- kubectl_rollout: quản lý rollout

Ví dụ phân tích:
- "tạo pod nginx" → isK8sCommand: true, tool: "kubectl_create", arguments: { resourceType: "pod", name: "nginx-pod", image: "nginx" }
- "xem pods" → isK8sCommand: true, tool: "kubectl_get", arguments: { resourceType: "pods", namespace: "default" }
- "Hello world" → isK8sCommand: false, tool: null, arguments: {}`;

    // Định nghĩa JSON Schema cho Structured Output
    const k8sAnalysisSchema = {
      type: "json_schema",
      json_schema: {
        name: "k8s_command_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            isK8sCommand: {
              type: "boolean",
              description: "Xác định có phải là Kubernetes command hay không"
            },
            tool: {
              type: ["string", "null"],
              description: "Tên tool cần sử dụng, null nếu không phải K8s command",
              enum: ["kubectl_get", "kubectl_create", "kubectl_delete", "kubectl_describe", "kubectl_logs", "kubectl_scale", "kubectl_rollout", null]
            },
            arguments: {
              type: "object",
              description: "Arguments cho tool, object rỗng nếu không có",
              additionalProperties: true
            },
            explanation: {
              type: "string",
              description: "Giải thích ngắn gọn về phân tích"
            }
          },
          required: ["isK8sCommand", "tool", "arguments", "explanation"],
          additionalProperties: false
        }
      }
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Sử dụng model giá rẻ cho phân tích
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: k8sAnalysisSchema,
      max_tokens: 500,
      temperature: 0.1, // Giảm nhiễu để có kết quả nhất quán
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse) return null;

    console.log('OpenAI Structured Analysis Response:', aiResponse);

    // Với Structured Output, không cần try/catch cho JSON.parse
    // Response đã được đảm bảo là valid JSON theo schema
    const analysis = JSON.parse(aiResponse);
    
    console.log('Parsed Analysis:', analysis);
    return analysis;

  } catch (error) {
    console.error('OpenAI Structured Output error:', error.message);
    return null;
  }
}

// API endpoint chính
app.post('/api/chat', async (req, res) => {
  try {
    const userMessages = req.body.messages;
    const userPrompt = userMessages[userMessages.length - 1].content;

    console.log('User prompt:', userPrompt);

    // Kiểm tra MCP server connection
    if (!mcpServer.isServerConnected()) {
      console.log('MCP Server not connected, trying to reconnect...');
      const connected = await mcpServer.connect();
      
      if (!connected) {
        return res.status(503).json({ 
          message: { 
            content: '❌ MCP Server không khả dụng. Vui lòng kiểm tra kết nối đến 192.168.10.18.' 
          } 
        });
      }
    }

    // Bước 1: OpenAI phân tích prompt
    const analysis = await analyzeWithOpenAI(userPrompt);
    
    if (analysis && analysis.isK8sCommand) {
      console.log('🔍 AI Analysis:', JSON.stringify(analysis, null, 2));
      console.log('📝 Explanation:', analysis.explanation);
      
      // Bước 2: Gọi MCP server với JSON-RPC format
      const result = await mcpServer.callTool(analysis.tool, analysis.arguments);
      
      if (result.result && result.result.content) {
        const content = result.result.content[0]?.text || 'Command executed successfully';
        res.json({ 
          message: { 
            content: `✅ K8s Command Result:\n📋 Analysis: ${analysis.explanation}\n📄 Output:\n${content}` 
          } 
        });
      } else {
        res.json({ 
          message: { 
            content: `✅ Command executed successfully\n📋 Analysis: ${analysis.explanation}` 
          } 
        });
      }
    } else {
      // Nếu không phải K8s command, sử dụng OpenAI cho chat thông thường
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: userMessages.map(m => ({
            role: m.role,
            content: m.content
          })),
          max_tokens: 1000,
          temperature: 0.7,
        });

        const reply = completion.choices[0]?.message?.content;
        return res.json({ 
          message: { 
            content: reply || '❌ Không nhận được phản hồi từ OpenAI' 
          } 
        });
      } catch (err) {
        console.error('OpenAI Chat error:', err?.message || err);
        return res.status(502).json({ 
          message: { 
            content: '❌ Lỗi gọi OpenAI API' 
          } 
        });
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
    
    const analysis = await analyzeWithOpenAI(prompt);
    res.json({ analysis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API để kiểm tra trạng thái MCP server
app.get('/api/mcp/status', (req, res) => {
  res.json({
    connected: mcpServer.isServerConnected(),
    serverUrl: mcpServer.serverUrl,
    timestamp: new Date().toISOString()
  });
});

app.listen(8055, () => {
  console.log("✅ Backend với OpenAI Structured Outputs + MCP Server remote chạy tại http://localhost:8055");
  console.log("🌐 MCP Server URL: http://192.168.10.18:3000");
  console.log("🔌 MCP SSE Endpoint: /sse");
  console.log("📬 MCP Messages Endpoint: /messages");
  console.log("🤖 AI Provider: OpenAI API với Structured Outputs");
  console.log("📊 Features: JSON Schema validation, Type-safe responses");
  console.log("🔗 API endpoints:");
  console.log("   - POST /api/chat - Chat với OpenAI Structured Outputs + MCP");
  console.log("   - GET /api/mcp/status - Kiểm tra MCP status");
  console.log("   - POST /api/test - Test phân tích prompt với Structured Output");
  console.log("⚠️  Lưu ý: Sử dụng Ollama compatible endpoint tại http://192.168.10.32:11434/v1");
  console.log("🚀 MCP Server cần chạy với: ENABLE_UNSAFE_SSE_TRANSPORT=true");
});
