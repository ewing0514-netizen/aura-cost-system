// 頁面 2：產品詳情（含三個 Tab）

let currentProductId = null;
let currentTab = 'costs';

async function renderProductDetail(productId) {
  currentProductId = productId;
  currentTab = 'costs';

  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="max-w-4xl mx-auto px-4 py-8">
      <div class="flex items-center gap-3 mb-6">
        <button id="btn-back" class="text-gray-400 hover:text-gray-700">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div id="product-header-title" class="flex-1">
          <div class="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="border-b border-gray-200 mb-6">
        <nav class="flex gap-6">
          <button class="tab-btn pb-3 text-sm tab-active"   data-tab="costs">成本項目</button>
          <button class="tab-btn pb-3 text-sm tab-inactive" data-tab="prices">售價設定</button>
          <button class="tab-btn pb-3 text-sm tab-inactive" data-tab="analysis">損益分析</button>
        </nav>
      </div>

      <div id="tab-content">
        <div class="flex justify-center py-12"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').onclick = () => { window.location.hash = '#/'; };

  // 載入產品基本資訊
  try {
    const product = await api.products.get(productId);
    document.getElementById('product-header-title').innerHTML = `
      <h1 class="text-xl font-bold text-gray-900">${escapeHtml(product.name)}</h1>
      ${product.description ? `<p class="text-gray-500 text-sm">${escapeHtml(product.description)}</p>` : ''}
    `;
  } catch (e) {
    document.getElementById('product-header-title').innerHTML = `<span class="text-red-500">載入失敗</span>`;
  }

  // Tab 切換
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.className = `tab-btn pb-3 text-sm ${b === btn ? 'tab-active' : 'tab-inactive'}`;
      });
      loadTab(currentTab);
    };
  });

  loadTab('costs');
}

