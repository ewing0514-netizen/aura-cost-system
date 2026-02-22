// 工具函式

function formatMoney(n) {
  if (n == null) return '-';
  return 'NT$' + parseFloat(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPct(n) {
  if (n == null) return '-';
  return parseFloat(n).toFixed(1) + '%';
}

const CATEGORY_LABELS = {
  material:  '原料/材料',
  labor:     '人工/勞務',
  packaging: '包裝/運輸',
  fixed:     '固定成本',
  other:     '其他',
};

const PRICE_TYPE_LABELS = {
  normal:    '常態價',
  promotion: '優惠價',
  group:     '團購價',
  member:    '會員價',
  custom:    '自訂',
};

function categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat; }
function priceTypeLabel(t)   { return PRICE_TYPE_LABELS[t]  || t; }

// Toast 通知
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Modal 管理
const Modal = {
  show(html, opts = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box">${html}</div>`;

    if (!opts.noClose) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) Modal.close();
      });
    }

    document.getElementById('modal-root').appendChild(overlay);
    this._current = overlay;
    return overlay;
  },
  close() {
    const root = document.getElementById('modal-root');
    if (root.lastChild) root.removeChild(root.lastChild);
  }
};

// 確認對話框
function confirm(msg) {
  return new Promise(resolve => {
    const html = `
      <h3 class="text-lg font-semibold mb-3">確認操作</h3>
      <p class="text-gray-600 mb-6">${msg}</p>
      <div class="flex justify-end gap-2">
        <button id="c-cancel" class="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50">取消</button>
        <button id="c-ok" class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">確認刪除</button>
      </div>
    `;
    Modal.show(html, { noClose: true });
    document.getElementById('c-ok').onclick     = () => { Modal.close(); resolve(true); };
    document.getElementById('c-cancel').onclick = () => { Modal.close(); resolve(false); };
  });
}

window.formatMoney = formatMoney;
window.formatPct   = formatPct;
window.categoryLabel = categoryLabel;
window.priceTypeLabel = priceTypeLabel;
window.toast = toast;
window.Modal = Modal;
window.confirm = confirm;
window.CATEGORY_LABELS = CATEGORY_LABELS;
window.PRICE_TYPE_LABELS = PRICE_TYPE_LABELS;
