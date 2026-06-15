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
    if (e.name === 'AbortError') throw new Error('請求逾時，請重新整理頁面');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json();

  if (!json.success) {
    const err = new Error(json.error?.message || '發生錯誤');
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