async function loadTab(tab) {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<div class="flex justify-center py-12"><div class="spinner"></div></div>`;

  try {
    if (tab === 'costs')    await renderCostsTab(container);
    if (tab === 'prices')   await renderPricesTab(container);
    if (tab === 'analysis') await renderAnalysisTab(container);
  } catch (err) {
    container.innerHTML = `<div class="text-center py-12 text-red-500">載入失敗：${err.message}</div>`;
  }
}

// =====================================================
// 成本項目 Tab — Liquid Glass 分組設計
// =====================================================

async function renderCostsTab(container) {
  const costs = await api.costs.list(currentProductId);
  const total = costs.reduce((s, c) => s + parseFloat(c.amount), 0);

  // 將成本依分組歸類
  const grouped = {};
  for (const groupKey of Object.keys(COST_GROUPS)) grouped[groupKey] = [];
  for (const c of costs) {
    const gk = CATEGORY_TO_GROUP[c.category] || 'other';
    grouped[gk].push(c);
  }

  container.innerHTML = `
    <div class="flex justify-between items-center mb-5">
      <div>
        <span class="text-sm text-gray-500">共 ${costs.length} 項成本</span>
        <span class="mx-2 text-gray-300">|</span>
        <span class="text-sm font-semibold text-gray-900">總計 ${formatMoney(total)}</span>
      </div>
      <button id="btn-add-cost" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1">
        + 新增成本
      </button>
    </div>

    <div class="space-y-4">
      ${Object.entries(COST_GROUPS).map(([groupKey, group]) =>
        renderCostGroupCard(groupKey, group, grouped[groupKey] || [])
      ).join('')}
    </div>
  `;

  // 全域新增按鈕（不限定分組）
  document.getElementById('btn-add-cost').onclick = () =>
    showCostModal(null, null, () => loadTab('costs'));

  // 各分組新增按鈕
  Object.keys(COST_GROUPS).forEach(groupKey => {
    const btn = document.getElementById(`btn-group-add-${groupKey}`);
    if (btn) btn.onclick = () => showCostModal(null, groupKey, () => loadTab('costs'));
  });

  // 編輯按鈕
  container.querySelectorAll('.cost-edit-btn').forEach(btn => {
    btn.onclick = () => {
      const cost = JSON.parse(btn.dataset.cost);
      showCostModal(cost, null, () => loadTab('costs'));
    };
  });

  // 刪除按鈕
  container.querySelectorAll('.cost-del-btn').forEach(btn => {
    btn.onclick = async () => {
      const ok = await confirm(`確定要刪除「${btn.dataset.name}」成本項目？`);
      if (!ok) return;
      try {
        await api.costs.delete(currentProductId, btn.dataset.id);
        toast('已刪除');
        loadTab('costs');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  });
}

function renderCostGroupCard(groupKey, group, costs) {
  const total = costs.reduce((s, c) => s + parseFloat(c.amount), 0);

  return `
    <div class="cost-group-card ${group.colorClass} p-4">
      <!-- 分組標題列 -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">${group.icon}</span>
          <div>
            <span class="font-semibold text-sm ${group.textColor}">${group.label}</span>
            <p class="text-xs text-gray-400 mt-0.5 hidden sm:block">${group.desc}</p>
          </div>
        </div>
        <div class="flex items-center gap-3 flex-shrink-0">
          <span class="text-sm font-bold ${group.textColor}">${formatMoney(total)}</span>
          <button id="btn-group-add-${groupKey}"
            class="text-xs px-2.5 py-1 rounded-full text-white transition-opacity ${group.btnClass}">
            + 新增
          </button>
        </div>
      </div>

      <!-- 成本列表 -->
      ${costs.length === 0
        ? `<div class="text-center py-5 text-xs ${group.emptyColor}">尚未有${group.label}項目，點擊「+ 新增」開始記錄</div>`
        : `<div class="space-y-2">
             ${costs.map(c => `
               <div class="cost-row-glass flex items-center gap-3 px-3 py-2.5">
                 <div class="flex-1 min-w-0">
                   <div class="flex items-center gap-1.5 flex-wrap">
                     <span class="text-sm font-medium text-gray-900">${escapeHtml(c.name)}</span>
                     <span class="category-badge category-${c.category}">${categoryLabel(c.category)}</span>
                     <span class="cost-type-badge cost-type-${c.cost_type || 'variable'}">${c.cost_type === 'fixed' ? '固定' : '可變'}</span>
                   </div>
                   ${c.note ? `<div class="text-xs text-gray-400 mt-0.5 truncate">${escapeHtml(c.note)}</div>` : ''}
                 </div>
                 <span class="text-sm font-bold text-gray-900 whitespace-nowrap">${formatMoney(c.amount)}</span>
                 <div class="flex gap-0.5 flex-shrink-0">
                   <button class="cost-edit-btn text-gray-400 hover:text-indigo-600 text-xs px-2 py-1 rounded-lg hover:bg-white/60"
                     data-cost='${JSON.stringify({
                       id: c.id, name: c.name,
                       amount: parseFloat(c.amount),
                       category: c.category,
                       cost_type: c.cost_type || 'variable',
                       note: c.note || ''
                     })}'>編輯</button>
                   <button class="cost-del-btn text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded-lg hover:bg-white/60"
                     data-id="${c.id}" data-name="${escapeHtml(c.name)}">刪除</button>
                 </div>
               </div>
             `).join('')}
           </div>`
      }
    </div>
  `;
}

// =====================================================
// 新增/編輯成本 Modal
// =====================================================

function showCostModal(cost, defaultGroupKey, onSave) {
  const isEdit = !!cost;

  // 初始狀態
  let activeCostType = cost ? (cost.cost_type || 'variable') : 'variable';
  let activeGroupKey = defaultGroupKey
    || (cost ? (CATEGORY_TO_GROUP[cost.category] || 'product') : 'product');

  // 依分組產生 <optgroup> 下拉選單
  function buildCategoryOptions(forGroupKey, selectedCat) {
    const cats = COST_GROUPS[forGroupKey]?.categories || [];
    const effective = (selectedCat && cats.includes(selectedCat)) ? selectedCat : cats[0];
    return cats.map(v =>
      `<option value="${v}" ${effective === v ? 'selected' : ''}>${CATEGORY_LABELS[v] || v}</option>`
    ).join('');
  }

  // 分組 Tab 按鈕 HTML
  function buildGroupTabs(currentKey) {
    return Object.entries(COST_GROUPS).map(([key, g]) => `
      <button type="button" class="group-tab-btn ${key === currentKey ? 'active' : ''}" data-group="${key}">
        ${g.icon} ${g.label}
      </button>
    `).join('');
  }

  const html = `
    <h3 class="text-lg font-semibold mb-4">${isEdit ? '編輯成本項目' : '新增成本項目'}</h3>
    <form id="cost-form">

      <!-- ① 可變成本 / 固定成本 切換 -->
      <div class="mb-4">
        <label class="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">成本類型</label>
        <div class="cost-type-toggle">
          <button type="button" id="toggle-variable"
            class="${activeCostType === 'variable' ? 'active-variable' : ''}">
            📈 可變成本
          </button>
          <button type="button" id="toggle-fixed"
            class="${activeCostType === 'fixed' ? 'active-fixed' : ''}">
            🏛️ 固定成本
          </button>
        </div>
        <p id="cost-type-hint" class="text-xs text-gray-400 mt-1.5 px-0.5">
          ${activeCostType === 'variable'
            ? '📊 隨生產數量變動的成本（原料、人工、廣告等）'
            : '📌 不隨數量變動的固定支出，納入損益平衡點計算'}
        </p>
      </div>

      <!-- ② 成本分組 Tab -->
      <div class="mb-3">
        <label class="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">成本分組</label>
        <div class="group-tab-bar" id="group-tab-bar">
          ${buildGroupTabs(activeGroupKey)}
        </div>
      </div>

      <!-- ③ 子分類下拉 -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">類別 <span class="text-red-500">*</span></label>
        <select id="c-cat" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          ${buildCategoryOptions(activeGroupKey, cost?.category)}
        </select>
      </div>

      <!-- ④ 名稱 -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">項目名稱 <span class="text-red-500">*</span></label>
        <input type="text" id="c-name" value="${isEdit ? escapeHtml(cost.name) : ''}"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="例如：皂基、製作工時、FB 廣告費" required>
      </div>

      <!-- ⑤ 金額 -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">金額（NT$）<span class="text-red-500">*</span></label>
        <input type="number" id="c-amount" value="${isEdit ? cost.amount : ''}" min="0" step="0.01"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="0.00" required>
      </div>

      <!-- ⑥ 備註 -->
      <div class="mb-5">
        <label class="block text-sm font-medium text-gray-700 mb-1">備註（選填）</label>
        <input type="text" id="c-note" value="${isEdit ? escapeHtml(cost.note || '') : ''}"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="例如：每批 100g 用量">
      </div>

      <div class="flex justify-end gap-2">
        <button type="button" id="modal-cancel" class="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm">取消</button>
        <button type="submit" class="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium">
          ${isEdit ? '儲存' : '新增'}
        </button>
      </div>
    </form>
  `;

  Modal.show(html);
  document.getElementById('modal-cancel').onclick = () => Modal.close();
  document.getElementById('c-name').focus();

  // —— 可變/固定切換 ——
  function updateTypeToggle(type) {
    activeCostType = type;
    const vBtn = document.getElementById('toggle-variable');
    const fBtn = document.getElementById('toggle-fixed');
    const hint = document.getElementById('cost-type-hint');
    vBtn.className = type === 'variable' ? 'active-variable' : '';
    fBtn.className = type === 'fixed'    ? 'active-fixed'    : '';
    hint.textContent = type === 'variable'
      ? '📊 隨生產數量變動的成本（原料、人工、廣告等）'
      : '📌 不隨數量變動的固定支出，納入損益平衡點計算';
  }
  document.getElementById('toggle-variable').onclick = () => updateTypeToggle('variable');
  document.getElementById('toggle-fixed').onclick    = () => updateTypeToggle('fixed');

  // —— 分組 Tab 切換 ——
  document.getElementById('group-tab-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('.group-tab-btn');
    if (!btn) return;
    activeGroupKey = btn.dataset.group;
    // 更新 tab 樣式
    document.querySelectorAll('.group-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.group === activeGroupKey);
    });
    // 更新類別下拉
    document.getElementById('c-cat').innerHTML = buildCategoryOptions(activeGroupKey, null);
  });

  // —— 表單送出 ——
  document.getElementById('cost-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name:      document.getElementById('c-name').value.trim(),
      amount:    parseFloat(document.getElementById('c-amount').value),
      category:  document.getElementById('c-cat').value,
      cost_type: activeCostType,
      note:      document.getElementById('c-note').value.trim(),
    };
    try {
      if (isEdit) {
        await api.costs.update(currentProductId, cost.id, body);
        toast('成本項目已更新');
      } else {
        await api.costs.create(currentProductId, body);
        toast('成本項目已新增');
      }
      Modal.close();
      onSave();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// =====================================================
// 售價設定 Tab
// =====================================================

async function renderPricesTab(container) {
  const prices = await api.prices.list(currentProductId);

  container.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <span class="text-sm text-gray-500">共 ${prices.length} 種售價方案</span>
      <button id="btn-add-price" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700">+ 新增售價</button>
    </div>

    ${prices.length === 0 ? `
      <div class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-3">🏷️</div>
        <p>還沒有售價方案</p>
        <p class="text-sm mt-1">點擊「新增售價」設定定價策略</p>
      </div>
    ` : `
      <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="text-left px-4 py-3 font-medium">類型</th>
              <th class="text-left px-4 py-3 font-medium">名稱</th>
              <th class="text-right px-4 py-3 font-medium">售價</th>
              <th class="text-left px-4 py-3 font-medium">備註</th>
              <th class="text-center px-4 py-3 font-medium">狀態</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${prices.map(p => `
              <tr class="${!p.is_active ? 'opacity-50' : ''}">
                <td class="px-4 py-3">
                  <span class="category-badge price-${p.price_type}">${priceTypeLabel(p.price_type)}</span>
                </td>
                <td class="px-4 py-3 text-gray-900 font-medium">${escapeHtml(p.name)}</td>
                <td class="px-4 py-3 text-right font-bold text-gray-900">${formatMoney(p.amount)}</td>
                <td class="px-4 py-3 text-gray-400 text-xs">${escapeHtml(p.note || '')}</td>
                <td class="px-4 py-3 text-center">
                  <span class="text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                    ${p.is_active ? '啟用' : '停用'}
                  </span>
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button class="price-edit text-gray-400 hover:text-indigo-600 mr-2" data-price='${JSON.stringify({id:p.id,name:p.name,amount:p.amount,price_type:p.price_type,note:p.note||'',is_active:p.is_active})}'>編輯</button>
                  <button class="price-del text-gray-400 hover:text-red-600" data-id="${p.id}" data-name="${escapeHtml(p.name)}">刪除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  document.getElementById('btn-add-price').onclick = () => showPriceModal(null, () => loadTab('prices'));

  container.querySelectorAll('.price-edit').forEach(btn => {
    btn.onclick = () => showPriceModal(JSON.parse(btn.dataset.price), () => loadTab('prices'));
  });

  container.querySelectorAll('.price-del').forEach(btn => {
    btn.onclick = async () => {
      const ok = await confirm(`確定要刪除「${btn.dataset.name}」售價方案？`);
      if (!ok) return;
      try {
        await api.prices.delete(currentProductId, btn.dataset.id);
        toast('已刪除');
        loadTab('prices');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  });
}

function showPriceModal(price, onSave) {
  const isEdit = !!price;
  const html = `
    <h3 class="text-lg font-semibold mb-4">${isEdit ? '編輯售價方案' : '新增售價方案'}</h3>
    <form id="price-form">
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">類型 <span class="text-red-500">*</span></label>
        <select id="p-type" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          ${Object.entries(PRICE_TYPE_LABELS).map(([v, l]) =>
            `<option value="${v}" ${isEdit && price.price_type === v ? 'selected' : ''}>${l}</option>`
          ).join('')}
        </select>
      </div>
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">方案名稱 <span class="text-red-500">*</span></label>
        <input type="text" id="p-name" value="${isEdit ? escapeHtml(price.name) : ''}"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="例如：門市售價、週年慶特價" required>
      </div>
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">售價（NT$）<span class="text-red-500">*</span></label>
        <input type="number" id="p-amount" value="${isEdit ? price.amount : ''}" min="0" step="0.01"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="0.00" required>
      </div>
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">備註（選填）</label>
        <input type="text" id="p-note" value="${isEdit ? escapeHtml(price.note || '') : ''}"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="例如：限時活動、10 件以上">
      </div>
      <div class="mb-5 flex items-center gap-2">
        <input type="checkbox" id="p-active" ${!isEdit || price.is_active ? 'checked' : ''} class="w-4 h-4 text-indigo-600">
        <label for="p-active" class="text-sm text-gray-700">啟用此售價方案</label>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" id="modal-cancel" class="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm">取消</button>
        <button type="submit" class="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium">
          ${isEdit ? '儲存' : '新增'}
        </button>
      </div>
    </form>
  `;
  Modal.show(html);
  document.getElementById('modal-cancel').onclick = () => Modal.close();
  document.getElementById('p-name').focus();

  document.getElementById('price-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name:       document.getElementById('p-name').value.trim(),
      amount:     parseFloat(document.getElementById('p-amount').value),
      price_type: document.getElementById('p-type').value,
      note:       document.getElementById('p-note').value.trim(),
      is_active:  document.getElementById('p-active').checked,
    };
    try {
      if (isEdit) {
        await api.prices.update(currentProductId, price.id, body);
        toast('售價方案已更新');
      } else {
        await api.prices.create(currentProductId, body);
        toast('售價方案已新增');
      }
      Modal.close();
      onSave();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// =====================================================
// 損益分析 Tab
// =====================================================

async function renderAnalysisTab(container) {
  const data = await api.analysis.product(currentProductId);

  const { total_cost, variable_cost, fixed_cost, prices } = data;

  if (prices.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <div class="text-4xl mb-3">📊</div>
        <p>請先在「售價設定」Tab 新增至少一種售價，才能查看損益分析</p>
      </div>
    `;
    return;
  }

  const sortedPrices = [...prices].sort((a, b) => b.profit_margin_pct - a.profit_margin_pct);

  container.innerHTML = `
    <!-- 成本摘要 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="bg-white border border-gray-200 rounded-xl p-4">
        <div class="text-xs text-gray-500 mb-1">每單位總成本</div>
        <div class="text-lg font-bold text-gray-900">${formatMoney(total_cost)}</div>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-4">
        <div class="text-xs text-gray-500 mb-1">可變成本</div>
        <div class="text-lg font-bold text-blue-600">${formatMoney(variable_cost)}</div>
        <div class="text-xs text-gray-400 mt-0.5">隨數量變動</div>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-4">
        <div class="text-xs text-gray-500 mb-1">固定成本</div>
        <div class="text-lg font-bold text-pink-600">${formatMoney(fixed_cost)}</div>
        <div class="text-xs text-gray-400 mt-0.5">需達損益平衡才回收</div>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-4">
        <div class="text-xs text-gray-500 mb-1">售價方案數</div>
        <div class="text-lg font-bold text-gray-900">${prices.length} 種</div>
      </div>
    </div>

    <!-- 損益分析表格 -->
    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
      <div class="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 class="text-sm font-semibold text-gray-700">各售價方案損益分析</h3>
      </div>
      <table class="w-full text-sm">
        <thead class="text-gray-500 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-3 font-medium">方案</th>
            <th class="text-right px-4 py-3 font-medium">售價</th>
            <th class="text-right px-4 py-3 font-medium">每件利潤</th>
            <th class="text-right px-4 py-3 font-medium">利潤率</th>
            <th class="text-center px-4 py-3 font-medium">損益平衡點</th>
            <th class="text-left px-4 py-3 font-medium w-32">利潤率視覺化</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${sortedPrices.map(p => {
            const marginClass = p.profit_margin_pct > 0 ? 'profit-positive' : 'profit-negative';
            const barWidth = Math.max(0, Math.min(100, p.profit_margin_pct));
            const barColor = p.profit_margin_pct >= 30 ? '#059669' : p.profit_margin_pct >= 10 ? '#d97706' : '#dc2626';
            return `
              <tr>
                <td class="px-4 py-3">
                  <div class="font-medium text-gray-900">${escapeHtml(p.price_name)}</div>
                  <span class="category-badge price-${p.price_type} text-xs">${priceTypeLabel(p.price_type)}</span>
                </td>
                <td class="px-4 py-3 text-right font-medium">${formatMoney(p.selling_price)}</td>
                <td class="px-4 py-3 text-right font-bold ${marginClass}">${formatMoney(p.profit_per_unit)}</td>
                <td class="px-4 py-3 text-right font-bold ${marginClass}">${formatPct(p.profit_margin_pct)}</td>
                <td class="px-4 py-3 text-center">
                  ${p.break_even_units != null
                    ? `<span class="font-semibold text-gray-900">${p.break_even_units} 件</span>`
                    : fixed_cost === 0
                      ? '<span class="text-gray-400 text-xs">無固定成本</span>'
                      : '<span class="text-red-500 text-xs">售價過低</span>'
                  }
                </td>
                <td class="px-4 py-3">
                  <div class="breakeven-bar">
                    <div class="breakeven-fill" style="width:${barWidth}%;background:${barColor}"></div>
                  </div>
                  <div class="text-xs text-gray-400 mt-1">${formatPct(p.profit_margin_pct)}</div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- 圖表 -->
    <div class="bg-white border border-gray-200 rounded-xl p-4">
      <h3 class="text-sm font-semibold text-gray-700 mb-4">利潤率比較</h3>
      <canvas id="profit-chart" height="120"></canvas>
    </div>

    ${fixed_cost > 0 ? `
    <div class="mt-4 p-4 bg-indigo-50 rounded-xl text-sm text-indigo-800">
      <span class="font-medium">💡 損益平衡提示：</span>
      你有 ${formatMoney(fixed_cost)} 的固定成本，每賣出一件產品才能貢獻部分固定成本的回收。損益平衡點代表：賣到這個數量後，固定成本已完全回收，之後每賣一件都是純利潤。
    </div>
    ` : ''}
  `;

  // 繪製圖表
  const ctx = document.getElementById('profit-chart').getContext('2d');
  const colors = sortedPrices.map(p =>
    p.profit_margin_pct >= 30 ? '#059669' :
    p.profit_margin_pct >= 10 ? '#d97706' : '#dc2626'
  );

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedPrices.map(p => p.price_name),
      datasets: [{
        label: '利潤率 (%)',
        data: sortedPrices.map(p => parseFloat(p.profit_margin_pct)),
        backgroundColor: colors,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toFixed(1)}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => v + '%' },
          grid: { color: '#f3f4f6' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

window.renderProductDetail = renderProductDetail;
