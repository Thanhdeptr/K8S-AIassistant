// Test script để kiểm tra kết nối OpenRouter
const OpenAI = require('openai');

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: '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',
    defaultHeaders: {
        'HTTP-Referer': 'http://localhost:8055',
        'X-Title': 'K8s Assistant MCP'
    },
    timeout: 30000,
});

async function testOpenRouter() {
    console.log('🧪 Testing OpenRouter connection...');
    
    try {
        const completion = await openai.chat.completions.create({
            model: 'openai/gpt-oss-20b:free',
            messages: [
                { role: 'user', content: 'Hello! Just say "OpenRouter is working!"' }
            ],
            max_tokens: 50
        });
        
        console.log('✅ OpenRouter connection successful!');
        console.log('Response:', completion.choices[0]?.message?.content);
        
    } catch (error) {
        console.error('❌ OpenRouter connection failed:');
        console.error('Error:', error.message);
        
        if (error.message.includes('timeout')) {
            console.error('💡 Suggestion: Check internet connection or firewall settings');
        } else if (error.message.includes('401')) {
            console.error('💡 Suggestion: Check API key');
        } else if (error.message.includes('429')) {
            console.error('💡 Suggestion: Rate limit exceeded, try again later');
        }
    }
}

testOpenRouter(); 