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
const { zodResponseFormat } = require('openai/helpers/zod');
const { z } = require('zod');

const app = express();
app.use(cors());
app.use(express.json());

// CORS configuration with more permissive settings
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

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

      const response = await axios.post(`${this.serverUrl}${this.messagesEndpoint}?sessionId=default-session`, request, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
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

// Định nghĩa Zod schema cho Kubernetes command analysis
const K8sCommandAnalysis = z.object({
  isK8sCommand: z.boolean().describe("Xác định có phải là Kubernetes command hay không"),
  tool: z.union([
    z.literal("kubectl_get"),
    z.literal("kubectl_create"),
    z.literal("kubectl_delete"),
    z.literal("kubectl_describe"),
    z.literal("kubectl_logs"),
    z.literal("kubectl_scale"),
    z.literal("kubectl_rollout"),
    z.null()
  ]).describe("Tên tool cần sử dụng, null nếu không phải K8s command"),
  arguments: z.record(z.any()).describe("Arguments cho tool, object rỗng nếu không có"),
  explanation: z.string().describe("Giải thích ngắn gọn về phân tích")
});

// OpenAI Structured Output để phân tích prompt thành JSON-RPC
async function analyzeWithOpenAI(userPrompt) {
  try {
    const systemPrompt = `You are a Kubernetes command analyzer. Analyze user input to detect if it's a Kubernetes command.

RULES:
1. If input contains Kubernetes keywords (pod, deployment, service, namespace, kubectl, k8s, kubernetes), set isK8sCommand: true
2. If input is about viewing/listing/getting resources, use tool: "kubectl_get"
3. If input is about creating resources, use tool: "kubectl_create"
4. If input is about deleting/removing resources, use tool: "kubectl_delete"
5. If input is NOT related to Kubernetes, set isK8sCommand: false and tool: null

KEYWORDS to detect:
- Vietnamese: "xem", "tạo", "xóa", "pod", "pods", "deployment", "service", "namespace"
- English: "get", "create", "delete", "show", "list", "pods", "deployments", "services"

EXAMPLES:
Input: "xem pods" → {"isK8sCommand": true, "tool": "kubectl_get", "arguments": {"resourceType": "pods", "namespace": "default"}, "explanation": "Detected Vietnamese command to view pods"}
Input: "xem danh sách pods" → {"isK8sCommand": true, "tool": "kubectl_get", "arguments": {"resourceType": "pods", "namespace": "default"}, "explanation": "Detected Vietnamese command to list pods"}
Input: "cho toi xem pod trong namespace mern-app" → {"isK8sCommand": true, "tool": "kubectl_get", "arguments": {"resourceType": "pods", "namespace": "mern-app"}, "explanation": "Detected Vietnamese command to view pods in specific namespace"}
Input: "hello" → {"isK8sCommand": false, "tool": null, "arguments": {}, "explanation": "Not a Kubernetes command"}

Analyze the user input and extract the command information.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-oss:20b", // Sử dụng model giá rẻ cho phân tích
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(K8sCommandAnalysis, "k8s_command_analysis"),
      max_tokens: 500,
      temperature: 0.1, // Giảm nhiễu để có kết quả nhất quán
    });

    // Với Zod structured output, response đã được parse và validate tự động
    const analysis = completion.choices[0].message.parsed;
    console.log('✅ Parsed Analysis:', JSON.stringify(analysis, null, 2));

    return analysis;

  } catch (error) {
    console.error('OpenAI Structured Output error:', error.message);

    // Fallback: Simple keyword detection if OpenAI fails
    console.log('🔄 Fallback: Using simple keyword detection');
    return analyzeWithKeywords(userPrompt);
  }
}

// Fallback function for simple keyword detection
function analyzeWithKeywords(userPrompt) {
  const prompt = userPrompt.toLowerCase();

  // K8s keywords detection
  const k8sKeywords = ['pod', 'pods', 'deployment', 'service', 'namespace', 'kubectl', 'k8s', 'kubernetes'];
  const viewKeywords = ['xem', 'show', 'get', 'list', 'danh sách'];
  const createKeywords = ['tạo', 'create'];
  const deleteKeywords = ['xóa', 'delete', 'remove'];

  const hasK8sKeyword = k8sKeywords.some(keyword => prompt.includes(keyword));

  if (!hasK8sKeyword) {
    return {
      isK8sCommand: false,
      tool: null,
      arguments: {},
      explanation: "Không phải Kubernetes command (fallback detection)"
    };
  }

  let tool = "kubectl_get"; // default
  let resourceType = "pods"; // default
  let namespace = "default"; // default

  // Detect action
  if (createKeywords.some(keyword => prompt.includes(keyword))) {
    tool = "kubectl_create";
  } else if (deleteKeywords.some(keyword => prompt.includes(keyword))) {
    tool = "kubectl_delete";
  }

  // Extract resource type
  if (prompt.includes('pod') || prompt.includes('pods')) {
    resourceType = "pods";
  } else if (prompt.includes('deployment') || prompt.includes('deployments')) {
    resourceType = "deployments";
  } else if (prompt.includes('service') || prompt.includes('services')) {
    resourceType = "services";
  } else if (prompt.includes('namespace') || prompt.includes('namespaces')) {
    resourceType = "namespaces";
  }

  // Extract namespace
  const namespaceMatch = prompt.match(/namespace\s+([a-zA-Z0-9-]+)/);
  if (namespaceMatch) {
    namespace = namespaceMatch[1];
  }

  return {
    isK8sCommand: true,
    tool: tool,
    arguments: {
      resourceType: resourceType,
      namespace: namespace
    },
    explanation: `Detected K8s command using fallback keyword detection: ${tool}`
  };
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
          model: "gpt-oss:20b",
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
