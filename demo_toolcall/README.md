# OpenRouter Tool Calling Demo với GPT-OSS-20B (Free)

Demo này minh họa cách sử dụng tool calling (function calling) với OpenRouter API và model GPT-OSS-20B miễn phí.

## 🚀 Tính năng

- ✅ Tool calling với GPT-OSS-20B (free)
- ✅ Mock tools: Weather API và Calculator
- ✅ Interactive mode để test
- ✅ Demo mode với các ví dụ có sẵn
- ✅ Error handling và logging chi tiết

## 📋 Yêu cầu

- Node.js >= 14.0.0
- OpenRouter API key (miễn phí)

## 🛠️ Cài đặt

### 1. Clone hoặc tạo project

```bash
mkdir openrouter-demo
cd openrouter-demo
```

### 2. Copy các file demo

Copy các file sau vào thư mục:
- `openrouter-tool-call-demo.js`
- `demo-package.json` (đổi tên thành `package.json`)

### 3. Cài đặt dependencies

```bash
npm install
```

### 4. Lấy OpenRouter API Key

1. Truy cập [OpenRouter](https://openrouter.ai/)
2. Đăng ký tài khoản miễn phí
3. Vào phần API Keys và tạo key mới
4. Copy API key

### 5. Cấu hình API Key

**Cách 1: Environment Variable**
```bash
export OPENROUTER_API_KEY="your-api-key-here"
```

**Cách 2: File .env**
```bash
echo "OPENROUTER_API_KEY=your-api-key-here" > .env
```

**Cách 3: Trực tiếp trong code**
Sửa dòng 4 trong file `openrouter-tool-call-demo.js`:
```javascript
const OPENROUTER_API_KEY = 'your-api-key-here';
```

## 🎯 Cách sử dụng

### Chạy Demo Mode (mặc định)

```bash
npm start
# hoặc
node openrouter-tool-call-demo.js
```

Demo sẽ chạy 3 ví dụ:
1. Hỏi thời tiết Hà Nội
2. Tính toán biểu thức
3. Kết hợp cả hai

### Chạy Interactive Mode

```bash
npm run interactive
# hoặc
node openrouter-tool-call-demo.js --interactive
```

Bạn có thể nhập câu hỏi tùy ý và xem kết quả tool calling.

## 🔧 Tools có sẵn

### 1. Weather Tool (`get_weather`)
- **Mô tả**: Lấy thông tin thời tiết cho một địa điểm
- **Parameters**:
  - `location` (required): Tên thành phố, mã bưu điện hoặc tọa độ
  - `units` (optional): "celsius" hoặc "fahrenheit"

**Ví dụ**:
```
"Thời tiết ở Hà Nội hôm nay như thế nào?"
"Cho tôi biết thời tiết TP.HCM với đơn vị Fahrenheit"
```

### 2. Calculator Tool (`calculate`)
- **Mô tả**: Thực hiện các phép tính toán học
- **Parameters**:
  - `expression` (required): Biểu thức toán học

**Ví dụ**:
```
"Tính toán: (15 + 25) * 2 / 5"
"Tính 100 + 200"
```

## 📊 Cấu trúc Response

Demo sẽ hiển thị quá trình xử lý:

```
🤖 Bắt đầu xử lý tool calling...

📤 Bước 1: Gửi request với tools...
🤖 Assistant response: Tool calls được yêu cầu

🔧 Bước 2: Thực thi tools...
🔧 Thực thi tool: get_weather với arguments: { location: 'Hanoi', units: 'celsius' }

📤 Bước 3: Gửi kết quả tools về...

✅ Kết quả cuối cùng:
💬 Kết quả: [Nội dung response từ model]
```

## 🔍 Ví dụ Output

### Input: "Thời tiết ở Hà Nội hôm nay như thế nào?"

```
🔧 Thực thi tool: get_weather với arguments: { location: 'Hanoi', units: 'celsius' }

💬 Kết quả: Dựa trên thông tin thời tiết hiện tại, Hà Nội có nhiệt độ 25°C với độ ẩm 65%. 
Thời tiết hôm nay khá dễ chịu với bầu trời hơi nhiều mây. Trong những ngày tới, 
nhiệt độ sẽ dao động từ 23-27°C với điều kiện thời tiết ổn định.
```

### Input: "Tính toán: (15 + 25) * 2 / 5"

```
🔧 Thực thi tool: calculate với arguments: { expression: '(15 + 25) * 2 / 5' }

💬 Kết quả: Kết quả của phép tính (15 + 25) * 2 / 5 = 16

Giải thích:
- 15 + 25 = 40
- 40 * 2 = 80  
- 80 / 5 = 16
```

## 🛡️ Bảo mật

- Demo sử dụng mock functions để tránh gọi API thật
- Calculator tool chỉ cho phép các phép tính cơ bản
- API key được lưu trong environment variable

## 🔧 Tùy chỉnh

### Thêm Tool mới

1. Thêm định nghĩa tool vào array `tools`
2. Thêm case xử lý trong function `executeTool`
3. Implement function mock tương ứng

### Thay đổi Model

Sửa dòng 5 trong file:
```javascript
const MODEL = 'openai/gpt-oss-20b:free'; // hoặc model khác
```

## 📝 Lưu ý

- GPT-OSS-20B là model miễn phí với giới hạn rate limit
- Demo sử dụng mock data, không gọi API thật
- Có thể mất vài giây để nhận response từ OpenRouter

## 🆘 Troubleshooting

### Lỗi "API Error: 401"
- Kiểm tra API key có đúng không
- Đảm bảo API key có quyền truy cập

### Lỗi "API Error: 429"
- Rate limit exceeded, chờ vài giây rồi thử lại

### Lỗi "Tool không được hỗ trợ"
- Kiểm tra tên tool trong function `executeTool`

## 📚 Tài liệu tham khảo

- [OpenRouter API Docs](https://openrouter.ai/docs)
- [GPT-OSS-20B Model](https://openrouter.ai/openai/gpt-oss-20b:free/api)
- [Tool Calling Guide](https://openrouter.ai/docs/features/tool-calling)

## 🤝 Đóng góp

Nếu bạn muốn cải thiện demo này, hãy:
1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Push và tạo Pull Request

## 📄 License

MIT License - xem file LICENSE để biết thêm chi tiết.
