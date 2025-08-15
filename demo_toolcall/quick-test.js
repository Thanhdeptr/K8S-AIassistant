// Quick test OpenRouter Tool Calling
const fetch = require('node-fetch');

// Cấu hình
const API_KEY = process.env.OPENROUTER_API_KEY || 'your-api-key-here';
const MODEL = 'openai/gpt-oss-20b:free';

// Tool đơn giản
const tools = [
    {
        type: "function",
        function: {
            name: "get_current_time",
            description: "Lấy thời gian hiện tại",
            parameters: {
                type: "object",
                properties: {
                    timezone: {
                        type: "string",
                        description: "Múi giờ (ví dụ: 'Asia/Ho_Chi_Minh')",
                        default: "Asia/Ho_Chi_Minh"
                    }
                },
                required: []
            }
        }
    }
];

async function quickTest() {
    console.log('🚀 Quick Test OpenRouter Tool Calling\n');

    if (API_KEY === 'your-api-key-here') {
        console.log('❌ Vui lòng set OPENROUTER_API_KEY');
        return;
    }

    const messages = [
        {
            role: 'user',
            content: 'Bây giờ là mấy giờ?'
        }
    ];

    try {
        console.log('📤 Gửi request...');

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: MODEL,
                messages: messages,
                tools: tools,
                temperature: 0.7,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API Error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        const assistantMessage = data.choices[0].message;

        console.log('🤖 Response:', JSON.stringify(assistantMessage, null, 2));

        if (assistantMessage.tool_calls) {
            console.log('\n🔧 Tool calls được yêu cầu!');

            // Mock tool execution
            const toolResults = assistantMessage.tool_calls.map(toolCall => {
                const now = new Date().toLocaleString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh'
                });

                return {
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
                    content: JSON.stringify({
                        current_time: now,
                        timezone: 'Asia/Ho_Chi_Minh'
                    })
                };
            });

            console.log('📤 Gửi tool results...');

            const finalResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [
                        ...messages,
                        assistantMessage,
                        ...toolResults
                    ],
                    tools: tools,
                    temperature: 0.7,
                    max_tokens: 500
                })
            });

            if (!finalResponse.ok) {
                const error = await finalResponse.text();
                throw new Error(`API Error: ${finalResponse.status} - ${error}`);
            }

            const finalData = await finalResponse.json();
            console.log('\n✅ Kết quả cuối cùng:');
            console.log(finalData.choices[0].message.content);

        } else {
            console.log('\n✅ Response trực tiếp:');
            console.log(assistantMessage.content);
        }

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
    }
}

quickTest();
