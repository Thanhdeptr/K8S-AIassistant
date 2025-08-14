// Test script để kiểm tra kết nối OpenRouter
// Theo tài liệu: https://openrouter.ai/docs/quickstart
const OpenAI = require('openai');

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: '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',
    defaultHeaders: {
        'HTTP-Referer': 'http://192.168.10.18:8055', // Site URL for rankings
        'X-Title': 'K8s Assistant MCP' // Site title for rankings
    }
});

// Test function với tool calling đơn giản
async function testToolCalling(modelName) {
    console.log(`\n🔧 Testing Tool Calling với model: ${modelName}`);
    
    // Định nghĩa tool đơn giản
    const simpleTools = [
        {
            type: 'function',
            function: {
                name: 'get_current_weather',
                description: 'Get the current weather for a location',
                parameters: {
                    type: 'object',
                    properties: {
                        location: {
                            type: 'string',
                            description: 'The city and state, e.g. San Francisco, CA'
                        },
                        unit: {
                            type: 'string',
                            enum: ['celsius', 'fahrenheit'],
                            description: 'Temperature unit'
                        }
                    },
                    required: ['location']
                }
            }
        }
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: modelName,
            messages: [
                { role: 'user', content: 'What is the weather like in San Francisco?' }
            ],
            tools: simpleTools,
            tool_choice: 'auto',
            max_tokens: 100
        });
        
        console.log('✅ Tool calling successful!');
        console.log('🤖 Model:', completion.model || modelName);
        console.log('📝 Response:', completion.choices[0]?.message);
        console.log('🔧 Tool calls:', completion.choices[0]?.message?.tool_calls?.length || 0);
        
        if (completion.choices[0]?.message?.tool_calls) {
            console.log('🎯 Tool call details:', JSON.stringify(completion.choices[0].message.tool_calls, null, 2));
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Tool calling failed:');
        console.error('Error:', error.message);
        
        if (error.message.includes('No endpoints found that support tool use')) {
            console.error('💡 This model does not have providers that support tool use on OpenRouter');
        }
        
        return false;
    }
}

async function testOpenRouter() {
    console.log('🧪 Testing Tool Calling for gpt-oss-20b:free only...');
    
    // Test tool calling cho gpt-oss-20b:free
    const modelName = 'openai/gpt-oss-20b:free';
    console.log(`\n🔧 Testing Tool Calling for: ${modelName}`);
    
    const success = await testToolCalling(modelName);
    
    if (success) {
        console.log('\n✅ KẾT LUẬN: gpt-oss-20b:free HỖ TRỢ tool calling!');
        console.log('💡 Vấn đề có thể ở cách gọi API trong server.js');
    } else {
        console.log('\n❌ KẾT LUẬN: gpt-oss-20b:free KHÔNG HỖ TRỢ tool calling!');
        console.log('💡 Cần đổi sang model khác hoặc sử dụng Ollama local');
    }
}

testOpenRouter(); 