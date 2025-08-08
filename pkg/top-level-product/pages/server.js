const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors()); // Cho phép gọi từ frontend
app.use(express.json()); // Cho phép đọc JSON body

app.post('/api/chat', async (req, res) => {
  try {
    const userMessages = req.body.messages;

    const response = await axios.post('https://15d1204b2df5.ngrok-free.app/api/chat', {
      model: "gpt-oss:20b",
      messages: userMessages,
      stream: false
    });

    res.json(response.data); // Gửi trả kết quả về lại FE
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ message: { content: "❌ Lỗi proxy đến model" } });
  }
});

app.listen(8055, () => {
  console.log("✅ Backend trung gian chạy tại http://localhost:8055");
});

