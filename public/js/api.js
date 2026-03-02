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

  const res = await fetch(BASE + path, opts);
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
    // 取路徑第一段（如 /products, /costs）作為失效 prefix
    const prefix = 'GET' + path.split('/').slice(0, 3).join('/');
    _cacheInvalidate(prefix);
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
};

window.api = api;
