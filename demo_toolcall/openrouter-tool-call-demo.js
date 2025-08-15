const fetch = require('node-fetch');

// Cấu hình
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'your-api-key-here';
const MODEL = 'openai/gpt-oss-20b:free';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Định nghĩa tools
const tools = [
    {
        type: "function",
        function: {
            name: "get_weather",
            description: "Lấy thông tin thời tiết hiện tại và dự báo 5 ngày cho một địa điểm cụ thể",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "Tên thành phố, mã bưu điện hoặc tọa độ (lat,lng). Ví dụ: 'Hanoi', '10000', '21.0285,105.8542'"
                    },
                    units: {
                        type: "string",
                        enum: ["celsius", "fahrenheit"],
                        description: "Đơn vị nhiệt độ",
                        default: "celsius"
                    }
                },
                required: ["location"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "calculate",
            description: "Thực hiện các phép tính toán học cơ bản",
            parameters: {
                type: "object",
                properties: {
                    expression: {
                        type: "string",
                        description: "Biểu thức toán học cần tính. Ví dụ: '2 + 3 * 4', 'sqrt(16)', 'sin(90)'"
                    }
                },
                required: ["expression"]
            }
        }
    }
];

// Mock function để thực thi tools
async function executeTool(toolCall) {
    const { name, arguments: args } = toolCall.function;
    const parsedArgs = JSON.parse(args);

    console.log(`🔧 Thực thi tool: ${name} với arguments:`, parsedArgs);

    switch (name) {
        case 'get_weather':
            return await mockGetWeather(parsedArgs.location, parsedArgs.units);
        case 'calculate':
            return await mockCalculate(parsedArgs.expression);
        default:
            return { error: `Tool ${name} không được hỗ trợ` };
    }
}

// Mock weather API
async function mockGetWeather(location, units = 'celsius') {
    // Giả lập delay network
    await new Promise(resolve => setTimeout(resolve, 1000));

    const temperature = Math.floor(Math.random() * 30) + 10;
    const humidity = Math.floor(Math.random() * 40) + 40;

    return {
        location: location,
        current: {
            temperature: temperature,
            unit: units,
            humidity: humidity,
            condition: "Partly Cloudy",
            description: `Thời tiết ${location}: ${temperature}°${units === 'celsius' ? 'C' : 'F'}, độ ẩm ${humidity}%`
        },
        forecast: [
            { day: "Hôm nay", temp: temperature, condition: "Partly Cloudy" },
            { day: "Ngày mai", temp: temperature + 2, condition: "Sunny" },
            { day: "Ngày kia", temp: temperature - 1, condition: "Cloudy" }
        ]
    };
}

// Mock calculator
async function mockCalculate(expression) {
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
        // Chỉ cho phép các phép tính an toàn
        const safeExpression = expression.replace(/[^0-9+\-*/().,]/g, '');
        const result = eval(safeExpression);
        return {
            expression: expression,
            result: result,
            calculation: `${expression} = ${result}`
        };
    } catch (error) {
        return {
            error: `Không thể tính toán: ${expression}`,
            reason: error.message
        };
    }
}

// Hàm chính để gọi OpenRouter API
async function callOpenRouter(messages, tools = null) {
    const requestBody = {
        model: MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
    };

    if (tools) {
        requestBody.tools = tools;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/your-repo/demo', // Optional
                'X-Title': 'OpenRouter Tool Call Demo' // Optional
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ Lỗi khi gọi OpenRouter API:', error.message);
        throw error;
    }
}

// Hàm chính để xử lý tool calling
async function handleToolCalling(userMessage) {
    console.log('🤖 Bắt đầu xử lý tool calling...\n');

    const messages = [
        {
            role: 'user',
            content: userMessage
        }
    ];

    try {
        // Bước 1: Gửi request với tools
        console.log('📤 Bước 1: Gửi request với tools...');
        const response1 = await callOpenRouter(messages, tools);

        const assistantMessage = response1.choices[0].message;
        console.log('🤖 Assistant response:', assistantMessage.content || 'Tool calls được yêu cầu');

        // Kiểm tra xem có tool calls không
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
            console.log('✅ Không có tool calls, trả về response trực tiếp');
            return assistantMessage.content;
        }

        // Bước 2: Thực thi các tools
        console.log('\n🔧 Bước 2: Thực thi tools...');
        const toolResults = [];

        for (const toolCall of assistantMessage.tool_calls) {
            const result = await executeTool(toolCall);
            toolResults.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
                content: JSON.stringify(result, null, 2)
            });
        }

        // Bước 3: Gửi kết quả tools về
        console.log('\n📤 Bước 3: Gửi kết quả tools về...');
        const finalMessages = [
            ...messages,
            assistantMessage,
            ...toolResults
        ];

        const response2 = await callOpenRouter(finalMessages, tools);
        const finalResponse = response2.choices[0].message;

        console.log('\n✅ Kết quả cuối cùng:');
        return finalResponse.content;

    } catch (error) {
        console.error('❌ Lỗi trong quá trình xử lý:', error.message);
        throw error;
    }
}

// Demo function
async function runDemo() {
    console.log('🚀 Demo OpenRouter Tool Calling với GPT-OSS-20B (Free)\n');

    if (OPENROUTER_API_KEY === 'your-api-key-here') {
        console.log('❌ Vui lòng set OPENROUTER_API_KEY environment variable');
        console.log('   Hoặc tạo file .env với nội dung: OPENROUTER_API_KEY=your-key-here');
        return;
    }

    const demos = [
        "Thời tiết ở Hà Nội hôm nay như thế nào?",
        "Tính toán: (15 + 25) * 2 / 5",
        "Cho tôi biết thời tiết ở TP.HCM và tính 100 + 200"
    ];

    for (let i = 0; i < demos.length; i++) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 Demo ${i + 1}: ${demos[i]}`);
        console.log(`${'='.repeat(60)}`);

        try {
            const result = await handleToolCalling(demos[i]);
            console.log(`\n💬 Kết quả: ${result}`);
        } catch (error) {
            console.log(`❌ Lỗi: ${error.message}`);
        }

        // Delay giữa các demo
        if (i < demos.length - 1) {
            console.log('\n⏳ Chờ 3 giây trước demo tiếp theo...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    console.log('\n🎉 Demo hoàn thành!');
}

// Interactive mode
async function interactiveMode() {
    console.log('🚀 Interactive Mode - OpenRouter Tool Calling Demo\n');
    console.log('Nhập câu hỏi của bạn (hoặc "quit" để thoát):\n');

    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = () => {
        rl.question('> ', async (input) => {
            if (input.toLowerCase() === 'quit') {
                console.log('👋 Tạm biệt!');
                rl.close();
                return;
            }

            try {
                const result = await handleToolCalling(input);
                console.log(`\n💬 Kết quả: ${result}\n`);
            } catch (error) {
                console.log(`❌ Lỗi: ${error.message}\n`);
            }

            askQuestion();
        });
    };

    askQuestion();
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--interactive') || args.includes('-i')) {
        interactiveMode();
    } else {
        runDemo();
    }
}

module.exports = {
    handleToolCalling,
    callOpenRouter,
    executeTool
};
