const crypto = require('crypto');

// 時間安全字串比較，避免時間側信道
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// HTTP Basic 密碼閘門：
//   帳密來自環境變數 AUTH_USER / AUTH_PASSWORD（設在 Railway，不寫進程式碼）。
//   未設定 AUTH_PASSWORD → 不啟用（方便本地開發）。
//   /healthz 公開放行，供保活排程使用（不洩漏任何資料）。
module.exports = function basicAuth(req, res, next) {
  const USER = process.env.AUTH_USER || 'aura';
  const PASS = process.env.AUTH_PASSWORD;

  if (!PASS) return next();                 // 沒設密碼就不保護（本地）
  if (req.path === '/healthz') return next(); // 健康檢查公開

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    if (safeEqual(user, USER) && safeEqual(pass, PASS)) return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="AURA 成本系統", charset="UTF-8"');
  return res.status(401).send('需要授權才能存取');
};
