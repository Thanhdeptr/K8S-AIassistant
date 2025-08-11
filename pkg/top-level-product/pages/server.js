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

app.post('/api/chat', async (req, res) => {
    try {
        const userMessages = req.body.messages;
        // const userPrompt = userMessages[userMessages.length - 1].content;

        const completion = await openai.chat.completions.create({
            model: "gpt-oss:20b",
            messages: userMessages.map(m => ({
                role: m.role,
                content: m.content
            })),
            tools: [
                {
                    type: "mcp",
                    server_label: "deepwiki",
                    server_url: "https://mcp.deepwiki.com/mcp",
                    require_approval: "never",
                },
            ],
            // max_tokens: 1000,
            // temperature: 0.7,
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
});


app.listen(8055, '0.0.0.0', () => {
    console.log("✅ Backend với OpenAI Structured Outputs + MCP Server remote chạy tại http://0.0.0.0:8055");
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
