// API 呼叫封裝

const BASE = '/api/v1';

// ===== 輕量 GET 快取（TTL 20 秒，避免切換頁面重複請求）=====
const _cache = new Map();
const CACHE_TTL = 20_000; // 20 秒

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}
function _cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}
// 讓寫入操作（POST/PUT/DELETE）清除相關快取
function _cacheInvalidate(pathPrefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(pathPrefix)) _cache.delete(key);
  }
}

// ===== 資料庫喚醒偵測 + 全站自動重試 =====
// Supabase 免費專案閒置會自動暫停，喚醒需數分鐘，期間 API 會回 fetch failed。
// 這裡把這類錯誤轉成友善訊息，並啟動一個全域倒數，時間到自動重新整理，直到資料庫恢復。
let _dbRetryTimer = null;
function _dbWakingError(rawMsg) {
  const err = new Error('資料庫喚醒中，將自動重試…');
  err.code = 'DB_WAKING';
  err.dbWaking = true;
  err.rawMessage = rawMsg;
  _scheduleDbRetry();
  return err;
}
function _scheduleDbRetry(seconds = 20) {
  if (_dbRetryTimer) return;                 // 已排程就不重複
  let left = seconds;
  const tick = () => {
    left -= 1;
    const el = document.getElementById('db-waking-countdown');
    if (el) el.textContent = left;
    if (left <= 0) { clearInterval(_dbRetryTimer); window.location.reload(); return; }
  };
  _dbRetryTimer = setInterval(tick, 1000);
}
// 給各頁面共用的友善錯誤區塊（含倒數）
function renderLoadError(err, opts = {}) {
  const pad = opts.small ? 'py-8' : 'py-12';
  if (err && err.dbWaking) {
    return `<div class="text-center ${pad}">
      <div class="text-4xl mb-3">☕️</div>
      <p class="text-slate-600 font-medium">資料庫喚醒中，請稍候…</p>
      <p class="text-xs text-slate-400 mt-1.5">免費方案閒置後會自動暫停，正在恢復。<span id="db-waking-countdown">20</span> 秒後自動重試</p>
      <button onclick="window.location.reload()" class="mt-4 text-xs text-indigo-600 hover:text-indigo-700 underline">立即重試</button>
    </div>`;
  }
  return `<div class="text-center ${pad} text-red-500">載入失敗：${err?.message || '發生錯誤'}</div>`;
}
window.renderLoadError = renderLoadError;

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  // GET 請求優先讀快取
  const cacheKey = method + path;
  if (method === 'GET') {
    const cached = _cacheGet(cacheKey);
    if (cached !== null) return cached;
  }

  // 15 秒逾時保護，防止部署重啟期間 fetch 永久懸掛
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  opts.signal = controller.signal;

  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw _dbWakingError('請求逾時，資料庫可能正在喚醒');
    throw _dbWakingError(e.message || '連線失敗');   // 伺服器/網路層失敗
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json();

  if (!json.success) {
    const rawMsg = json.error?.message || '發生錯誤';
    // 後端連不到 Supabase（免費專案閒置被暫停 / 喚醒中）→ 轉成友善訊息並觸發自動重試
    if (/fetch failed|ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|ETIMEDOUT|socket hang up/i.test(rawMsg)) {
      throw _dbWakingError(rawMsg);
    }
    const err = new Error(rawMsg);
    err.code = json.error?.code;
    throw err;
  }

  // 寫入快取（僅 GET）
  if (method === 'GET') _cacheSet(cacheKey, json.data);

  // 非 GET 操作 → 清除受影響路徑的快取
  if (method !== 'GET') {
    // 取頂層資源名稱（如 'costs', 'products', 'payments'）作為失效 prefix
    // 例：PUT /costs/123 → topLevel = 'costs' → 清除 'GET/costs' 與 'GET/costs/123' 等所有相關快取
    // 舊寫法 slice(0,3) 對 /costs/:id 只產生 'GET/costs/:id'，導致列表快取未清除
    const topLevel = path.split('/').filter(Boolean)[0] || '';
    _cacheInvalidate('GET/' + topLevel);
  }

  return json.data;
}

