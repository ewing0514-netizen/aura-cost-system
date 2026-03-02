require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const routes      = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');

const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' })); // 支援 base64 封面圖片

// API 路由
app.use('/api/v1', routes);

// 前端靜態檔案
// 生產環境：JS/CSS/圖片 快取 7 天（Vercel 每次部署 URL 不同，自動 cache-bust）
// 開發環境：不快取，確保修改立即生效
const isProd = process.env.NODE_ENV === 'production';
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: isProd ? '7d' : 0,
  etag: true,
  setHeaders(res, filePath) {
    if (!isProd || filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

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
