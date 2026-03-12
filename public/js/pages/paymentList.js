// 頁面：貨款記錄

const STATUS_LABEL = {
  pending:      { text: '待付訂金', cls: 'bg-orange-100 text-orange-700' },
  deposit_paid: { text: '待付尾款', cls: 'bg-yellow-100 text-yellow-700' },
  completed:    { text: '已完成',   cls: 'bg-green-100  text-green-700'  },
  cancelled:    { text: '已取消',   cls: 'bg-gray-100   text-gray-500'   },
};

async function renderPaymentList() {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="max-w-5xl mx-auto px-4 py-8">
      <!-- 標題 -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">貨款記錄</h1>
          <p class="text-gray-500 text-sm mt-1">追蹤採購訂金與尾款付款狀態</p>
        </div>
        <button id="btn-add-order" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm font-medium">
          <span class="text-lg leading-none">+</span> 新增貨款
        </button>
      </div>

      <!-- Stats 卡片 -->
      <div id="payment-stats" class="grid grid-cols-3 gap-4 mb-6">
        <div class="flex justify-center py-6 col-span-3"><div class="spinner"></div></div>
      </div>

      <!-- 篩選 Tab -->
      <div class="flex gap-1 mb-4 border-b border-gray-200">
        <button data-tab="all"          class="tab-btn px-4 py-2 text-sm font-medium text-indigo-600 border-b-2 border-indigo-600">全部</button>
        <button data-tab="pending"      class="tab-btn px-4 py-2 text-sm text-gray-500 hover:text-gray-700">待付訂金</button>
        <button data-tab="deposit_paid" class="tab-btn px-4 py-2 text-sm text-gray-500 hover:text-gray-700">待付尾款</button>
        <button data-tab="completed"    class="tab-btn px-4 py-2 text-sm text-gray-500 hover:text-gray-700">已完成</button>
        <button data-tab="cancelled"    class="tab-btn px-4 py-2 text-sm text-gray-500 hover:text-gray-700">已取消</button>
      </div>

      <!-- 訂單列表 -->
      <div id="order-list-content">
        <div class="flex justify-center py-12"><div class="spinner"></div></div>
      </div>

      <!-- 分隔線 -->
      <div class="my-10 border-t border-gray-200"></div>

      <!-- 供應商管理 -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-bold text-gray-900">供應商管理</h2>
          <p class="text-gray-500 text-sm mt-0.5">管理合作供應商的聯絡資訊與匯款帳號</p>
        </div>
        <button id="btn-add-supplier" class="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-sm">+ 新增供應商</button>
      </div>
      <div id="supplier-list-content">
        <div class="flex justify-center py-8"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  let currentTab = 'all';
  let allOrders = [];
  let allSuppliers = [];

  document.getElementById('btn-add-order').onclick = () => showPurchaseOrderModal(null, refresh);
  document.getElementById('btn-add-supplier').onclick = () => showSupplierModal(null, loadSuppliers);

  // Tab 切換
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        const active = b.dataset.tab === currentTab;
        b.className = active
          ? 'tab-btn px-4 py-2 text-sm font-medium text-indigo-600 border-b-2 border-indigo-600'
          : 'tab-btn px-4 py-2 text-sm text-gray-500 hover:text-gray-700';
      });
      renderOrders();
    };
  });

  // 事件委派：訂單列表按鈕
  document.getElementById('order-list-content').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, name } = btn.dataset;
    if (action === 'edit-order') {
      const order = allOrders.find(o => o.id === id);
      if (order) showPurchaseOrderModal(order, refresh);
    } else if (action === 'delete-order') {
      deletePurchaseOrder(id, name, refresh);
    }
  });

  function renderOrders() {
    const container = document.getElementById('order-list-content');
    const rows = currentTab === 'all' ? allOrders : allOrders.filter(o => o.status === currentTab);

    if (rows.length === 0) {
      container.innerHTML = `<div class="text-center py-16 text-gray-400"><div class="text-5xl mb-4">📋</div><p class="text-lg">沒有符合條件的貨款記錄</p></div>`;
      return;
    }

    container.innerHTML = rows.map(o => {
      const sl = STATUS_LABEL[o.status] || STATUS_LABEL.pending;
      const depositBadge = o.deposit_paid_at
        ? `<span class="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">訂金✓ ${fmtDate(o.deposit_paid_at)}</span>`
        : `<span class="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded">訂金待付</span>`;
      const balanceBadge = o.balance_paid_at
        ? `<span class="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">尾款✓ ${fmtDate(o.balance_paid_at)}</span>`
        : `<span class="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded">尾款待付</span>`;
      return `
        <div class="bg-white rounded-xl border border-gray-200 p-4 mb-3 ${o.cancelled ? 'opacity-60' : ''}">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="text-sm font-semibold text-gray-900">${escHtml(o.supplier_name)}</span>
                <span class="text-xs px-2 py-0.5 rounded-full font-medium ${sl.cls}">${sl.text}</span>
                ${o.invoice_no ? `<span class="text-xs text-gray-400">${escHtml(o.invoice_no)}</span>` : ''}
              </div>
              <p class="text-sm text-gray-600 line-clamp-2 mb-2">${escHtml(o.item_description)}</p>
              <div class="flex items-center gap-2 flex-wrap">
                ${depositBadge}
                ${balanceBadge}
                ${o.product_name ? `<span class="text-xs text-indigo-400">${escHtml(o.product_name)}</span>` : ''}
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-base font-bold text-gray-900">NT$${fmtMoney(o.total_amount)}</div>
              <div class="text-xs text-gray-400 mt-0.5">訂金 NT$${fmtMoney(o.deposit_amount)}</div>
              <div class="text-xs text-gray-400">尾款 NT$${fmtMoney(o.balance_amount)}</div>
              <div class="text-xs text-gray-400 mt-1">${fmtDate(o.order_date)}</div>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
            <button data-action="edit-order" data-id="${o.id}" class="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded hover:bg-gray-50">編輯</button>
            <button data-action="delete-order" data-id="${o.id}" data-name="${escHtml(o.item_description)}" class="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">刪除</button>
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadStats(orders) {
    const container = document.getElementById('payment-stats');
    const pending = orders.filter(o => o.status === 'pending');
    const depositPaid = orders.filter(o => o.status === 'deposit_paid');
    const now = new Date();
    const thisMonth = orders.filter(o => {
      if (o.status !== 'completed') return false;
      const d = new Date(o.balance_paid_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    const totalPendingDeposit = pending.reduce((s, o) => s + o.deposit_amount, 0);
    const totalPendingBalance = depositPaid.reduce((s, o) => s + o.balance_amount, 0);

    container.innerHTML = `
      <div class="bg-white rounded-xl border border-orange-200 p-4">
        <div class="text-xs text-orange-500 font-medium mb-1">待付訂金總額</div>
        <div class="text-xl font-bold text-gray-900">NT$${fmtMoney(totalPendingDeposit)}</div>
        <div class="text-xs text-gray-400 mt-1">${pending.length} 筆待付</div>
      </div>
      <div class="bg-white rounded-xl border border-yellow-200 p-4">
        <div class="text-xs text-yellow-600 font-medium mb-1">待付尾款總額</div>
        <div class="text-xl font-bold text-gray-900">NT$${fmtMoney(totalPendingBalance)}</div>
        <div class="text-xs text-gray-400 mt-1">${depositPaid.length} 筆待付</div>
      </div>
      <div class="bg-white rounded-xl border border-green-200 p-4">
        <div class="text-xs text-green-600 font-medium mb-1">本月已完成</div>
        <div class="text-xl font-bold text-gray-900">${thisMonth.length} 筆</div>
        <div class="text-xs text-gray-400 mt-1">NT$${fmtMoney(thisMonth.reduce((s, o) => s + o.total_amount, 0))}</div>
      </div>
    `;
  }

  function isTableMissingError(err) {
    return err.message && err.message.includes("Could not find the table");
  }

  function renderMigrationNotice() {
    return `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
        <div class="text-3xl mb-2">🔧</div>
        <p class="text-sm font-semibold text-amber-800 mb-1">需要先執行資料庫 Migration</p>
        <p class="text-xs text-amber-600 mb-3">請到 Supabase SQL Editor，貼上並執行<br><code class="font-mono bg-amber-100 px-1 rounded">database/migration_payment_records.sql</code></p>
        <p class="text-xs text-gray-400">執行完成後重新整理頁面即可</p>
      </div>
    `;
  }

  async function loadOrders() {
    const container = document.getElementById('order-list-content');
    try {
      allOrders = await api.purchaseOrders.list();
      loadStats(allOrders);
      renderOrders();
    } catch (err) {
      if (isTableMissingError(err)) {
        container.innerHTML = renderMigrationNotice();
        document.getElementById('payment-stats').innerHTML = `<div class="col-span-3 text-center text-xs text-gray-400 py-4">執行 migration 後即可看到統計資料</div>`;
      } else {
        container.innerHTML = `<div class="text-center py-12 text-red-500">載入失敗：${err.message}</div>`;
      }
    }
  }

  // 事件委派：供應商列表按鈕
  document.getElementById('supplier-list-content').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, name } = btn.dataset;
    if (action === 'edit-supplier') {
      const supplier = allSuppliers.find(s => s.id === id);
      if (supplier) showSupplierModal(supplier, loadSuppliers);
    } else if (action === 'delete-supplier') {
      deleteSupplier(id, name, loadSuppliers);
    }
  });

  async function loadSuppliers() {
    const container = document.getElementById('supplier-list-content');
    try {
      const suppliers = await api.suppliers.list();
      allSuppliers = suppliers;
      if (suppliers.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400 text-sm">尚無供應商，點擊上方「新增供應商」</div>`;
        return;
      }
      container.innerHTML = `
        <div class="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          ${suppliers.map(s => `
            <div class="flex items-center justify-between px-4 py-3">
              <div>
                <div class="text-sm font-medium text-gray-900">${escHtml(s.name)}</div>
                <div class="text-xs text-gray-400 mt-0.5">
                  ${s.contact_info ? escHtml(s.contact_info) + '　' : ''}
                  ${s.bank_account ? '帳號：' + escHtml(s.bank_account) : ''}
                  ${s.note ? '　備註：' + escHtml(s.note) : ''}
                </div>
              </div>
              <div class="flex gap-2">
                <button data-action="edit-supplier" data-id="${s.id}" class="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded hover:bg-gray-50">編輯</button>
                <button data-action="delete-supplier" data-id="${s.id}" data-name="${escHtml(s.name)}" class="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">刪除</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      if (isTableMissingError(err)) {
        container.innerHTML = renderMigrationNotice();
      } else {
        container.innerHTML = `<div class="text-center py-8 text-red-500 text-sm">載入失敗：${err.message}</div>`;
      }
    }
  }

  function refresh() {
    loadOrders();
  }

  loadOrders();
  loadSuppliers();
}

