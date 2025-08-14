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

// Test function với tool calling theo chuẩn OpenRouter
async function testToolCalling(modelName) {
    console.log(`\n🔧 Testing Tool Calling với model: ${modelName}`);
    console.log('📚 Theo chuẩn: https://openrouter.ai/docs/features/tool-calling');
    
    // Tool đơn giản theo chuẩn OpenRouter
    const tools = [
        {
            type: 'function',
            function: {
                name: 'get_weather_forecast',
                description: 'Get current weather conditions for a specific location. Supports cities and coordinates.',
                parameters: {
                    type: 'object',
                    properties: {
                        location: {
                            type: 'string',
                            description: 'City name or coordinates. Examples: "San Francisco", "New York", "40.7128,-74.0060"'
                        },
                        units: {
                            type: 'string',
                            enum: ['celsius', 'fahrenheit'],
                            description: 'Temperature unit preference',
                            default: 'celsius'
                        }
                    },
                    required: ['location']
                }
            }
        }
    ];

    console.log('🔧 Tool schema:', JSON.stringify(tools[0], null, 2));

    try {
        // Step 1: Initial request với tools
        console.log('\n📤 Step 1: Sending tool calling request...');
        const completion = await openai.chat.completions.create({
            model: modelName,
            messages: [
                { role: 'user', content: 'What is the current weather in San Francisco?' }
            ],
            tools: tools,              // Tools phải có trong mọi request
            tool_choice: 'auto',       // Let model decide
            parallel_tool_calls: true // Allow parallel tool calls
        });
        
        console.log('✅ Response received!');
        console.log('🤖 Model used:', completion.model || modelName);
        console.log('📊 Usage:', completion.usage);
        
        const message = completion.choices[0]?.message;
        console.log('📝 Message role:', message?.role);
        console.log('📝 Message content:', message?.content);
        console.log('🔧 Tool calls count:', message?.tool_calls?.length || 0);
        
        if (message?.tool_calls && message.tool_calls.length > 0) {
            console.log('\n🎯 Tool calls found!');
            message.tool_calls.forEach((call, index) => {
                console.log(`Tool ${index + 1}:`);
                console.log(`  ID: ${call.id}`);
                console.log(`  Type: ${call.type}`);
                console.log(`  Function: ${call.function.name}`);
                console.log(`  Arguments: ${call.function.arguments}`);
            });
            
            // Step 2: Simulate tool execution (trong thực tế sẽ gọi API thật)
            console.log('\n📋 Step 2: Tool execution simulation...');
            const toolResults = message.tool_calls.map(call => {
                return {
                    role: 'tool',
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({
                        location: 'San Francisco',
                        temperature: '18°C',
                        condition: 'Partly cloudy',
                        humidity: '65%'
                    })
                };
            });
            
            console.log('🔧 Tool results:', toolResults);
            
            // Step 3: Send tool results back
            console.log('\n📤 Step 3: Sending tool results back...');
            const finalMessages = [
                { role: 'user', content: 'What is the current weather in San Francisco?' },
                message,  // Assistant message với tool_calls
                ...toolResults  // Tool results
            ];
            
            const finalCompletion = await openai.chat.completions.create({
                model: modelName,
                messages: finalMessages,
                tools: tools  // Tools phải có trong mọi request
            });
            
            console.log('✅ Final response:');
            console.log('📝 Answer:', finalCompletion.choices[0]?.message?.content);
            
            return true;
        } else {
            console.log('❌ No tool calls in response - model did not use tools');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Tool calling failed:');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        if (error.message.includes('No endpoints found that support tool use')) {
            console.error('💡 Model không có provider hỗ trợ tool use trên OpenRouter');
        } else if (error.message.includes('404')) {
            console.error('💡 Model hoặc endpoint không tồn tại');
        } else if (error.message.includes('401')) {
            console.error('💡 API key không hợp lệ');
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