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

async function testOpenRouter() {
    console.log('🧪 Testing OpenRouter gpt-oss-20b connection...');
    console.log('📊 Model info: 131,072 context tokens, MoE architecture, Free tier');
    
    try {
        const completion = await openai.chat.completions.create({
            model: 'openai/gpt-oss-20b:free',
            messages: [
                { role: 'user', content: 'Hello! I am testing gpt-oss-20b from OpenRouter. Please respond with "OpenRouter gpt-oss-20b is working perfectly!"' }
            ],
            max_tokens: 100,
            temperature: 0.7
        });
        
        console.log('✅ OpenRouter gpt-oss-20b connection successful!');
        console.log('🤖 Model:', completion.model);
        console.log('📝 Response:', completion.choices[0]?.message?.content);
        console.log('💰 Usage:', completion.usage);
        
    } catch (error) {
        console.error('❌ OpenRouter connection failed:');
        console.error('Error:', error.message);
        
        if (error.message.includes('timeout')) {
            console.error('💡 Suggestion: Check internet connection or firewall settings');
        } else if (error.message.includes('401')) {
            console.error('💡 Suggestion: Check API key - visit https://openrouter.ai/keys');
        } else if (error.message.includes('429')) {
            console.error('💡 Suggestion: Rate limit exceeded, try again later');
        } else if (error.message.includes('model')) {
            console.error('💡 Suggestion: Check if model "openai/gpt-oss-20b:free" is available');
        }
    }
}

testOpenRouter(); 