const api = {
  // 產品
  products: {
    list:      ()       => request('GET',    '/products'),
    get:       (id)     => request('GET',    `/products/${id}`),
    create:    (body)   => request('POST',   '/products', body),
    update:    (id, b)  => request('PUT',    `/products/${id}`, b),
    delete:    (id)     => request('DELETE', `/products/${id}`),
    duplicate: (id)     => request('POST',   `/products/${id}/duplicate`),
  },

  // 成本項目
  costs: {
    list:   (pid)          => request('GET',    `/products/${pid}/costs`),
    create: (pid, body)    => request('POST',   `/products/${pid}/costs`, body),
    update: (pid, id, b)   => request('PUT',    `/products/${pid}/costs/${id}`, b),
    delete: (pid, id)      => request('DELETE', `/products/${pid}/costs/${id}`),
  },

  // 售價設定
  prices: {
    list:   (pid)          => request('GET',    `/products/${pid}/prices`),
    create: (pid, body)    => request('POST',   `/products/${pid}/prices`, body),
    update: (pid, id, b)   => request('PUT',    `/products/${pid}/prices/${id}`, b),
    delete: (pid, id)      => request('DELETE', `/products/${pid}/prices/${id}`),
  },

  // 損益分析
  analysis: {
    product: (pid) => request('GET', `/products/${pid}/analysis`),
    summary: ()    => request('GET', '/analysis/summary'),
  },

  // 全域成本（Dashboard 管理）
  globalCosts: {
    list:   ()        => request('GET',    '/costs'),
    create: (body)    => request('POST',   '/costs', body),
    update: (id, b)   => request('PUT',    `/costs/${id}`, b),
    delete: (id)      => request('DELETE', `/costs/${id}`),
  },

  // 供應商
  suppliers: {
    list:   ()        => request('GET',    '/payments/suppliers'),
    create: (body)    => request('POST',   '/payments/suppliers', body),
    update: (id, b)   => request('PUT',    `/payments/suppliers/${id}`, b),
    delete: (id)      => request('DELETE', `/payments/suppliers/${id}`),
  },

  // 採購訂單（支出）
  purchaseOrders: {
    list:   (qs)      => request('GET',    '/payments/purchase-orders' + (qs || '')),
    get:    (id)      => request('GET',    `/payments/purchase-orders/${id}`),
    create: (body)    => request('POST',   '/payments/purchase-orders', body),
    update: (id, b)   => request('PUT',    `/payments/purchase-orders/${id}`, b),
    delete: (id)      => request('DELETE', `/payments/purchase-orders/${id}`),
  },

  // 現金收入記錄
  incomeRecords: {
    list:   ()        => request('GET',    '/payments/income-records'),
    get:    (id)      => request('GET',    `/payments/income-records/${id}`),
    create: (body)    => request('POST',   '/payments/income-records', body),
    update: (id, b)   => request('PUT',    `/payments/income-records/${id}`, b),
    delete: (id)      => request('DELETE', `/payments/income-records/${id}`),
  },

  // 系統 / 其他支出記錄
  expenseRecords: {
    list:   ()        => request('GET',    '/payments/expense-records'),
    create: (body)    => request('POST',   '/payments/expense-records', body),
    update: (id, b)   => request('PUT',    `/payments/expense-records/${id}`, b),
    delete: (id)      => request('DELETE', `/payments/expense-records/${id}`),
  },

  // KOL 團主
  kols: {
    list:   ()        => request('GET',    '/kols'),
    create: (body)    => request('POST',   '/kols', body),
    update: (id, b)   => request('PUT',    `/kols/${id}`, b),
    delete: (id)      => request('DELETE', `/kols/${id}`),
  },

  // KOL 分潤紀錄
  kolCommissions: {
    list:   ()        => request('GET',    '/kols/commissions'),
    get:    (id)      => request('GET',    `/kols/commissions/${id}`),
    create: (body)    => request('POST',   '/kols/commissions', body),
    update: (id, b)   => request('PUT',    `/kols/commissions/${id}`, b),
    delete: (id)      => request('DELETE', `/kols/commissions/${id}`),
  },

  // 庫存
  inventory: {
    summary: ()       => request('GET',    '/inventory/summary'),
    list:    ()       => request('GET',    '/inventory/movements'),
    create:  (body)   => request('POST',   '/inventory/movements', body),
    update:  (id, b)  => request('PUT',    `/inventory/movements/${id}`, b),
    delete:  (id)     => request('DELETE', `/inventory/movements/${id}`),
  },
};

window.api = api;
