# Cấu hình Server - OpenRouter

## Tổng quan
Server này sử dụng **OpenRouter** với model `gpt-oss-20b` (miễn phí).

## Cách chạy

### Đơn giản - Chỉ cần chạy:
```bash
node server.js
```

### Test kết nối OpenRouter trước:
```bash
node test-openrouter.js
```

## Cấu hình hiện tại
- **Provider**: OpenRouter
- **Model**: openai/gpt-oss-20b:free
- **API Key**: Đã cấu hình sẵn
- **MCP Base**: http://192.168.10.18:3000

## Yêu cầu
- Internet connection
- Không bị firewall/proxy chặn
- API key OpenRouter hợp lệ

## Lấy OpenRouter API Key

1. Truy cập: https://openrouter.ai/keys
2. Đăng ký tài khoản (miễn phí)
3. Tạo API key mới
4. Copy API key và set vào environment variable

## Kiểm tra cấu hình

Sau khi khởi động server, kiểm tra:
```bash
curl http://localhost:8055/health
```

Response sẽ hiển thị:
- Provider đang sử dụng (OpenRouter/Ollama)
- Model name
- Trạng thái API key (nếu dùng OpenRouter)

## Ưu điểm của từng provider

### OpenRouter
- ✅ Miễn phí (gpt-oss-20b:free)
- ✅ Không cần cài đặt Ollama
- ✅ Model được tối ưu sẵn
- ❌ Cần internet connection
- ❌ Có giới hạn rate limit

### Ollama
- ✅ Chạy offline
- ✅ Không có rate limit
- ✅ Toàn quyền kiểm soát
- ❌ Cần cài đặt và quản lý Ollama
- ❌ Tốn tài nguyên server

## Troubleshooting

### Lỗi OpenRouter API Key
```
❌ Chưa cấu hình OpenRouter API Key
```
**Giải pháp**: Set `OPENROUTER_API_KEY` environment variable

### Lỗi kết nối OpenRouter
```
Error: MCP HTTP 401: Unauthorized
```
**Giải pháp**: Kiểm tra API key có đúng không

### Fallback về Ollama
Nếu OpenRouter gặp lỗi, có thể tạm thời chuyển về Ollama:
```bash
export USE_OPENROUTER=false
``` 