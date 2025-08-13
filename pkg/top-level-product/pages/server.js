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
class MCPHttpClient {
    constructor(base, headers = {}) {
        this.base = base.replace(/\/+$/, '');
        this.headers = headers;

        this.sessionPath = null;        // "/messages?sessionId=UUID" (hoặc full URL)
        this.sessionId = null;          // Session ID để recovery
        this.controller = null;         // AbortController cho SSE
        this.cookie = null;             // giữ Set-Cookie (nếu có)
        this.lastActivity = Date.now(); // Thêm timestamp cho activity tracking
        this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting

        this._endpointReady = null;     // Promise resolve khi có sessionPath
        this._sseReader = null;         // reader của SSE
        this._buf = '';                 // buffer text SSE

        this._pending = new Map();      // id -> {resolve, reject, timer}
        this._defaultTimeoutMs = 30000; // timeout cho 1 RPC (30s)
        this._reconnectAttempts = 0;    // Số lần thử reconnect
        this._maxReconnectAttempts = 3; // Tối đa 3 lần reconnect
        this._reconnectDelay = 1000;    // Delay giữa các lần reconnect (ms)
    }

    async connect() {
        console.log(`🔍 connect() called - sessionPath: ${this.sessionPath}, connectionState: ${this.connectionState}, sessionId: ${this.sessionId}`);
        
        if (this.sessionPath && this.connectionState === 'connected') {
            console.log('🔗 Reusing existing MCP session:', this.sessionPath);
            return this.sessionPath;
        }

        // Thử session recovery nếu có sessionId
        if (this.sessionId && (this.connectionState === 'disconnected' || this.connectionState === 'reconnecting')) {
            console.log('🔄 Attempting session recovery with ID:', this.sessionId);
            try {
                return await this._attemptSessionRecovery();
            } catch (error) {
                console.log('❌ Session recovery failed:', error.message);
                // Fallback to new connection
            }
        }

        console.log('🔄 Creating new MCP SSE connection to:', this.base);
        this.connectionState = 'connecting';
        this.controller = new AbortController();
        const r = await fetch(`${this.base}/sse`, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
            signal: this.controller.signal,
        });
        if (!r.ok || !r.body) throw new Error(`SSE HTTP ${r.status}`);

        // Ghi nhận Set-Cookie nếu có (một số server yêu cầu gửi lại cookie)
        const setCookie = r.headers.get('set-cookie');
        if (setCookie) this.cookie = setCookie;

        // Promise chờ endpoint
        let resolveEndpoint, rejectEndpoint;
        this._endpointReady = new Promise((res, rej) => { resolveEndpoint = res; rejectEndpoint = rej; });

