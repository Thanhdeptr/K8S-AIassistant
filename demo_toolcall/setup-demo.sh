#!/bin/bash

echo "🚀 Setup OpenRouter Tool Calling Demo"
echo "======================================"

# Kiểm tra Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js đã được cài đặt: $(node --version)"
else
    echo "❌ Node.js chưa được cài đặt. Vui lòng cài đặt Node.js >= 14.0.0"
    exit 1
fi

# Kiểm tra npm
if command -v npm &> /dev/null; then
    echo "✅ npm đã được cài đặt: $(npm --version)"
else
    echo "❌ npm chưa được cài đặt"
    exit 1
fi

# Cài đặt dependencies cho Node.js
echo ""
echo "📦 Cài đặt dependencies cho Node.js..."
npm install

# Kiểm tra Python
if command -v python3 &> /dev/null; then
    echo "✅ Python3 đã được cài đặt: $(python3 --version)"
    
    # Cài đặt dependencies cho Python
    echo ""
    echo "📦 Cài đặt dependencies cho Python..."
    pip3 install -r requirements.txt
else
    echo "⚠️  Python3 chưa được cài đặt. Chỉ có thể chạy demo Node.js"
fi

# Tạo file .env mẫu
if [ ! -f .env ]; then
    echo ""
    echo "📝 Tạo file .env mẫu..."
    echo "OPENROUTER_API_KEY=your-api-key-here" > .env
    echo "✅ Đã tạo file .env. Vui lòng cập nhật API key của bạn"
else
    echo "✅ File .env đã tồn tại"
fi

echo ""
echo "🎉 Setup hoàn thành!"
echo ""
echo "📋 Hướng dẫn sử dụng:"
echo "1. Cập nhật OPENROUTER_API_KEY trong file .env"
echo "2. Chạy demo Node.js: npm start"
echo "3. Chạy demo Python: python3 openrouter_tool_call_demo.py"
echo "4. Chạy interactive mode: npm run interactive"
echo ""
echo "📚 Xem README-demo.md để biết thêm chi tiết"
