// 工具函式

function formatMoney(n) {
  if (n == null) return '-';
  return 'NT$' + parseFloat(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPct(n) {
  if (n == null) return '-';
  return parseFloat(n).toFixed(1) + '%';
}

// ===== 成本子分類標籤 =====
const CATEGORY_LABELS = {
  // 產品成本
  material:      '原料/材料',
  labor:         '人工/製作',
  packaging:     '包裝材料',
  // 營運成本
  rent:          '租金',
  utilities:     '水電費',
  equipment:     '設備折舊',
  fixed:         '其他固定',
  // 行銷成本
  advertising:   '廣告投放',
  platform_fee:  '平台手續費',
  shipping_cost: '運費物流',
  // 其他
  other:         '其他',
};

// ===== 成本分組定義（Liquid Glass 四組）=====
const COST_GROUPS = {
  product: {
    label:      '產品成本',
    desc:       '直接生產所需的原料、製作人工與包裝',
    icon:       '🧪',
    colorClass: 'group-product',
    textColor:  'text-blue-700',
    btnClass:   'bg-blue-500 hover:bg-blue-600',
    emptyColor: 'text-blue-300',
    categories: ['material', 'labor', 'packaging'],
  },
  operations: {
    label:      '營運成本',
    desc:       '日常運營的固定支出：租金、水電、設備',
    icon:       '🏢',
    colorClass: 'group-operations',
    textColor:  'text-violet-700',
    btnClass:   'bg-violet-500 hover:bg-violet-600',
    emptyColor: 'text-violet-300',
    categories: ['rent', 'utilities', 'equipment', 'fixed'],
  },
  marketing: {
    label:      '行銷成本',
    desc:       '推廣與銷售相關費用：廣告、平台費、運費',
    icon:       '📣',
    colorClass: 'group-marketing',
    textColor:  'text-pink-700',
    btnClass:   'bg-pink-500 hover:bg-pink-600',
    emptyColor: 'text-pink-300',
    categories: ['advertising', 'platform_fee', 'shipping_cost'],
  },
  other: {
    label:      '其他成本',
    desc:       '未分類的其他費用',
    icon:       '📋',
    colorClass: 'group-other',
    textColor:  'text-slate-600',
    btnClass:   'bg-slate-500 hover:bg-slate-600',
    emptyColor: 'text-slate-300',
    categories: ['other'],
  },
};

// 類別 → 所屬分組
const CATEGORY_TO_GROUP = {
  material:      'product',
  labor:         'product',
  packaging:     'product',
  rent:          'operations',
  utilities:     'operations',
  equipment:     'operations',
  fixed:         'operations',
  advertising:   'marketing',
  platform_fee:  'marketing',
  shipping_cost: 'marketing',
  other:         'other',
};

// ===== 售價類型 =====
const PRICE_TYPE_LABELS = {
  normal:    '常態價',
  promotion: '優惠價',
  group:     '團購價',
  member:    '會員價',
  custom:    '自訂',
};

// ===== 成本類型（可變/固定）=====
const COST_TYPE_LABELS = {
  variable: '可變',
  fixed:    '固定',
};

function categoryLabel(cat)   { return CATEGORY_LABELS[cat]    || cat; }
function priceTypeLabel(t)    { return PRICE_TYPE_LABELS[t]    || t; }
function costTypeLabel(type)  { return COST_TYPE_LABELS[type]  || type; }
function categoryGroup(cat)   { return CATEGORY_TO_GROUP[cat]  || 'other'; }

// ===== Toast 通知 =====
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ===== Modal 管理 =====
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

// ===== 確認對話框 =====
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

// ===== 圖片縮放裁切（center-crop to target size）=====
function resizeImageToDataURL(file, w, h, quality) {
  quality = quality || 0.85;
  return new Promise(function(resolve, reject) {
    var img = new Image();
    var blobUrl = URL.createObjectURL(file);
    img.onload = function() {
      URL.revokeObjectURL(blobUrl);
      var canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      var srcAspect = img.width / img.height;
      var dstAspect = w / h;
      var sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcAspect > dstAspect) {
        sw = img.height * dstAspect;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / dstAspect;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = blobUrl;
  });
}

// ===== 全域匯出 =====
window.formatMoney          = formatMoney;
window.formatPct            = formatPct;
window.categoryLabel        = categoryLabel;
window.priceTypeLabel       = priceTypeLabel;
window.costTypeLabel        = costTypeLabel;
window.categoryGroup        = categoryGroup;
window.toast                = toast;
window.Modal                = Modal;
window.confirm              = confirm;
window.resizeImageToDataURL = resizeImageToDataURL;
window.CATEGORY_LABELS      = CATEGORY_LABELS;
window.PRICE_TYPE_LABELS    = PRICE_TYPE_LABELS;
window.COST_TYPE_LABELS     = COST_TYPE_LABELS;
window.COST_GROUPS          = COST_GROUPS;
window.CATEGORY_TO_GROUP    = CATEGORY_TO_GROUP;