        // Bắt đầu đọc SSE và xử lý event
        this._sseReader = r.body.getReader();
        (async () => {
            try {
                while (true) {
                    const { value, done } = await this._sseReader.read();
                    if (done) break;
                    this._buf += Buffer.from(value).toString('utf8');

                    // Tách event theo \n\n
                    let idx;
                    while ((idx = this._buf.indexOf('\n\n')) >= 0) {
                        const raw = this._buf.slice(0, idx);
                        this._buf = this._buf.slice(idx + 2);

                        // Parse kiểu:
                        // event: <type>
                        // data: <payload>
                        let ev = '', data = '';
                        for (const line of raw.split('\n')) {
                            const s = line.trim();
                            if (s.startsWith('event:')) ev = s.slice(6).trim();
                            else if (s.startsWith('data:')) data += (data ? '\n' : '') + s.slice(5).trim();
                        }

                        // 1) Sự kiện cung cấp endpoint session
                        if (ev === 'endpoint' && data) {
                            this.sessionPath = data.startsWith('http')
                                ? data.replace(this.base, '')
                                : (data.startsWith('/') ? data : `/${data}`);
                            
                            // Extract session ID từ session path
                            const sessionMatch = this.sessionPath.match(/sessionId=([^&]+)/);
                            if (sessionMatch) {
                                this.sessionId = sessionMatch[1];
                                console.log('📝 Extracted session ID:', this.sessionId);
                            }
                            
                            this.connectionState = 'connected';
                            if (resolveEndpoint) { resolveEndpoint(this.sessionPath); resolveEndpoint = null; }
                            continue;
                        }

                        // 2) Sự kiện chứa JSON-RPC response
                        if (data) {
                            // Có thể là JSON thuần hoặc NDJSON / nhiều object; ta cố parse linh hoạt
                            const candidates = data.split('\n').map(s => s.trim()).filter(Boolean);
                            for (const cand of candidates) {
                                const obj = this._tryJSON(cand) || this._tryExtractJSON(cand);
                                if (!obj || obj.jsonrpc !== '2.0' || (obj.id === undefined && obj.result === undefined && obj.error === undefined)) {
                                    continue;
                                }
                                // Nếu có id khớp pending → resolve/reject tương ứng
                                const pending = this._pending.get(obj.id);
                                if (pending) {
                                    this._pending.delete(obj.id);
                                    clearTimeout(pending.timer);
                                    if (obj.error) {
                                        pending.reject(new Error(obj.error.message || 'MCP error'));
                                    } else {
                                        pending.resolve(obj.result);
                                    }
                                }
                            }
                        }
                    }
                }

                // SSE đóng: fail mọi pending
                for (const [id, p] of this._pending) {
                    clearTimeout(p.timer);
                    p.reject(new Error('SSE closed'));
                }
                this._pending.clear();
                if (!this.sessionPath && rejectEndpoint) rejectEndpoint(new Error('SSE closed before endpoint'));
            } catch (e) {
                // Lỗi đọc: fail mọi pending
                for (const [id, p] of this._pending) {
                    clearTimeout(p.timer);
                    p.reject(e);
                }
                this._pending.clear();
                if (rejectEndpoint) rejectEndpoint(e);
            }
        })();

