# 🚀 Demo OpenRouter Tool Calling

Folder này chứa demo hoàn chỉnh để test OpenRouter tool calling với GPT-OSS-20B (free).

## 📁 Cấu trúc Files

```
demo-openrouter-tool/
├── openrouter-tool-call-demo.js    # Demo Node.js đầy đủ
├── openrouter_tool_call_demo.py    # Demo Python đầy đủ
├── quick-test.js                   # Test nhanh đơn giản
├── package.json                    # Dependencies Node.js
├── requirements.txt                # Dependencies Python
├── README.md                       # Hướng dẫn chi tiết
├── QUICK-START.md                  # Hướng dẫn nhanh
├── setup-demo.sh                   # Script setup tự động
└── env.example                     # File cấu hình mẫu
```

## ⚡ Bắt đầu nhanh

### 1. Cài đặt
```bash
cd demo-openrouter-tool
npm install
```

### 2. Cấu hình API Key
```bash
# Copy file mẫu
cp env.example .env

# Sửa file .env và thêm API key của bạn
OPENROUTER_API_KEY=your-actual-api-key
```

### 3. Chạy Demo
```bash
# Test nhanh
node quick-test.js

# Demo đầy đủ
npm start

# Interactive mode
npm run interactive
```

## 🎯 Tính năng

- ✅ Tool calling với GPT-OSS-20B (free)
- ✅ Mock tools: Weather API, Calculator, Time
- ✅ Demo mode và Interactive mode
- ✅ Hỗ trợ cả Node.js và Python
- ✅ Error handling và logging chi tiết
- ✅ Hướng dẫn chi tiết và troubleshooting

## 🔧 Tools có sẵn

1. **get_weather**: Lấy thông tin thời tiết
2. **calculate**: Thực hiện phép tính toán học
3. **get_current_time**: Lấy thời gian hiện tại

## 📚 Tài liệu

- `README.md` - Hướng dẫn chi tiết
- `QUICK-START.md` - Hướng dẫn nhanh
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [GPT-OSS-20B Model](https://openrouter.ai/openai/gpt-oss-20b:free/api)

## 🆘 Hỗ trợ

Nếu gặp vấn đề, hãy xem phần Troubleshooting trong `README.md` hoặc tạo issue trên GitHub.
