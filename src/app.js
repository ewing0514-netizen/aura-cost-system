require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const compression  = require('compression');
const path         = require('path');
const routes       = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');
const basicAuth    = require('./middleware/basicAuth');

const PORT = process.env.PORT || 3000;

const app = express();

// gzip 壓縮所有回應（減少傳輸量約 60-80%）
app.use(compression());

// 健康檢查（公開，供保活排程用；會戳一下資料庫但不回傳任何資料）
app.get('/healthz', async (req, res) => {
  try {
    const supabase = require('./config/database');
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) throw error;
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

// 🔒 密碼閘門：除了 /healthz 之外，全站（前端 + API）都要通過 Basic Auth
app.use(basicAuth);

app.use(cors());
app.use(express.json({ limit: '5mb' })); // 支援 base64 封面圖片

// API 路由
app.use('/api/v1', routes);

// 前端靜態檔案快取策略：
//   HTML          → no-store（永不快取，確保取得最新）
//   JS / CSS      → no-cache（允許快取，但每次都向伺服器驗證 ETag，部署後立即生效）
//   圖片 / 字型   → public, max-age=7d（內容不常變，長期快取）
app.use(express.static(path.join(__dirname, '../public'), {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (/\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 天
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
