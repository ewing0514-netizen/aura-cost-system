/**
 * 輕量級記憶體快取（TTL Map）
 * 不依賴額外套件，適合 Zeabur 單一 instance 部署
 */
const store = new Map();

/**
 * 讀取快取
 * @param {string} key
 * @returns {any|null} null = 不存在或已過期
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * 寫入快取
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs 存活毫秒數（預設 30 秒）
 */
function set(key, value, ttlMs = 30_000) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

/**
 * 刪除特定 key
 */
function del(key) {
  store.delete(key);
}

/**
 * 刪除所有以 prefix 開頭的 key
 */
function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { get, set, del, invalidate };