// =====================================================
// Modal：新增/編輯採購訂單
// =====================================================
async function showPurchaseOrderModal(order, onSave) {
  const isEdit = !!order;
  const root = document.getElementById('modal-root');

  // 預載供應商與產品清單
  let suppliers = [], products = [];
  try { suppliers = await api.suppliers.list(); } catch (_) {}
  try { products  = await api.products.list();  } catch (_) {}

  const supplierOpts = suppliers.map(s =>
    `<option value="${s.id}" data-account="${escHtml(s.bank_account || '')}" ${order?.supplier_id === s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`
  ).join('');
  const productOpts = `<option value="">（不關聯產品）</option>` + products.map(p =>
    `<option value="${p.id}" ${order?.product_id === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`
  ).join('');

  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">${isEdit ? '編輯貨款記錄' : '新增貨款記錄'}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form id="order-form" class="px-6 py-4 space-y-4">
          <!-- 供應商 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">供應商 <span class="text-red-500">*</span></label>
            <select id="f-supplier" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required>
              <option value="">請選擇供應商</option>
              ${supplierOpts}
            </select>
          </div>
          <!-- 關聯產品（選填） -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">關聯產品（選填）</label>
            <select id="f-product" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              ${productOpts}
            </select>
          </div>
          <!-- 進貨品項描述 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">進貨品項描述 <span class="text-red-500">*</span></label>
            <input id="f-desc" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="例：原料 A 500kg" value="${escHtml(order?.item_description || '')}" required>
          </div>
          <!-- 發票編號 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">發票 / 單據編號</label>
            <input id="f-invoice" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="選填" value="${escHtml(order?.invoice_no || '')}">
          </div>
          <!-- 金額 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">總金額 <span class="text-red-500">*</span></label>
              <div class="relative"><span class="absolute left-3 top-2 text-gray-400 text-sm">NT$</span>
                <input id="f-total" type="number" min="0.01" step="0.01" class="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value="${order?.total_amount || ''}" required>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">訂金金額</label>
              <div class="relative"><span class="absolute left-3 top-2 text-gray-400 text-sm">NT$</span>
                <input id="f-deposit" type="number" min="0" step="0.01" class="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value="${order?.deposit_amount ?? 0}">
              </div>
            </div>
          </div>
          <!-- 尾款（顯示用） -->
          <div class="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
            尾款 = <span id="f-balance-display">NT$0</span>
          </div>
          <!-- 訂金已付 -->
          <div class="border border-gray-200 rounded-lg p-3 space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="f-deposit-paid" type="checkbox" class="w-4 h-4 text-indigo-600 rounded" ${order?.deposit_paid_at ? 'checked' : ''}>
              <span class="text-sm font-medium text-gray-700">訂金已付</span>
            </label>
            <div id="f-deposit-date-wrap" class="${order?.deposit_paid_at ? '' : 'hidden'}">
              <label class="block text-xs text-gray-500 mb-1">付款日期</label>
              <input id="f-deposit-date" type="date" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value="${order?.deposit_paid_at || ''}">
            </div>
          </div>
          <!-- 尾款已付 -->
          <div class="border border-gray-200 rounded-lg p-3 space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="f-balance-paid" type="checkbox" class="w-4 h-4 text-indigo-600 rounded" ${order?.balance_paid_at ? 'checked' : ''} ${order?.deposit_paid_at ? '' : 'disabled'}>
              <span class="text-sm font-medium text-gray-700 ${order?.deposit_paid_at ? '' : 'text-gray-400'}">尾款已付</span>
            </label>
            <div id="f-balance-date-wrap" class="${order?.balance_paid_at ? '' : 'hidden'}">
              <label class="block text-xs text-gray-500 mb-1">付款日期</label>
              <input id="f-balance-date" type="date" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value="${order?.balance_paid_at || ''}">
            </div>
          </div>
          <!-- 匯款帳號 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">匯款帳號</label>
            <input id="f-remittance" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="選填，留空則使用供應商預設帳號" value="${escHtml(order?.remittance_account || '')}">
          </div>
          <!-- 訂單日期 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">訂單日期 <span class="text-red-500">*</span></label>
            <input id="f-order-date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value="${order?.order_date || new Date().toISOString().slice(0,10)}" required>
          </div>
          <!-- 備註 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea id="f-note" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="選填">${escHtml(order?.note || '')}</textarea>
          </div>
          <!-- 取消訂單 -->
          ${isEdit ? `
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="f-cancelled" type="checkbox" class="w-4 h-4 text-red-600 rounded" ${order?.cancelled ? 'checked' : ''}>
            <span class="text-sm text-gray-600">標記為已取消</span>
          </label>` : ''}
          <!-- 錯誤訊息 -->
          <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
          <!-- 按鈕 -->
          <div class="flex gap-3 pt-2">
            <button type="button" id="modal-cancel" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            <button type="submit" id="modal-submit" class="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">儲存</button>
          </div>
        </form>
      </div>
    </div>
  `;

  function closeModal() { root.innerHTML = ''; }
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  // 尾款計算
  function updateBalance() {
    const total   = parseFloat(document.getElementById('f-total').value)   || 0;
    const deposit = parseFloat(document.getElementById('f-deposit').value) || 0;
    document.getElementById('f-balance-display').textContent = 'NT$' + fmtMoney(Math.max(0, total - deposit));
  }
  document.getElementById('f-total').oninput   = updateBalance;
  document.getElementById('f-deposit').oninput = updateBalance;
  updateBalance();

  // 供應商選擇 → 自動填入帳號
  document.getElementById('f-supplier').onchange = function() {
    const opt = this.options[this.selectedIndex];
    const account = opt.dataset.account || '';
    if (account && !document.getElementById('f-remittance').value) {
      document.getElementById('f-remittance').value = account;
    }
  };

  // 訂金已付 toggle
  document.getElementById('f-deposit-paid').onchange = function() {
    document.getElementById('f-deposit-date-wrap').classList.toggle('hidden', !this.checked);
    const balanceEl = document.getElementById('f-balance-paid');
    balanceEl.disabled = !this.checked;
    balanceEl.closest('.border').querySelector('span').className =
      `text-sm font-medium ${this.checked ? 'text-gray-700' : 'text-gray-400'}`;
    if (!this.checked) {
      balanceEl.checked = false;
      document.getElementById('f-balance-date-wrap').classList.add('hidden');
    }
  };

  // 尾款已付 toggle
  document.getElementById('f-balance-paid').onchange = function() {
    document.getElementById('f-balance-date-wrap').classList.toggle('hidden', !this.checked);
  };

  // 表單提交
  document.getElementById('order-form').onsubmit = async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('modal-submit');
    btn.disabled = true; btn.textContent = '儲存中…';

    const depositPaid   = document.getElementById('f-deposit-paid').checked;
    const balancePaid   = document.getElementById('f-balance-paid').checked;
    const depositDate   = document.getElementById('f-deposit-date').value;
    const balanceDate   = document.getElementById('f-balance-date').value;

    const body = {
      supplier_id:        document.getElementById('f-supplier').value,
      product_id:         document.getElementById('f-product').value || null,
      item_description:   document.getElementById('f-desc').value.trim(),
      invoice_no:         document.getElementById('f-invoice').value.trim() || null,
      total_amount:       parseFloat(document.getElementById('f-total').value),
      deposit_amount:     parseFloat(document.getElementById('f-deposit').value) || 0,
      deposit_paid_at:    depositPaid ? (depositDate || new Date().toISOString().slice(0,10)) : null,
      balance_paid_at:    balancePaid ? (balanceDate || new Date().toISOString().slice(0,10)) : null,
      remittance_account: document.getElementById('f-remittance').value.trim() || null,
      order_date:         document.getElementById('f-order-date').value,
      cancelled:          isEdit ? document.getElementById('f-cancelled').checked : false,
      note:               document.getElementById('f-note').value.trim() || null,
    };

    try {
      if (isEdit) {
        await api.purchaseOrders.update(order.id, body);
      } else {
        await api.purchaseOrders.create(body);
      }
      closeModal();
      if (onSave) onSave();
      toast(isEdit ? '貨款記錄已更新' : '貨款記錄已新增');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

async function deletePurchaseOrder(id, desc, onDelete) {
  const ok = await confirm(`確定要刪除「${desc}」這筆貨款記錄嗎？`);
  if (!ok) return;
  try {
    await api.purchaseOrders.delete(id);
    toast('已刪除');
    if (onDelete) onDelete();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// =====================================================
// Modal：新增/編輯供應商
// =====================================================
function showSupplierModal(supplier, onSave) {
  const isEdit = !!supplier;
  const root = document.getElementById('modal-root');

  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">${isEdit ? '編輯供應商' : '新增供應商'}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div class="px-6 pt-4">
          <!-- AI 上傳區塊 -->
          <div class="mb-4">
            <p class="text-xs text-gray-500 mb-2 font-medium">🤖 AI 自動提取資訊（選用）</p>
            <label id="s-upload-label" class="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-indigo-200 rounded-xl p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
              <input type="file" id="s-file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf" class="hidden">
              <span id="s-upload-icon" class="text-2xl">📄</span>
              <span id="s-upload-text" class="text-sm text-indigo-600 font-medium">上傳截圖或 PDF</span>
              <span class="text-xs text-gray-400">AI 自動識別公司名稱、聯絡方式、銀行帳號</span>
            </label>
            <div id="s-extract-status" class="hidden mt-2 text-sm text-center"></div>
          </div>
          <div class="border-t border-gray-100 mb-4"></div>
        </div>
        <form id="supplier-form" class="px-6 pb-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">供應商名稱 <span class="text-red-500">*</span></label>
            <input id="s-name" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value="${escHtml(supplier?.name || '')}" required>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">聯絡方式</label>
            <input id="s-contact" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="電話 / LINE / Email" value="${escHtml(supplier?.contact_info || '')}">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">預設匯款帳號</label>
            <input id="s-account" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="銀行帳號" value="${escHtml(supplier?.bank_account || '')}">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea id="s-note" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none">${escHtml(supplier?.note || '')}</textarea>
          </div>
          <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
          <div class="flex gap-3 pt-2">
            <button type="button" id="modal-cancel" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            <button type="submit" id="modal-submit" class="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">儲存</button>
          </div>
        </form>
      </div>
    </div>
  `;

  function closeModal() { root.innerHTML = ''; }
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  // ── AI 提取邏輯 ──
  document.getElementById('s-file').onchange = async function() {
    const file = this.files[0];
    if (!file) return;

    const statusEl = document.getElementById('s-extract-status');
    const iconEl   = document.getElementById('s-upload-icon');
    const textEl   = document.getElementById('s-upload-text');

    // 顯示 loading
    statusEl.className = 'mt-2 text-sm text-center text-indigo-600';
    statusEl.textContent = '🤖 AI 識別中…';
    iconEl.textContent   = '⏳';
    textEl.textContent   = file.name.length > 20 ? file.name.slice(0, 20) + '…' : file.name;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res  = await fetch('/api/v1/payments/suppliers/extract-info', { method: 'POST', body: formData });
      const json = await res.json();

      if (!json.success) throw new Error(json.error?.message || '提取失敗');

      const d = json.data;
      // 自動填入（不覆蓋已有內容）
      if (d.name         && !document.getElementById('s-name').value.trim())    document.getElementById('s-name').value    = d.name;
      if (d.contact_info && !document.getElementById('s-contact').value.trim()) document.getElementById('s-contact').value = d.contact_info;
      if (d.bank_account && !document.getElementById('s-account').value.trim()) document.getElementById('s-account').value = d.bank_account;

      iconEl.textContent = '✅';
      statusEl.className = 'mt-2 text-sm text-center text-green-600';
      statusEl.textContent = '提取成功！請確認並補充資訊';
    } catch (err) {
      iconEl.textContent = '❌';
      statusEl.className = 'mt-2 text-sm text-center text-red-500';
      statusEl.textContent = err.message;
    }
  };

  // ── 儲存表單 ──
  document.getElementById('supplier-form').onsubmit = async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('modal-submit');
    btn.disabled = true; btn.textContent = '儲存中…';

    const body = {
      name:         document.getElementById('s-name').value.trim(),
      contact_info: document.getElementById('s-contact').value.trim() || null,
      bank_account: document.getElementById('s-account').value.trim() || null,
      note:         document.getElementById('s-note').value.trim() || null,
    };

    try {
      if (isEdit) {
        await api.suppliers.update(supplier.id, body);
      } else {
        await api.suppliers.create(body);
      }
      closeModal();
      if (onSave) onSave();
      toast(isEdit ? '供應商已更新' : '供應商已新增');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

async function deleteSupplier(id, name, onDelete) {
  const ok = await confirm(`確定要刪除供應商「${name}」嗎？`);
  if (!ok) return;
  try {
    await api.suppliers.delete(id);
    toast('供應商已刪除');
    if (onDelete) onDelete();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// =====================================================
// 工具函數
// =====================================================
function fmtDate(d) {
  if (!d) return '';
  return d.replace(/^(\d{4})-(\d{2})-(\d{2}).*/, '$1/$2/$3');
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