        // Trả về sau khi có endpoint (vẫn giữ SSE mở để nhận phản hồi RPC)
        return this._endpointReady;
    }

    // Session recovery method
    async _attemptSessionRecovery() {
        if (!this.sessionId) {
            throw new Error('No session ID available for recovery');
        }

        console.log('🔄 Attempting to recover session:', this.sessionId);
        
        // Thử kết nối lại với session ID cũ
        const recoveryUrl = `${this.base}/sse?sessionId=${this.sessionId}`;
        console.log('🔄 Making GET request to:', recoveryUrl);
        this.controller = new AbortController();
        
        const r = await fetch(recoveryUrl, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
            signal: this.controller.signal,
        });

        console.log('🔄 Recovery response status:', r.status);
        if (!r.ok) {
            throw new Error(`Session recovery failed: HTTP ${r.status}`);
        }

        // Nếu thành công, cập nhật session path
        this.sessionPath = `/messages?sessionId=${this.sessionId}`;
        this.connectionState = 'connected';
        console.log('✅ Session recovery successful');
        
        return this.sessionPath;
    }

    _tryJSON(text) {
        try { return JSON.parse(text); } catch { return null; }
    }

    _tryExtractJSON(text) {
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first >= 0 && last > first) {
            try { return JSON.parse(text.slice(first, last + 1)); } catch { /* ignore */ }
        }
        return null;
    }

    // Gửi POST và chờ phản hồi qua SSE (khớp id) với retry logic
    async rpc(method, params = {}, id = Date.now()) {
        let lastError = null;
        
        for (let attempt = 0; attempt <= this._maxReconnectAttempts; attempt++) {
            try {
                if (!this.sessionPath || this.connectionState !== 'connected') {
                    console.log(`🔄 Attempt ${attempt + 1}: Connecting to MCP...`);
                    await this.connect();
                }
                
                const url = this.sessionPath.startsWith('http') ? this.sessionPath : `${this.base}${this.sessionPath}`;
                console.log(`📤 MCP RPC (attempt ${attempt + 1}):`, method, 'to', url);

                // Tạo promise chờ SSE trả về id này
                const waitPromise = new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        this._pending.delete(id);
                        console.log('⏰ MCP RPC timeout for id', id, 'method:', method);
                        reject(new Error(`MCP RPC timeout for id ${id}`));
                    }, this._defaultTimeoutMs);
                    this._pending.set(id, { resolve, reject, timer });
                });

                // Gửi POST (không kỳ vọng JSON trả về ở HTTP body)
                const headers = { ...this.headers, 'content-type': 'application/json' };
                if (this.cookie) headers['cookie'] = this.cookie;

                console.log(`🔍 About to send POST to: ${url}`);
                const r = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
                });
                console.log(`🔍 POST response status: ${r.status}`);

                // Một số server trả 200/202 kèm text "ACK..." → ta không parse JSON ở đây.
                if (!r.ok) {
                    console.log(`🔍 HTTP error detected: ${r.status}`);
                    // cố đọc body để gợi ý lỗi
                    const t = await r.text().catch(() => '');
                    console.log('❌ MCP HTTP error:', r.status, t.slice(0, 200));
                    // dọn pending id vì không có phản hồi SSE hợp lệ
                    const p = this._pending.get(id);
                    if (p) { clearTimeout(p.timer); this._pending.delete(id); }
                    
                    // Handle 410 Gone - Session inactive
                    if (r.status === 410) {
                        console.log('🔍 Received 410 error, parsing response...');
                        try {
                            const errorData = JSON.parse(t);
                            console.log('🔍 Parsed 410 error data:', errorData);
                            if (errorData.error?.data?.action === 'reconnect_sse') {
                                console.log('🔄 Detected reconnect_sse action, throwing reconnect error');
                                console.log('🔄 About to throw error...');
                                throw new Error('Session inactive - need SSE reconnect');
                            } else {
                                console.log('❌ No reconnect_sse action found in 410 response');
                                // Vẫn throw error để trigger reconnect
                                throw new Error('Session inactive - need SSE reconnect');
                            }
                        } catch (parseError) {
                            console.log('❌ Failed to parse 410 JSON:', parseError.message);
                            // Fallback: vẫn throw error để trigger reconnect
                            throw new Error('Session inactive - need SSE reconnect');
                        }
                    }
                    
                    // Check if it's a session not found error
                    if (t.includes('Session not found') || t.includes('session not found')) {
                        throw new Error('Session not found');
                    }
                    
                    // Throw error cho tất cả HTTP errors khác
                    throw new Error(`MCP HTTP ${r.status}: ${t.slice(0, 200)}...`);
                }

                console.log('📥 MCP RPC sent successfully, waiting for SSE response...');
                // Chờ SSE resolve id
                return await waitPromise;
                
            } catch (error) {
                lastError = error;
                console.log(`❌ MCP RPC attempt ${attempt + 1} failed:`, error.message);
                console.log(`🔍 Full error object:`, error);
                console.log(`🔍 Error stack:`, error.stack);
                
                // Nếu là lỗi session, thử reconnect
                console.log(`🔍 Checking if error is session-related: "${error.message}"`);
                const isSessionError = error.message.includes('SSE connection not established') || 
                    error.message.includes('SSE closed') ||
                    error.message.includes('timeout') ||
                    error.message.includes('Session not found') ||
                    error.message.includes('Session inactive - need SSE reconnect') ||
                    error.message.includes('MCP RPC timeout');
                
                console.log(`🔍 Is session error? ${isSessionError}`);
                
                if (isSessionError) {
                    
                    console.log(`✅ Error is session-related, checking retry attempts...`);
                    if (attempt < this._maxReconnectAttempts) {
                        console.log(`🔄 Session error detected, attempting reconnect (${attempt + 1}/${this._maxReconnectAttempts})...`);
                        this.connectionState = 'reconnecting';
                        this.sessionPath = null; // Reset để force reconnect
                        // Giữ sessionId để thử recovery trước khi tạo mới
                        
                        console.log(`🔄 Will call connect() to resume session: ${this.sessionId}`);
                        
                        // Delay trước khi thử lại
                        await new Promise(resolve => setTimeout(resolve, this._reconnectDelay * (attempt + 1)));
                        continue;
                    } else {
                        console.log(`❌ Max retry attempts reached (${this._maxReconnectAttempts})`);
                    }
                } else {
                    console.log(`❌ Error is not session-related, not retrying`);
                }
                
                // Nếu không phải lỗi session hoặc đã hết attempts, throw error
                break;
            }
        }
        
        throw lastError || new Error('MCP RPC failed after all retry attempts');
    }

    initialize() {
        return this.rpc('initialize', {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {}, resources: {}, prompts: {} },
            clientInfo: { name: 'ollama-mcp-http', version: '0.1.0' },
        });
    }

    async listTools() {
        const res = await this.rpc('tools/list', {}, /*id*/ Date.now() + 1);
        return res.tools || [];
    }

    toolsCall(name, args) {
        return this.rpc('tools/call', { name, arguments: args }, /*id*/ Date.now() + 2);
    }

    async checkHealth() {
        try {
            if (!this.sessionPath || this.connectionState !== 'connected') {
                return false;
            }
            
            // Thử gọi một RPC đơn giản để test connection
            await this.rpc('tools/list', {}, Date.now() + 999);
            return true;
        } catch (error) {
            return false;
        }
    }

    close() {
        try { this.controller?.abort(); } catch { }
        this.controller = null;
        this.sessionPath = null;
        this.cookie = null;
        this._endpointReady = null;
        this.connectionState = 'disconnected';
        // Không xóa sessionId để có thể recovery sau này

        for (const [, p] of this._pending) {
            clearTimeout(p.timer);
            p.reject(new Error('Client closed'));
        }
        this._pending.clear();
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
                try {
                    if (typeof fn?.arguments === 'string') {
                        args = JSON.parse(fn.arguments);
                    } else if (fn?.arguments && typeof fn.arguments === 'object') {
                        args = fn.arguments;
                    }
                } catch { }

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

// MCP status endpoint
app.get('/api/mcp/status', async (_req, res) => {
    try {
        if (!mcpClient) {
            return res.json({ 
                status: 'disconnected', 
                message: 'No MCP client initialized',
                sessionPath: null,
                sessionId: null,
                lastActivity: null
            });
        }

        const isHealthy = await mcpClient.checkHealth();
        const timeSinceLastActivity = Date.now() - mcpClient.lastActivity;
        
        res.json({ 
            status: isHealthy ? 'connected' : 'unhealthy',
            connectionState: mcpClient.connectionState,
            sessionPath: mcpClient.sessionPath,
            sessionId: mcpClient.sessionId,
            lastActivity: new Date(mcpClient.lastActivity).toISOString(),
            timeSinceLastActivity: `${Math.round(timeSinceLastActivity / 1000)}s`,
            pendingRequests: mcpClient._pending.size,
            reconnectAttempts: mcpClient._reconnectAttempts
        });
    } catch (e) {
        res.status(500).json({ 
            status: 'error', 
            error: e.message,
            sessionPath: mcpClient?.sessionPath || null,
            sessionId: mcpClient?.sessionId || null
        });
    }
});

app.listen(8055, '0.0.0.0', () => {
    console.log('✅ API chạy: http://0.0.0.0:8055');
    console.log('🤖 Ollama baseURL:', OLLAMA_BASE, ' | MODEL:', MODEL_NAME);
    console.log('🌐 MCP base:', MCP_BASE, ' (HTTP + SSE)');
    console.log('ℹ️ Flow: GET /sse → nhận "event:endpoint" → POST JSON-RPC vào /messages?sessionId=...');
});
