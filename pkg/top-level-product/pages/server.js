// server.js
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

// --- Polyfill fetch cho Node cũ (ưu tiên undici) ---
try {
    const { fetch, Headers, Request, Response } = require('undici');
    Object.assign(globalThis, { fetch, Headers, Request, Response });
} catch {
    const fetch = require('node-fetch');
    Object.assign(globalThis, {
        fetch,
        Headers: fetch.Headers,
        Request: fetch.Request,
        Response: fetch.Response,
    });
}

// --- OpenAI SDK (trỏ Ollama) ---
const OpenAI = require('openai');

// ====== CẤU HÌNH ======
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://192.168.10.32:11434/v1';
const MODEL_NAME = process.env.MODEL_NAME || 'gpt-oss:20b'; // model trong Ollama
const MCP_BASE = process.env.MCP_BASE || 'http://192.168.10.18:3000'; // http://host:port

// (nếu MCP cần header như Authorization thì thêm ở đây)
const MCP_HEADERS = {
    'content-type': 'application/json'
    // 'authorization': `Bearer ${process.env.MCP_TOKEN}`
};

// ====== OPENAI CLIENT (Ollama-compatible) ======
const openai = new OpenAI({
    baseURL: OLLAMA_BASE,
    apiKey: 'ollama', // placeholder
});

// ====== MCP CLIENT (HTTP + JSON-RPC) ======
async function mcpCall(method, params = {}, id = Date.now()) {
    const r = await fetch(`${MCP_BASE}/messages`, {
        method: 'POST',
        headers: MCP_HEADERS,
        body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params,
        }),
    });
    if (!r.ok) throw new Error(`MCP HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(`MCP error: ${data.error.message || 'unknown'}`);
    return data.result;
}

// (Tuỳ server: mở SSE để giữ session/nhận notify; không bắt buộc nếu chỉ gọi lẻ)
async function mcpInitialize() {
    // Gửi initialize để server biết client-info + capabilities
    return mcpCall('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        clientInfo: { name: 'ollama-mcp-client', version: '0.1.0' },
    });
}

async function mcpListTools() {
    const res = await mcpCall('tools/list', {});
    // res.tools: [{name, description, inputSchema, outputSchema?}, ...]
    return res.tools || [];
}

async function mcpToolsCall(name, args) {
    // Chuẩn MCP: tools/call với { name, arguments }
    const res = await mcpCall('tools/call', { name, arguments: args });
    // Kết quả thường có { content: string | object, ... }
    return res;
}

// ====== CHUYỂN schema MCP -> tools OpenAI-compatible (Ollama) ======
function mapMcpToolsToOpenAITools(mcpTools) {
    // Ollama/OpenAI: { type:"function", function:{ name, description, parameters } }
    return mcpTools.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description || `MCP tool: ${t.name}`,
            parameters: t.inputSchema || { type: 'object', properties: {} },
        }
    }));
}

// ====== VÒNG LẶP TOOL-CALLING (thuần Ollama) ======
async function runToolCallingWithOllama({ userMessages, tools }) {
    // userMessages: [{role, content}...]
    // tools: mảng OpenAI-compatible (từ MCP)
    const messages = userMessages.slice();
    messages.push({
        role: 'system',
        content:
            'Khi cần thao tác Kubernetes, hãy gọi function thích hợp (đừng đoán). ' +
            'Trả lời ngắn gọn, nếu gọi tool thì chờ kết quả tool.'
    });

    // Giới hạn vòng lặp tool-calls
    let guard = 0;

    while (guard++ < 6) {
        const completion = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages,
            tools,
            tool_choice: 'auto' // nếu model hay "gọi bừa", bạn có thể bỏ dòng này
        });

        const choice = completion.choices?.[0];
        const msg = choice?.message || {};
        const toolCalls = msg.tool_calls || msg.toolCalls || []; // tuỳ model

        // Nếu model muốn gọi tool
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            // Ghi lại assistant tool_calls để duy trì "trace"
            messages.push({ role: 'assistant', tool_calls: toolCalls });

            // Thực thi lần lượt từng tool_call
            for (const tc of toolCalls) {
                const { id, function: fn } = tc;
                const name = fn?.name;
                let args = {};
                try {
                    args = fn?.arguments ? JSON.parse(fn.arguments) : {};
                } catch {
                    // nếu parse fail, để args = {}
                }

                // Gọi qua MCP
                let toolOutput = '';
                try {
                    const mcpRes = await mcpToolsCall(name, args);
                    // Chuẩn hoá output thành string ngắn gọn
                    if (mcpRes?.content !== undefined) {
                        toolOutput =
                            typeof mcpRes.content === 'string'
                                ? mcpRes.content
                                : JSON.stringify(mcpRes.content);
                    } else {
                        toolOutput = JSON.stringify(mcpRes);
                    }
                } catch (e) {
                    toolOutput = `ERROR from MCP: ${e.message}`;
                }

                // Đẩy kết quả tool về cho model
                messages.push({
                    role: 'tool',
                    tool_call_id: id, // rất quan trọng để model "liên kết" kết quả
                    content: truncate(toolOutput, 48 * 1024)
                });
            }

            // quay lại vòng lặp để model tổng hợp kết quả
            continue;
        }

        // Không còn tool_calls → đây là câu trả lời cuối
        const finalText = msg.content || '(no content)';
        return { text: finalText, trace: messages };
    }

    return { text: '⚠️ Dừng do quá nhiều vòng tool-calling', trace: messages };
}

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + '\n...[truncated]...' : s || '');

// ====== EXPRESS APP ======
const app = express();
app.use(cors());
app.use(express.json());

// Cache tools (từ MCP) để khỏi gọi lại mỗi request
let OPENAI_COMPAT_TOOLS = [];

app.post('/api/chat', async (req, res) => {
    try {
        const userMessages = (req.body.messages || []).map(m => ({
            role: m.role,
            content: m.content
        }));

        // 1) initialize MCP (1 lần mỗi process; ở đây gọi "best effort")
        try { await mcpInitialize(); } catch (e) { console.warn('MCP init warn:', e.message); }

        // 2) lấy tools từ MCP nếu cache trống (hoặc bạn tự lên lịch refresh)
        if (OPENAI_COMPAT_TOOLS.length === 0) {
            const mcpTools = await mcpListTools();
            OPENAI_COMPAT_TOOLS = mapMcpToolsToOpenAITools(mcpTools);
            console.log('🔧 Loaded tools from MCP:', mcpTools.map(t => t.name));
        }

        // 3) chạy vòng lặp tool-calling với Ollama
        const result = await runToolCallingWithOllama({
            userMessages,
            tools: OPENAI_COMPAT_TOOLS
        });

        return res.json({
            message: { content: result.text }
            // , trace: result.trace   // bật nếu muốn debug
        });
    } catch (err) {
        console.error('Chat error:', err?.message || err);
        return res.status(502).json({ message: { content: '❌ Lỗi xử lý yêu cầu' } });
    }
});

// health
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(8055, '0.0.0.0', () => {
    console.log('✅ API chạy: http://0.0.0.0:8055');
    console.log('🤖 Ollama baseURL:', OLLAMA_BASE, ' | MODEL:', MODEL_NAME);
    console.log('🔌 MCP base:', MCP_BASE, ' (/messages, /sse)');
});
