require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const routes      = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');

const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors());
app.use(express.json());

// API 路由
app.use('/api/v1', routes);

// 前端靜態檔案
app.use(express.static(path.join(__dirname, '../public')));

// SPA fallback（所有非 API 請求都回傳 index.html）
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

// 統一錯誤處理
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AURA 成本系統 啟動於 http://localhost:${PORT}`);
  });
}

module.exports = app;
