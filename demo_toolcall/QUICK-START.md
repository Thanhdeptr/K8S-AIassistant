# 🚀 Quick Start - OpenRouter Tool Calling Demo

## ⚡ Bắt đầu nhanh trong 3 bước

### 1. Lấy API Key
1. Truy cập [OpenRouter](https://openrouter.ai/)
2. Đăng ký tài khoản miễn phí
3. Tạo API key mới

### 2. Cấu hình API Key
```bash
# Cách 1: Environment variable
export OPENROUTER_API_KEY="your-api-key-here"

# Cách 2: File .env
echo "OPENROUTER_API_KEY=your-api-key-here" > .env
```

### 3. Chạy Demo

**Node.js (Khuyến nghị):**
```bash
# Cài đặt dependencies
npm install

# Test nhanh
node quick-test.js

# Demo đầy đủ
npm start

# Interactive mode
npm run interactive
```

**Python:**
```bash
# Cài đặt dependencies
pip install -r requirements.txt

# Chạy demo
python3 openrouter_tool_call_demo.py

# Interactive mode
python3 openrouter_tool_call_demo.py --interactive
```

## 🎯 Ví dụ sử dụng

### Input: "Thời tiết ở Hà Nội hôm nay như thế nào?"
```
🔧 Thực thi tool: get_weather với arguments: { location: 'Hanoi', units: 'celsius' }

💬 Kết quả: Dựa trên thông tin thời tiết hiện tại, Hà Nội có nhiệt độ 25°C với độ ẩm 65%. 
Thời tiết hôm nay khá dễ chịu với bầu trời hơi nhiều mây.
```

### Input: "Tính toán: (15 + 25) * 2 / 5"
```
🔧 Thực thi tool: calculate với arguments: { expression: '(15 + 25) * 2 / 5' }

💬 Kết quả: Kết quả của phép tính (15 + 25) * 2 / 5 = 16
```

## 🔧 Tools có sẵn

1. **get_weather**: Lấy thông tin thời tiết
2. **calculate**: Thực hiện phép tính toán học
3. **get_current_time**: Lấy thời gian hiện tại (trong quick-test.js)

## 🆘 Troubleshooting

- **Lỗi 401**: Kiểm tra API key
- **Lỗi 429**: Rate limit, chờ vài giây
- **Lỗi "Tool không được hỗ trợ"**: Kiểm tra tên tool

## 📚 Tài liệu chi tiết

Xem `README-demo.md` để biết thêm chi tiết về:
- Cài đặt đầy đủ
- Tùy chỉnh tools
- Cấu trúc code
- Best practices
