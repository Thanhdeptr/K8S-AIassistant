// server.js
const express = require('express');
const cors = require('cors');

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

// Nếu MCP cần header như Authorization thì thêm ở đây
const MCP_HEADERS = {
    'content-type': 'application/json',
    // 'authorization': `Bearer ${process.env.MCP_TOKEN}`,
};

// ====== OPENAI CLIENT (Ollama-compatible) ======
const openai = new OpenAI({
    baseURL: OLLAMA_BASE,
    apiKey: 'ollama', // placeholder
});

// ====== MCP HTTP + SSE CLIENT ======
// ====== MCP HTTP + SSE CLIENT ======
class MCPHttpClient {
    constructor(base, headers = {}) {
        this.base = base.replace(/\/+$/, '');
        this.headers = headers;
        this.sessionPath = null;     // e.g. "/messages?sessionId=UUID"
        this.controller = null;      // AbortController cho SSE
        this._endpointReady = null;  // Promise resolve khi có endpoint
    }

    async connect() {
        if (this.sessionPath) return this.sessionPath; // đã có session

        this.controller = new AbortController();
        const r = await fetch(`${this.base}/sse`, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
            signal: this.controller.signal,
        });
        if (!r.ok || !r.body) throw new Error(`SSE HTTP ${r.status}`);

        // Tạo promise chờ endpoint
        let resolveEndpoint, rejectEndpoint;
        this._endpointReady = new Promise((res, rej) => { resolveEndpoint = res; rejectEndpoint = rej; });

        // Đọc SSE ở nền, KHÔNG đóng/abort sau khi nhận endpoint
        (async () => {
            try {
                const reader = r.body.getReader();
                let buf = '';
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break; // server đóng SSE
                    buf += Buffer.from(value).toString('utf8');

                    // tách theo \n\n thành event
                    let idx;
                    while ((idx = buf.indexOf('\n\n')) >= 0) {
                        const raw = buf.slice(0, idx);
                        buf = buf.slice(idx + 2);

                        let ev = '', data = '';
                        for (const line of raw.split('\n')) {
                            const s = line.trim();
                            if (s.startsWith('event:')) ev = s.slice(6).trim();
                            else if (s.startsWith('data:')) data += (data ? '\n' : '') + s.slice(5).trim();
                        }

                        if (ev === 'endpoint' && data) {
                            // path hoặc full URL
                            this.sessionPath = data.startsWith('http')
                                ? data.replace(this.base, '')
                                : (data.startsWith('/') ? data : `/${data}`);
                            // báo cho bên gọi connect() là có endpoint rồi
                            if (resolveEndpoint) { resolveEndpoint(this.sessionPath); resolveEndpoint = null; }
                        }

                        // (tuỳ bạn: handle các event khác nếu server có gửi)
                    }
                }
                // nếu SSE kết thúc mà chưa từng có endpoint
                if (!this.sessionPath && rejectEndpoint) rejectEndpoint(new Error('SSE closed before endpoint'));
            } catch (e) {
                if (rejectEndpoint) rejectEndpoint(e);
            }
        })();

        // chờ đến khi có endpoint (nhưng vẫn giữ SSE mở)
        return this._endpointReady;
    }

    async rpc(method, params = {}, id = Date.now()) {
        if (!this.sessionPath) {
            // kết nối (và chờ endpoint) nếu chưa có
            await this.connect();
        }
        const url = this.sessionPath.startsWith('http') ? this.sessionPath : `${this.base}${this.sessionPath}`;
        const r = await fetch(url, {
            method: 'POST',
            headers: { ...this.headers, 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        });
        if (!r.ok) throw new Error(`MCP HTTP ${r.status}`);
        const data = await r.json();
        if (data.error) throw new Error(data.error.message || 'MCP error');
        return data.result;
    }

    initialize() {
        return this.rpc('initialize', {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {}, resources: {}, prompts: {} },
            clientInfo: { name: 'ollama-mcp-http', version: '0.1.0' },
        });
    }

    async listTools() {
        const res = await this.rpc('tools/list', {});
        return res.tools || [];
    }

    toolsCall(name, args) {
        return this.rpc('tools/call', { name, arguments: args });
    }

    close() {
        try { this.controller?.abort(); } catch { }
        this.controller = null;
        this.sessionPath = null;
        this._endpointReady = null;
    }
}


