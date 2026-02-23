// 頁面 1：產品列表 + Dashboard 全域成本

async function renderProductList() {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="max-w-5xl mx-auto px-4 py-8">
      <!-- 標題列 -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Aúra 成本系統</h1>
          <p class="text-gray-500 text-sm mt-1">管理你的產品成本與定價策略</p>
        </div>
        <button id="btn-add-product" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm font-medium">
          <span class="text-lg leading-none">+</span> 新增產品
        </button>
      </div>

      <!-- 產品列表 -->
      <div id="product-list-content">
        <div class="flex justify-center py-12"><div class="spinner"></div></div>
      </div>

      <!-- 分隔線 -->
      <div class="my-10 border-t border-gray-200"></div>

      <!-- 公司層級成本 Dashboard -->
      <div class="mb-4">
        <h2 class="text-lg font-bold text-gray-900">公司營運成本</h2>
        <p class="text-gray-500 text-sm mt-0.5">適用於整體業務的固定支出，不分配給單一產品</p>
      </div>
      <div id="global-costs-content">
        <div class="flex justify-center py-10"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById('btn-add-product').onclick = () => showProductModal(null, loadProducts);

  async function loadProducts() {
    const container = document.getElementById('product-list-content');
    try {
      const products = await api.products.list();

      if (products.length === 0) {
        container.innerHTML = `
          <div class="text-center py-16 text-gray-400">
            <div class="text-5xl mb-4">📦</div>
            <p class="text-lg">還沒有任何產品</p>
            <p class="text-sm mt-1">點擊右上角「新增產品」開始吧！</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${products.map(p => renderProductCard(p)).join('')}
        </div>
      `;

      products.forEach(p => {
        document.getElementById(`card-${p.id}`).onclick = () => {
          window.location.hash = `#/product/${p.id}`;
        };
        document.getElementById(`edit-${p.id}`).onclick = (e) => {
          e.stopPropagation();
          showProductModal(p, loadProducts);
        };
        document.getElementById(`del-${p.id}`).onclick = async (e) => {
          e.stopPropagation();
          const ok = await confirm(`確定要刪除「${p.name}」嗎？此操作不可復原，所有成本與售價資料也會一併刪除。`);
          if (!ok) return;
          try {
            await api.products.delete(p.id);
            toast('產品已刪除');
            loadProducts();
          } catch (err) {
            toast(err.message, 'error');
          }
        };
      });
    } catch (err) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">載入失敗：${err.message}</div>`;
    }
  }

  loadProducts();
  loadGlobalCosts();
}

// =====================================================
// 全域成本 — 載入與渲染
// =====================================================

async function loadGlobalCosts() {
  const container = document.getElementById('global-costs-content');
  if (!container) return;

  try {
    const costs = await api.globalCosts.list();

    // 只顯示 operations / marketing / other 三個分組
    const GLOBAL_GROUPS = ['operations', 'marketing', 'other'];
    const grouped = {};
    for (const gk of GLOBAL_GROUPS) grouped[gk] = [];
    for (const c of costs) {
      const gk = CATEGORY_TO_GROUP[c.category] || 'other';
      if (GLOBAL_GROUPS.includes(gk)) grouped[gk].push(c);
    }

    container.innerHTML = `
      <div class="space-y-4">
        ${GLOBAL_GROUPS.map(gk =>
          renderGlobalGroupCard(gk, COST_GROUPS[gk], grouped[gk] || [])
        ).join('')}
      </div>
    `;

    // 綁定分組新增按鈕
    GLOBAL_GROUPS.forEach(gk => {
      const btn = document.getElementById(`btn-global-add-${gk}`);
      if (btn) btn.onclick = () => showGlobalCostModal(null, gk, loadGlobalCosts);
    });

    // 編輯按鈕
    container.querySelectorAll('.global-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const cost = JSON.parse(btn.dataset.cost);
        showGlobalCostModal(cost, null, loadGlobalCosts);
      };
    });

    // 刪除按鈕
    container.querySelectorAll('.global-del-btn').forEach(btn => {
      btn.onclick = async () => {
        const ok = await confirm(`確定要刪除「${btn.dataset.name}」成本項目？`);
        if (!ok) return;
        try {
          await api.globalCosts.delete(btn.dataset.id);
          toast('已刪除');
          loadGlobalCosts();
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    });
  } catch (err) {
    container.innerHTML = `<div class="text-center py-8 text-red-500">載入失敗：${err.message}</div>`;
  }
}

