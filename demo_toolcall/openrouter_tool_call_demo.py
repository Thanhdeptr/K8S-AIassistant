#!/usr/bin/env python3
"""
OpenRouter Tool Calling Demo với GPT-OSS-20B (Free)
Python version
"""

import os
import json
import asyncio
import aiohttp
import random
import time
from typing import Dict, List, Any, Optional

# Cấu hình
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', 'your-api-key-here')
MODEL = 'openai/gpt-oss-20b:free'
API_URL = 'https://openrouter.ai/api/v1/chat/completions'

# Định nghĩa tools
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Lấy thông tin thời tiết hiện tại và dự báo 5 ngày cho một địa điểm cụ thể",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "Tên thành phố, mã bưu điện hoặc tọa độ (lat,lng). Ví dụ: 'Hanoi', '10000', '21.0285,105.8542'"
                    },
                    "units": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "Đơn vị nhiệt độ",
                        "default": "celsius"
                    }
                },
                "required": ["location"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "Thực hiện các phép tính toán học cơ bản",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Biểu thức toán học cần tính. Ví dụ: '2 + 3 * 4', 'sqrt(16)', 'sin(90)'"
                    }
                },
                "required": ["expression"]
            }
        }
    }
]


class OpenRouterToolCallDemo:
    def __init__(self):
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def call_openrouter(self, messages: List[Dict], tools: Optional[List[Dict]] = None) -> Dict:
        """Gọi OpenRouter API"""
        request_body = {
            "model": MODEL,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1000
        }
        
        if tools:
            request_body["tools"] = tools
        
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/your-repo/demo",
            "X-Title": "OpenRouter Tool Call Demo"
        }
        
        try:
            async with self.session.post(API_URL, json=request_body, headers=headers) as response:
                if not response.ok:
                    error_text = await response.text()
                    raise Exception(f"API Error: {response.status} - {error_text}")
                
                return await response.json()
        except Exception as e:
            print(f"❌ Lỗi khi gọi OpenRouter API: {e}")
            raise
    
    async def mock_get_weather(self, location: str, units: str = "celsius") -> Dict:
        """Mock weather API"""
        await asyncio.sleep(1)  # Giả lập delay network
        
        temperature = random.randint(10, 40)
        humidity = random.randint(40, 80)
        
        return {
            "location": location,
            "current": {
                "temperature": temperature,
                "unit": units,
                "humidity": humidity,
                "condition": "Partly Cloudy",
                "description": f"Thời tiết {location}: {temperature}°{'C' if units == 'celsius' else 'F'}, độ ẩm {humidity}%"
            },
            "forecast": [
                {"day": "Hôm nay", "temp": temperature, "condition": "Partly Cloudy"},
                {"day": "Ngày mai", "temp": temperature + 2, "condition": "Sunny"},
                {"day": "Ngày kia", "temp": temperature - 1, "condition": "Cloudy"}
            ]
        }
    
    async def mock_calculate(self, expression: str) -> Dict:
        """Mock calculator"""
        await asyncio.sleep(0.5)
        
        try:
            # Chỉ cho phép các phép tính an toàn
            safe_expression = ''.join(c for c in expression if c.isdigit() or c in '+-*/().,')
            result = eval(safe_expression)
            return {
                "expression": expression,
                "result": result,
                "calculation": f"{expression} = {result}"
            }
        except Exception as e:
            return {
                "error": f"Không thể tính toán: {expression}",
                "reason": str(e)
            }
    
    async def execute_tool(self, tool_call: Dict) -> Dict:
        """Thực thi tool"""
        name = tool_call["function"]["name"]
        args = json.loads(tool_call["function"]["arguments"])
        
        print(f"🔧 Thực thi tool: {name} với arguments: {args}")
        
        if name == "get_weather":
            return await self.mock_get_weather(args["location"], args.get("units", "celsius"))
        elif name == "calculate":
            return await self.mock_calculate(args["expression"])
        else:
            return {"error": f"Tool {name} không được hỗ trợ"}
    
    async def handle_tool_calling(self, user_message: str) -> str:
        """Xử lý tool calling"""
        print("🤖 Bắt đầu xử lý tool calling...\n")
        
        messages = [
            {
                "role": "user",
                "content": user_message
            }
        ]
        
        try:
            # Bước 1: Gửi request với tools
            print("📤 Bước 1: Gửi request với tools...")
            response1 = await self.call_openrouter(messages, TOOLS)
            
            assistant_message = response1["choices"][0]["message"]
            print(f"🤖 Assistant response: {assistant_message.get('content', 'Tool calls được yêu cầu')}")
            
            # Kiểm tra xem có tool calls không
            if not assistant_message.get("tool_calls"):
                print("✅ Không có tool calls, trả về response trực tiếp")
                return assistant_message.get("content", "")
            
            # Bước 2: Thực thi các tools
            print("\n🔧 Bước 2: Thực thi tools...")
            tool_results = []
            
            for tool_call in assistant_message["tool_calls"]:
                result = await self.execute_tool(tool_call)
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "name": tool_call["function"]["name"],
                    "content": json.dumps(result, ensure_ascii=False, indent=2)
                })
            
            # Bước 3: Gửi kết quả tools về
            print("\n📤 Bước 3: Gửi kết quả tools về...")
            final_messages = [
                *messages,
                assistant_message,
                *tool_results
            ]
            
            response2 = await self.call_openrouter(final_messages, TOOLS)
            final_response = response2["choices"][0]["message"]
            
            print("\n✅ Kết quả cuối cùng:")
            return final_response.get("content", "")
            
        except Exception as e:
            print(f"❌ Lỗi trong quá trình xử lý: {e}")
            raise
    
    async def run_demo(self):
        """Chạy demo mode"""
        print("🚀 Demo OpenRouter Tool Calling với GPT-OSS-20B (Free)\n")
        
        if OPENROUTER_API_KEY == "your-api-key-here":
            print("❌ Vui lòng set OPENROUTER_API_KEY environment variable")
            print("   Hoặc tạo file .env với nội dung: OPENROUTER_API_KEY=your-key-here")
            return
        
        demos = [
            "Thời tiết ở Hà Nội hôm nay như thế nào?",
            "Tính toán: (15 + 25) * 2 / 5",
            "Cho tôi biết thời tiết ở TP.HCM và tính 100 + 200"
        ]
        
        for i, demo in enumerate(demos):
            print(f"\n{'='*60}")
            print(f"📝 Demo {i+1}: {demo}")
            print(f"{'='*60}")
            
            try:
                result = await self.handle_tool_calling(demo)
                print(f"\n💬 Kết quả: {result}")
            except Exception as e:
                print(f"❌ Lỗi: {e}")
            
            # Delay giữa các demo
            if i < len(demos) - 1:
                print("\n⏳ Chờ 3 giây trước demo tiếp theo...")
                await asyncio.sleep(3)
        
        print("\n🎉 Demo hoàn thành!")
    
    async def interactive_mode(self):
        """Chạy interactive mode"""
        print("🚀 Interactive Mode - OpenRouter Tool Calling Demo\n")
        print("Nhập câu hỏi của bạn (hoặc 'quit' để thoát):\n")
        
        while True:
            try:
                user_input = input("> ").strip()
                
                if user_input.lower() == "quit":
                    print("👋 Tạm biệt!")
                    break
                
                if not user_input:
                    continue
                
                result = await self.handle_tool_calling(user_input)
                print(f"\n💬 Kết quả: {result}\n")
                
            except KeyboardInterrupt:
                print("\n👋 Tạm biệt!")
                break
            except Exception as e:
                print(f"❌ Lỗi: {e}\n")


async def main():
    """Main function"""
    import sys
    
    args = sys.argv[1:]
    
    async with OpenRouterToolCallDemo() as demo:
        if "--interactive" in args or "-i" in args:
            await demo.interactive_mode()
        else:
            await demo.run_demo()


if __name__ == "__main__":
    asyncio.run(main())