// ====== CHUYỂN schema MCP -> tools OpenAI-compatible (Ollama) ======
function mapMcpToolsToOpenAITools(mcpTools) {
    return mcpTools.map((t) => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description || `MCP tool: ${t.name}`,
            parameters: t.inputSchema || { type: 'object', properties: {} }, // JSON Schema
        },
    }));
}

const truncate = (s, n) =>
    (s && s.length > n ? s.slice(0, n) + '\n...[truncated]...' : s || '');

// ====== VÒNG LẶP TOOL-CALLING (thuần Ollama) ======
async function runToolCallingWithOllama({ userMessages, tools, mcp }) {
    const messages = userMessages.slice();
    messages.push({
        role: 'system',
        content:
            'Khi thao tác Kubernetes, hãy gọi function thích hợp (đừng đoán). ' +
            'Nếu gọi tool thì chờ kết quả tool trước khi trả lời.',
    });

    let guard = 0;
    while (guard++ < 6) {
        const completion = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages,
            tools,
            tool_choice: 'auto',
        });

        const choice = completion.choices?.[0];
        const msg = choice?.message || {};
        const toolCalls = msg.tool_calls || msg.toolCalls || [];

        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            messages.push({ role: 'assistant', tool_calls: toolCalls });

            for (const tc of toolCalls) {
                const { id, function: fn } = tc;
                const name = fn?.name;
                let args = {};
                try { args = fn?.arguments ? JSON.parse(fn.arguments) : {}; } catch { }

                let toolOutput = '';
                try {
                    const mcpRes = await mcp.toolsCall(name, args);
                    if (mcpRes?.content !== undefined) {
                        toolOutput = typeof mcpRes.content === 'string'
                            ? mcpRes.content
                            : JSON.stringify(mcpRes.content);
                    } else {
                        toolOutput = JSON.stringify(mcpRes);
                    }
                } catch (e) {
                    toolOutput = `ERROR from MCP: ${e.message}`;
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: id, // quan trọng để model “ghép” đúng kết quả
                    content: truncate(toolOutput, 48 * 1024),
                });
            }
            continue; // quay lại để model tổng hợp
        }

        // Không còn tool_calls → câu trả lời cuối
        return { text: msg.content || '(no content)', trace: messages };
    }

    return { text: '⚠️ Dừng do quá nhiều vòng tool-calling', trace: messages };
}

// ====== EXPRESS APP ======
const app = express();
app.use(cors());
app.use(express.json());

// MCP client (HTTP+SSE) — tạo 1 lần và tái sử dụng
let mcpClient = null;
let OPENAI_COMPAT_TOOLS = [];

async function ensureMcp() {
    if (mcpClient) return mcpClient;
    mcpClient = new MCPHttpClient(MCP_BASE, MCP_HEADERS);
    const endpoint = await mcpClient.connect(); // GET /sse → lấy /messages?sessionId=...
    await mcpClient.initialize();
    const mcpTools = await mcpClient.listTools();
    OPENAI_COMPAT_TOOLS = mapMcpToolsToOpenAITools(mcpTools);
    console.log('🔌 MCP session endpoint:', endpoint);
    console.log('🔧 Loaded tools from MCP:', mcpTools.map(t => t.name));
    return mcpClient;
}

app.post('/api/chat', async (req, res) => {
    try {
        const userMessages = (req.body.messages || []).map((m) => ({
            role: m.role,
            content: m.content,
        }));

        // 1) Kết nối MCP + lấy tools (cache)
        const mcp = await ensureMcp();

        // 2) Chạy vòng lặp tool-calling với Ollama
        const result = await runToolCallingWithOllama({
            userMessages,
            tools: OPENAI_COMPAT_TOOLS,
            mcp,
        });

        return res.json({ message: { content: result.text } });
    } catch (err) {
        console.error('Chat error:', err?.message || err);
        return res.status(502).json({ message: { content: '❌ Lỗi xử lý yêu cầu' } });
    }
});

// health
app.get('/health', async (_req, res) => {
    try {
        await ensureMcp();
        res.json({ ok: true, ollama: OLLAMA_BASE, model: MODEL_NAME, mcp: MCP_BASE });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.listen(8055, '0.0.0.0', () => {
    console.log('✅ API chạy: http://0.0.0.0:8055');
    console.log('🤖 Ollama baseURL:', OLLAMA_BASE, ' | MODEL:', MODEL_NAME);
    console.log('🌐 MCP base:', MCP_BASE, ' (HTTP + SSE)');
    console.log('ℹ️ Flow: GET /sse → nhận "event:endpoint" → POST JSON-RPC vào /messages?sessionId=...');
});
