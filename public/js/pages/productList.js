// 頁面 1：產品列表

async function renderProductList() {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="max-w-5xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">AURA 成本系統</h1>
          <p class="text-gray-500 text-sm mt-1">管理你的產品成本與定價策略</p>
        </div>
        <button id="btn-add-product" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm font-medium">
          <span class="text-lg leading-none">+</span> 新增產品
        </button>
      </div>

      <div id="product-list-content">
        <div class="flex justify-center py-12"><div class="spinner"></div></div>
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

      // 綁定卡片事件
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
}

function renderProductCard(p) {
  const cost = p.total_cost || 0;
  return `
    <div id="card-${p.id}" class="product-card bg-white border border-gray-200 rounded-xl p-5 relative">
      <div class="absolute top-3 right-3 flex gap-1">
        <button id="edit-${p.id}" class="text-gray-400 hover:text-indigo-600 p-1 rounded" title="編輯">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        <button id="del-${p.id}" class="text-gray-400 hover:text-red-600 p-1 rounded" title="刪除">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
      <h3 class="font-semibold text-gray-900 pr-16 mb-1">${escapeHtml(p.name)}</h3>
      ${p.description ? `<p class="text-gray-500 text-sm mb-3 line-clamp-2">${escapeHtml(p.description)}</p>` : '<div class="mb-3"></div>'}
      <div class="flex gap-4 text-sm">
        <div>
          <div class="text-gray-400 text-xs">總成本</div>
          <div class="font-medium text-gray-900">${formatMoney(cost)}</div>
        </div>
        <div>
          <div class="text-gray-400 text-xs">售價方案</div>
          <div class="font-medium text-gray-900">${p.price_count} 種</div>
        </div>
      </div>
    </div>
  `;
}

function showProductModal(product, onSave) {
  const isEdit = !!product;
  const html = `
    <h3 class="text-lg font-semibold mb-4">${isEdit ? '編輯產品' : '新增產品'}</h3>
    <form id="product-form">
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

  document.getElementById('product-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById('p-name').value.trim(),
      description: document.getElementById('p-desc').value.trim(),
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