function renderGlobalGroupCard(groupKey, group, costs) {
  const total = costs.reduce((s, c) => s + parseFloat(c.amount), 0);

  return `
    <div class="cost-group-card ${group.colorClass} p-4">
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
          <button id="btn-global-add-${groupKey}"
            class="text-xs px-2.5 py-1 rounded-full text-white transition-opacity ${group.btnClass}">
            + 新增
          </button>
        </div>
      </div>

      ${costs.length === 0
        ? `<div class="text-center py-5 text-xs ${group.emptyColor}">尚未有${group.label}項目，點擊「+ 新增」開始記錄</div>`
        : `<div class="space-y-2">
             ${costs.map(c => `
               <div class="cost-row-glass flex items-center gap-3 px-3 py-2.5">
                 <div class="flex-1 min-w-0">
                   <div class="flex items-center gap-1.5 flex-wrap">
                     <span class="text-sm font-medium text-gray-900">${escapeHtml(c.name)}</span>
                     <span class="category-badge category-${c.category}">${categoryLabel(c.category)}</span>
                     <span class="cost-type-badge cost-type-${c.cost_type || 'fixed'}">${c.cost_type === 'variable' ? '可變' : '固定'}</span>
                   </div>
                   ${c.note ? `<div class="text-xs text-gray-400 mt-0.5 truncate">${escapeHtml(c.note)}</div>` : ''}
                 </div>
                 <span class="text-sm font-bold text-gray-900 whitespace-nowrap">${formatMoney(c.amount)}</span>
                 <div class="flex gap-0.5 flex-shrink-0">
                   <button class="global-edit-btn text-gray-400 hover:text-indigo-600 text-xs px-2 py-1 rounded-lg hover:bg-white/60"
                     data-cost='${JSON.stringify({
                       id: c.id, name: c.name,
                       amount: parseFloat(c.amount),
                       category: c.category,
                       cost_type: c.cost_type || 'fixed',
                       note: c.note || ''
                     })}'>編輯</button>
                   <button class="global-del-btn text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded-lg hover:bg-white/60"
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
// 全域成本 Modal
// =====================================================

function showGlobalCostModal(cost, defaultGroupKey, onSave) {
  const isEdit = !!cost;

  const GLOBAL_GROUPS = ['operations', 'marketing', 'other'];
  let activeCostType = cost ? (cost.cost_type || 'fixed') : 'fixed';
  let activeGroupKey = defaultGroupKey
    || (cost ? (CATEGORY_TO_GROUP[cost.category] || 'operations') : 'operations');
  if (!GLOBAL_GROUPS.includes(activeGroupKey)) activeGroupKey = 'operations';

  function buildGroupTabs(currentKey) {
    return GLOBAL_GROUPS.map(key => {
      const g = COST_GROUPS[key];
      return `<button type="button" class="group-tab-btn ${key === currentKey ? 'active' : ''}" data-group="${key}">
        ${g.icon} ${g.label}
      </button>`;
    }).join('');
  }

  function buildCategoryOptions(forGroupKey, selectedCat) {
    const cats = COST_GROUPS[forGroupKey]?.categories || [];
    const effective = (selectedCat && cats.includes(selectedCat)) ? selectedCat : cats[0];
    return cats.map(v =>
      `<option value="${v}" ${effective === v ? 'selected' : ''}>${CATEGORY_LABELS[v] || v}</option>`
    ).join('');
  }

  const html = `
    <h3 class="text-lg font-semibold mb-4">${isEdit ? '編輯成本項目' : '新增公司成本項目'}</h3>
    <form id="global-cost-form">

      <!-- 可變/固定切換 -->
      <div class="mb-4">
        <label class="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">成本類型</label>
        <div class="cost-type-toggle">
          <button type="button" id="g-toggle-variable" class="${activeCostType === 'variable' ? 'active-variable' : ''}">
            📈 可變成本
          </button>
          <button type="button" id="g-toggle-fixed" class="${activeCostType === 'fixed' ? 'active-fixed' : ''}">
            🏛️ 固定成本
          </button>
        </div>
        <p id="g-cost-type-hint" class="text-xs text-gray-400 mt-1.5 px-0.5">
          ${activeCostType === 'fixed'
            ? '📌 不隨數量變動的固定支出'
            : '📊 隨業務量變動的成本'}
        </p>
      </div>

      <!-- 成本分組 Tab（只有 operations/marketing/other）-->
      <div class="mb-3">
        <label class="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">成本分組</label>
        <div class="group-tab-bar" id="g-group-tab-bar">
          ${buildGroupTabs(activeGroupKey)}
        </div>
      </div>

      <!-- 子分類 -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">類別 <span class="text-red-500">*</span></label>
        <select id="g-cat" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          ${buildCategoryOptions(activeGroupKey, cost?.category)}
        </select>
      </div>

      <!-- 名稱 -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">項目名稱 <span class="text-red-500">*</span></label>
        <input type="text" id="g-name" value="${isEdit ? escapeHtml(cost.name) : ''}"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="例如：辦公室租金、FB 廣告費" required>
      </div>

      <!-- 金額 -->
      <div class="mb-3">
        <label class="block text-sm font-medium text-gray-700 mb-1">金額（NT$）<span class="text-red-500">*</span></label>
        <input type="number" id="g-amount" value="${isEdit ? cost.amount : ''}" min="0" step="0.01"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="0.00" required>
      </div>

      <!-- 備註 -->
      <div class="mb-5">
        <label class="block text-sm font-medium text-gray-700 mb-1">備註（選填）</label>
        <input type="text" id="g-note" value="${isEdit ? escapeHtml(cost.note || '') : ''}"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="例如：每月固定費用">
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
  document.getElementById('g-name').focus();

  // 可變/固定切換
  function updateTypeToggle(type) {
    activeCostType = type;
    document.getElementById('g-toggle-variable').className = type === 'variable' ? 'active-variable' : '';
    document.getElementById('g-toggle-fixed').className    = type === 'fixed'    ? 'active-fixed'    : '';
    document.getElementById('g-cost-type-hint').textContent = type === 'fixed'
      ? '📌 不隨數量變動的固定支出'
      : '📊 隨業務量變動的成本';
  }
  document.getElementById('g-toggle-variable').onclick = () => updateTypeToggle('variable');
  document.getElementById('g-toggle-fixed').onclick    = () => updateTypeToggle('fixed');

  // 分組 Tab 切換
  document.getElementById('g-group-tab-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('.group-tab-btn');
    if (!btn) return;
    activeGroupKey = btn.dataset.group;
    document.querySelectorAll('#g-group-tab-bar .group-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.group === activeGroupKey);
    });
    document.getElementById('g-cat').innerHTML = buildCategoryOptions(activeGroupKey, null);
  });

  // 表單送出
  document.getElementById('global-cost-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name:      document.getElementById('g-name').value.trim(),
      amount:    parseFloat(document.getElementById('g-amount').value),
      category:  document.getElementById('g-cat').value,
      cost_type: activeCostType,
      note:      document.getElementById('g-note').value.trim(),
    };
    try {
      if (isEdit) {
        await api.globalCosts.update(cost.id, body);
        toast('成本項目已更新');
      } else {
        await api.globalCosts.create(body);
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
// 產品卡片
// =====================================================

function renderProductCard(p) {
  const cost = p.total_cost || 0;
  const hasCover = !!p.cover_image;

  return `
    <div id="card-${p.id}" class="product-card bg-white border border-gray-200 rounded-xl overflow-hidden relative">
      ${hasCover
        ? `<div class="w-full overflow-hidden" style="aspect-ratio:1200/628">
             <img src="${p.cover_image}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover">
           </div>`
        : `<div class="w-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50" style="aspect-ratio:1200/628">
             <span class="text-4xl opacity-40">📦</span>
           </div>`
      }
      <div class="absolute top-2 right-2 flex gap-1">
        <button id="edit-${p.id}" class="bg-white/80 backdrop-blur-sm text-gray-500 hover:text-indigo-600 p-1.5 rounded-lg shadow-sm border border-white/60" title="編輯">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        <button id="del-${p.id}" class="bg-white/80 backdrop-blur-sm text-gray-500 hover:text-red-600 p-1.5 rounded-lg shadow-sm border border-white/60" title="刪除">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
      <div class="p-4">
        <h3 class="font-semibold text-gray-900 mb-1">${escapeHtml(p.name)}</h3>
        ${p.description ? `<p class="text-gray-400 text-xs mb-3 line-clamp-2">${escapeHtml(p.description)}</p>` : '<div class="mb-3"></div>'}
        <div class="flex gap-4 text-sm">
          <div>
            <div class="text-gray-400 text-xs">總成本</div>
            <div class="font-semibold text-gray-900">${formatMoney(cost)}</div>
          </div>
          <div>
            <div class="text-gray-400 text-xs">售價方案</div>
            <div class="font-semibold text-gray-900">${p.price_count} 種</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// =====================================================
// 新增/編輯產品 Modal
// =====================================================

function showProductModal(product, onSave) {
  const isEdit = !!product;
  let coverImageDataUrl = (isEdit && product.cover_image) ? product.cover_image : null;

  const coverPreviewInner = coverImageDataUrl
    ? `<img id="p-img-display" src="${coverImageDataUrl}" class="w-full h-full object-cover rounded-xl">`
    : `<div class="flex flex-col items-center justify-center h-full gap-2 text-gray-400 py-6">
         <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
         <span class="text-sm font-medium">點擊上傳封面圖片</span>
         <span class="text-xs text-gray-300">自動裁切為 1200 × 628</span>
       </div>`;

  const html = `
    <h3 class="text-lg font-semibold mb-4">${isEdit ? '編輯產品' : '新增產品'}</h3>
    <form id="product-form">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1.5">
          封面圖片 <span class="text-gray-400 text-xs font-normal">（1200 × 628，自動裁切）</span>
        </label>
        <input type="file" id="p-img-input" accept="image/*" class="hidden">
        <div id="p-img-preview"
          class="cover-upload-zone w-full overflow-hidden"
          style="aspect-ratio:1200/628"
          onclick="document.getElementById('p-img-input').click()">
          ${coverPreviewInner}
        </div>
        ${coverImageDataUrl ? `<button type="button" id="p-img-remove" class="mt-1 text-xs text-red-500 hover:text-red-700">✕ 移除圖片</button>` : ''}
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">產品名稱 <span class="text-red-500">*</span></label>
        <input type="text" id="p-name" value="${isEdit ? escapeHtml(product.name) : ''}"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="例如：手工皂 A" required>
      </div>
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-1">描述（選填）</label>
        <textarea id="p-desc" rows="2"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="簡短說明這個產品">${isEdit ? escapeHtml(product.description || '') : ''}</textarea>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" id="modal-cancel" class="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm">取消</button>
        <button type="submit" class="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium">
          ${isEdit ? '儲存變更' : '新增產品'}
        </button>
      </div>
    </form>
  `;

  Modal.show(html);
  document.getElementById('modal-cancel').onclick = () => Modal.close();
  document.getElementById('p-name').focus();

  document.getElementById('p-img-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      coverImageDataUrl = await resizeImageToDataURL(file, 1200, 628);
      const preview = document.getElementById('p-img-preview');
      preview.innerHTML = `<img src="${coverImageDataUrl}" class="w-full h-full object-cover">`;
      const removeBtn = document.getElementById('p-img-remove');
      if (!removeBtn) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'p-img-remove';
        btn.className = 'mt-1 text-xs text-red-500 hover:text-red-700';
        btn.textContent = '✕ 移除圖片';
        preview.after(btn);
        btn.onclick = removeCoverImage;
      }
    } catch {
      toast('圖片處理失敗，請嘗試其他圖片', 'error');
    }
  });

  function removeCoverImage() {
    coverImageDataUrl = null;
    const preview = document.getElementById('p-img-preview');
    preview.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full gap-2 text-gray-400 py-6">
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        <span class="text-sm font-medium">點擊上傳封面圖片</span>
        <span class="text-xs text-gray-300">自動裁切為 1200 × 628</span>
      </div>`;
    const removeBtn = document.getElementById('p-img-remove');
    if (removeBtn) removeBtn.remove();
  }

  const removeBtnEl = document.getElementById('p-img-remove');
  if (removeBtnEl) removeBtnEl.onclick = removeCoverImage;

  document.getElementById('product-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name:        document.getElementById('p-name').value.trim(),
      description: document.getElementById('p-desc').value.trim(),
      cover_image: coverImageDataUrl,
    };
    try {
      if (isEdit) {
        await api.products.update(product.id, body);
        toast('產品已更新');
      } else {
        await api.products.create(body);
        toast('產品已新增');
      }
      Modal.close();
      onSave();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.renderProductList = renderProductList;
window.escapeHtml = escapeHtml;
