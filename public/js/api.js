// API 呼叫封裝

const BASE = '/api/v1';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(BASE + path, opts);
  const json = await res.json();

  if (!json.success) {
    const err = new Error(json.error?.message || '發生錯誤');
    err.code = json.error?.code;
    throw err;
  }
  return json.data;
}

const api = {
  // 產品
  products: {
    list:   ()       => request('GET',    '/products'),
    get:    (id)     => request('GET',    `/products/${id}`),
    create: (body)   => request('POST',   '/products', body),
    update: (id, b)  => request('PUT',    `/products/${id}`, b),
    delete: (id)     => request('DELETE', `/products/${id}`),
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
};

window.api = api;
