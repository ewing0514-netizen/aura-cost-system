// 頁面：庫存管理（庫存總覽 + 異動帳）

// ── 類型 / 通路標籤 ──────────────────────────────────────
const INV_TYPE_LABEL = {
  in:     { text: '進貨', emoji: '📥', cls: 'status-completed' },
  out:    { text: '出貨', emoji: '📤', cls: 'status-pending' },
  adjust: { text: '盤點', emoji: '⚖️', cls: 'status-deposit-paid' },
};
const INV_CHANNEL_LABEL = {
  restock: '進貨補貨',
  web:     '🌐 官網',
  kol:     '📣 KOL 團購',
  b2b:     '🏢 B 端採購',
  sample:  '🎁 贈樣',
  damage:  '💥 報損',
  other:   '其他',
};
const OUT_CHANNELS = ['web', 'kol', 'b2b', 'sample', 'damage', 'other'];

async function renderInventoryList() {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="ambient-bg font-apple">
      <div class="max-w-6xl mx-auto px-4 py-10">
        <!-- 標題 -->
        <div class="section-header">
          <div>
            <h1 class="h-display">庫存管理</h1>
            <p class="section-subtitle">追蹤進貨、出貨與盤點，掌握每個產品的即時庫存</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-inv-in"     class="btn-apple-income">＋ 進貨</button>
            <button id="btn-inv-out"    class="btn-apple-pink">＋ 出貨</button>
            <button id="btn-inv-adjust" class="btn-apple-ghost">⚖️ 盤點</button>
          </div>
        </div>

        <!-- 統計卡片 -->
        <div id="inv-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="flex justify-center py-6 col-span-2 md:col-span-4"><div class="spinner"></div></div>
        </div>

        <!-- 庫存總覽（每個產品）-->
        <div class="section-header mt-8 mb-4">
          <h2 class="section-title">📦 各產品庫存</h2>
        </div>
        <div id="inv-overview"><div class="flex justify-center py-8"><div class="spinner"></div></div></div>

        <div class="glass-divider my-10"></div>

        <!-- 異動帳 -->
        <div class="section-header mb-4">
          <div>
            <h2 class="section-title">🧾 庫存異動帳</h2>
            <p class="section-subtitle">每一筆進出貨與盤點紀錄，目前庫存 = 所有異動加總</p>
          </div>
        </div>

        <!-- 月份切換器 -->
        <div id="inv-month-selector" class="mb-3"></div>
        <!-- 產品 / 類型篩選 -->
        <div id="inv-filter" class="mb-4"></div>

        <div id="inv-movements" class="glass-card overflow-hidden">
          <div class="flex justify-center py-12"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  let allMovements = [];
  let summaryData  = { products: [], stats: {} };
  let products     = [];       // for modal product picker
  let selectedMonth = null;    // null=當月, 'all'=全部, 'YYYY-MM'
  let filterProduct = 'all';
  let filterType    = 'all';

  const currentBrowserYM = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();

  document.getElementById('btn-inv-in').onclick     = () => showMovementModal(null, products, refresh, 'in');
  document.getElementById('btn-inv-out').onclick    = () => showMovementModal(null, products, refresh, 'out');
  document.getElementById('btn-inv-adjust').onclick = () => showMovementModal(null, products, refresh, 'adjust');

  // 事件委派：異動列表
  document.getElementById('inv-movements').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const m = allMovements.find(x => x.id === btn.dataset.id);
    if (!m) return;
    if (btn.dataset.action === 'edit-mov') {
      if (m.ref_type !== 'manual') { toast('此筆由採購單／KOL 開團自動產生，請至來源編輯', 'error'); return; }
      showMovementModal(m, products, refresh);
    } else if (btn.dataset.action === 'del-mov') {
      if (m.ref_type !== 'manual') { toast('此筆由來源自動產生，請至來源刪除', 'error'); return; }
      deleteMovement(m, refresh);
    }
  });

  function isMissing(err) {
    return err.message && err.message.includes('Could not find the table');
  }
  function migrationNotice() {
    return `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
        <div class="text-3xl mb-2">🔧</div>
        <p class="text-sm font-semibold text-amber-800 mb-1">需要先執行資料庫 Migration</p>
        <p class="text-xs text-amber-600">請到 Supabase SQL Editor 執行 <code class="font-mono bg-amber-100 px-1 rounded">database/migration_inventory.sql</code></p>
      </div>`;
  }

  async function refresh() {
    try {
      const [summary, movements, prodList] = await Promise.all([
        api.inventory.summary(),
        api.inventory.list(),
        api.products.list(),
      ]);
      summaryData  = summary;
      allMovements = movements;
      products     = prodList;
      renderStats();
      renderOverview();
      renderMonthSelector();
      renderFilter();
      renderMovements();
    } catch (err) {
      if (isMissing(err)) {
        document.getElementById('inv-movements').innerHTML = migrationNotice();
        document.getElementById('inv-overview').innerHTML = '';
        document.getElementById('inv-stats').innerHTML = `<div class="col-span-2 md:col-span-4 text-center text-xs text-gray-400 py-4">執行 migration 後即可使用</div>`;
      } else {
        document.getElementById('inv-movements').innerHTML = window.renderLoadError(err);
      }
    }
  }

  function renderStats() {
    const s = summaryData.stats || {};
    document.getElementById('inv-stats').innerHTML = `
      <div class="glass-stat glass-stat-net">
        <div class="flex items-center gap-1.5 text-indigo-700 text-xs font-semibold tracking-wide mb-1.5"><span class="text-base">📦</span>總庫存量</div>
        <div class="num-display text-2xl text-indigo-700">${fmtIntInv(s.total_units || 0)} <span class="text-base font-normal text-indigo-500">件</span></div>
        <div class="text-[11px] text-indigo-500/70 mt-1.5">${s.total_products || 0} 種產品</div>
      </div>
      <div class="glass-stat glass-stat-expense">
        <div class="flex items-center gap-1.5 text-rose-700 text-xs font-semibold tracking-wide mb-1.5"><span class="text-base">🔴</span>缺貨</div>
        <div class="num-display text-2xl text-rose-700">${s.out_count || 0} <span class="text-base font-normal text-rose-400">種</span></div>
        <div class="text-[11px] text-rose-500/70 mt-1.5">庫存 ≤ 0，需補貨</div>
      </div>
      <div class="glass-stat" style="background:linear-gradient(135deg,rgba(254,243,199,0.85),rgba(253,230,138,0.55));border-color:rgba(252,211,77,0.55)">
        <div class="flex items-center gap-1.5 text-amber-700 text-xs font-semibold tracking-wide mb-1.5"><span class="text-base">🟡</span>低於安全庫存</div>
        <div class="num-display text-2xl text-amber-700">${s.low_count || 0} <span class="text-base font-normal text-amber-500">種</span></div>
        <div class="text-[11px] text-amber-600/70 mt-1.5">建議盡快補貨</div>
      </div>
      <div class="glass-stat glass-stat-income">
        <div class="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold tracking-wide mb-1.5"><span class="text-base">✅</span>庫存健康</div>
        <div class="num-display text-2xl text-emerald-700">${(s.total_products || 0) - (s.out_count || 0) - (s.low_count || 0)} <span class="text-base font-normal text-emerald-500">種</span></div>
        <div class="text-[11px] text-emerald-500/70 mt-1.5">高於安全庫存</div>
      </div>
    `;
  }

  function renderOverview() {
    const rows = summaryData.products || [];
    if (rows.length === 0) {
      document.getElementById('inv-overview').innerHTML = `<div class="glass-card-soft p-8 text-center text-gray-400 text-sm">尚無產品，請先到產品列表新增</div>`;
      return;
    }
    document.getElementById('inv-overview').innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        ${rows.map(r => {
          const statusMap = {
            out: { chip: 'status-pending', label: '🔴 缺貨', color: 'text-rose-600' },
            low: { chip: 'status-deposit-paid', label: '🟡 偏低', color: 'text-amber-600' },
            ok:  { chip: 'status-completed', label: '✅ 充足', color: 'text-emerald-600' },
          };
          const st = statusMap[r.status] || statusMap.ok;
          // 庫存量 vs 安全庫存的視覺比例（安全庫存當基準線）
          const base = Math.max(r.safety_stock * 2, r.current_stock, 1);
          const pct = Math.min(100, Math.max(0, (r.current_stock / base) * 100));
          const safetyPct = Math.min(100, (r.safety_stock / base) * 100);
          const barColor = r.status === 'out' ? 'bg-rose-400' : r.status === 'low' ? 'bg-amber-400' : 'bg-emerald-400';
          return `
            <div class="glass-card-soft p-4">
              <div class="flex items-start justify-between gap-2 mb-2">
                <span class="font-semibold text-slate-900 text-sm truncate" style="letter-spacing:-0.015em" title="${escHtmlInv(r.product_name)}">${escHtmlInv(r.product_name)}</span>
                <span class="status-chip ${st.chip} flex-shrink-0">${st.label}</span>
              </div>
              <div class="flex items-baseline gap-1.5 mb-2">
                <span class="num-display text-2xl ${st.color}">${fmtIntInv(r.current_stock)}</span>
                <span class="text-xs text-slate-400">件</span>
                ${r.safety_stock > 0 ? `<span class="text-[11px] text-slate-400 ml-auto">安全 ${fmtIntInv(r.safety_stock)}</span>` : ''}
              </div>
              <!-- 進度條 -->
              <div class="relative h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
                <div class="absolute inset-y-0 left-0 ${barColor} rounded-full transition-all" style="width:${pct}%"></div>
                ${r.safety_stock > 0 ? `<div class="absolute inset-y-0 w-0.5 bg-slate-400/60" style="left:${safetyPct}%" title="安全庫存線"></div>` : ''}
              </div>
              <div class="flex items-center justify-between text-[11px] text-slate-400">
                <span>📥 進 ${fmtIntInv(r.total_in)}</span>
                <span>📤 出 ${fmtIntInv(r.total_out)}</span>
                ${r.total_adjust ? `<span>⚖️ ${r.total_adjust > 0 ? '+' : ''}${fmtIntInv(r.total_adjust)}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ── 月份切換器（從 2026/01 起）──────────────────────────
  function extractMonths() {
    const months = new Set();
    const now = new Date();
    let cursor = new Date(2026, 0, 1);
    let endY = now.getFullYear(), endM = now.getMonth();
    for (const m of allMovements) {
      if (!m.movement_date) continue;
      const [y, mo] = m.movement_date.split('-').map(Number);
      if (y > endY || (y === endY && mo - 1 > endM)) { endY = y; endM = mo - 1; }
    }
    const end = new Date(endY, endM, 1);
    while (cursor <= end) {
      months.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    for (const m of allMovements) if (m.movement_date) months.add(m.movement_date.slice(0, 7));
    return Array.from(months).sort().reverse();
  }

  function renderMonthSelector() {
    const wrap = document.getElementById('inv-month-selector');
    const months = extractMonths();
    const activeKey = selectedMonth === 'all' ? 'all' : (selectedMonth || currentBrowserYM);
    wrap.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-slate-500 font-semibold tracking-wide">📅 期間：</span>
        <div class="pill-tab-bar">
          <button data-month="all" class="inv-month-pill pill-tab ${activeKey === 'all' ? 'active' : ''}">全部</button>
          ${months.map(m => `<button data-month="${m}" class="inv-month-pill pill-tab ${activeKey === m ? 'active' : ''}">${m.replace('-', '/')}${m === currentBrowserYM ? ' ⌃' : ''}</button>`).join('')}
        </div>
      </div>`;
    wrap.querySelectorAll('.inv-month-pill').forEach(b => {
      b.onclick = () => { selectedMonth = b.dataset.month; renderMonthSelector(); renderMovements(); };
    });
  }

  function renderFilter() {
    const wrap = document.getElementById('inv-filter');
    wrap.innerHTML = `
      <div class="flex items-center gap-3 flex-wrap text-xs">
        <div class="flex items-center gap-1.5">
          <span class="text-slate-500 font-semibold">產品：</span>
          <select id="inv-filter-product" class="border border-slate-200 rounded-lg px-2 py-1 bg-white/70 focus:outline-none focus:ring-1 focus:ring-indigo-400">
            <option value="all">全部產品</option>
            ${(summaryData.products || []).map(p => `<option value="${p.product_id}" ${filterProduct === p.product_id ? 'selected' : ''}>${escHtmlInv(p.product_name)}</option>`).join('')}
          </select>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-slate-500 font-semibold">類型：</span>
          <div class="pill-tab-bar">
            <button data-t="all"    class="inv-type-pill pill-tab ${filterType === 'all' ? 'active' : ''}">全部</button>
            <button data-t="in"     class="inv-type-pill pill-tab ${filterType === 'in' ? 'active' : ''}">📥 進貨</button>
            <button data-t="out"    class="inv-type-pill pill-tab ${filterType === 'out' ? 'active' : ''}">📤 出貨</button>
            <button data-t="adjust" class="inv-type-pill pill-tab ${filterType === 'adjust' ? 'active' : ''}">⚖️ 盤點</button>
          </div>
        </div>
      </div>`;
    document.getElementById('inv-filter-product').onchange = (e) => { filterProduct = e.target.value; renderMovements(); };
    wrap.querySelectorAll('.inv-type-pill').forEach(b => {
      b.onclick = () => { filterType = b.dataset.t; renderFilter(); renderMovements(); };
    });
  }

  function renderMovements() {
    const wrap = document.getElementById('inv-movements');
    const isAll = selectedMonth === 'all';
    const filterYM = isAll ? null : (selectedMonth || currentBrowserYM);

    let rows = allMovements.filter(m => {
      if (filterYM && (!m.movement_date || m.movement_date.slice(0, 7) !== filterYM)) return false;
      if (filterProduct !== 'all' && m.product_id !== filterProduct) return false;
      if (filterType !== 'all' && m.type !== filterType) return false;
      return true;
    });

    if (rows.length === 0) {
      wrap.innerHTML = `<div class="text-center py-16 text-gray-400"><div class="text-5xl mb-3">🧾</div><p class="text-sm">此期間沒有庫存異動紀錄</p></div>`;
      return;
    }

    const netQty = rows.reduce((s, m) => s + (parseInt(m.quantity) || 0), 0);

    wrap.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="text-left  px-3 py-3 font-medium">日期</th>
              <th class="text-left  px-3 py-3 font-medium">產品</th>
              <th class="text-center px-3 py-3 font-medium">類型</th>
              <th class="text-left  px-3 py-3 font-medium hidden md:table-cell">通路 / 來源</th>
              <th class="text-right px-3 py-3 font-medium">數量</th>
              <th class="text-left  px-3 py-3 font-medium hidden lg:table-cell">備註</th>
              <th class="px-2 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${rows.map(m => renderMovementRow(m)).join('')}
          </tbody>
          <tfoot class="bg-indigo-50 border-t-2 border-indigo-200 text-sm">
            <tr>
              <td colspan="4" class="px-3 py-3 text-right font-medium text-gray-600">期間淨變化（${rows.length} 筆）</td>
              <td class="px-3 py-3 text-right font-bold ${netQty >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${netQty >= 0 ? '+' : ''}${fmtIntInv(netQty)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  function renderMovementRow(m) {
    const t = INV_TYPE_LABEL[m.type] || INV_TYPE_LABEL.adjust;
    const qty = parseInt(m.quantity) || 0;
    const qtyColor = qty > 0 ? 'text-emerald-700' : qty < 0 ? 'text-rose-700' : 'text-slate-500';
    const channelLabel = m.channel ? (INV_CHANNEL_LABEL[m.channel] || m.channel) : '—';
    const refLabel = m.ref_type === 'purchase_order' ? '採購單' : m.ref_type === 'kol_commission' ? 'KOL 開團' : '手動';
    const isManual = m.ref_type === 'manual';
    return `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">${fmtDateInv(m.movement_date)}</td>
        <td class="px-3 py-3 font-medium text-slate-900">${escHtmlInv(m.product_name || '—')}</td>
        <td class="px-3 py-3 text-center"><span class="status-chip ${t.cls}">${t.emoji} ${t.text}</span></td>
        <td class="px-3 py-3 text-slate-600 hidden md:table-cell">
          <span>${channelLabel}</span>
          <span class="text-[10px] text-slate-400 ml-1">· ${refLabel}</span>
        </td>
        <td class="px-3 py-3 text-right num-display ${qtyColor}">${qty > 0 ? '+' : ''}${fmtIntInv(qty)}</td>
        <td class="px-3 py-3 text-slate-400 text-xs hidden lg:table-cell truncate max-w-[200px]" title="${escHtmlInv(m.note || '')}">${escHtmlInv(m.note || '')}</td>
        <td class="px-2 py-3">
          <div class="flex items-center gap-1 justify-end">
            <button data-action="edit-mov" data-id="${m.id}" class="chip-btn ${isManual ? 'chip-btn-primary' : ''}" ${isManual ? '' : 'style="opacity:.4"'}>編輯</button>
            <button data-action="del-mov" data-id="${m.id}" class="chip-btn ${isManual ? 'chip-btn-danger' : ''}" ${isManual ? '' : 'style="opacity:.4"'}>刪除</button>
          </div>
        </td>
      </tr>`;
  }

  refresh();
}

// =====================================================
// Modal：新增/編輯庫存異動
// =====================================================
function showMovementModal(movement, products, onSave, defaultType) {
  const isEdit = !!movement;
  const type0 = isEdit ? movement.type : (defaultType || 'in');
  const root = document.getElementById('modal-root');

  const typeMeta = {
    in:     { title: '進貨入庫', accent: 'emerald', hint: '增加庫存（補貨、生產入庫）' },
    out:    { title: '出貨',     accent: 'pink',    hint: '減少庫存（賣出、配貨、贈樣、報損）' },
    adjust: { title: '盤點調整', accent: 'amber',   hint: '校正庫存差異（盤盈填正數、盤虧填負數）' },
  };

  const productOpts = (products || []).map(p =>
    `<option value="${p.id}" ${movement?.product_id === p.id ? 'selected' : ''}>${escHtmlInv(p.name)}（目前 ${fmtIntInv(p.current_stock || 0)} 件）</option>`
  ).join('');

  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 id="mov-title" class="text-base font-semibold text-gray-900">${isEdit ? '編輯庫存異動' : typeMeta[type0].title}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form id="mov-form" class="px-6 py-4 space-y-4">
          <!-- 類型 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">異動類型</label>
            <div class="pill-tab-bar w-full" style="display:flex">
              <button type="button" data-type="in"     class="mov-type-btn pill-tab flex-1 ${type0 === 'in' ? 'active' : ''}">📥 進貨</button>
              <button type="button" data-type="out"    class="mov-type-btn pill-tab flex-1 ${type0 === 'out' ? 'active' : ''}">📤 出貨</button>
              <button type="button" data-type="adjust" class="mov-type-btn pill-tab flex-1 ${type0 === 'adjust' ? 'active' : ''}">⚖️ 盤點</button>
            </div>
            <p id="mov-hint" class="text-[11px] text-slate-400 mt-1.5">${typeMeta[type0].hint}</p>
          </div>
          <!-- 產品 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">產品 <span class="text-red-500">*</span></label>
            <select id="mov-product" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">請選擇產品</option>
              ${productOpts}
            </select>
          </div>
          <!-- 通路（僅出貨）-->
          <div id="mov-channel-wrap" class="${type0 === 'out' ? '' : 'hidden'}">
            <label class="block text-sm font-medium text-gray-700 mb-1">出貨通路</label>
            <select id="mov-channel" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              ${OUT_CHANNELS.map(ch => `<option value="${ch}" ${movement?.channel === ch ? 'selected' : ''}>${INV_CHANNEL_LABEL[ch]}</option>`).join('')}
            </select>
          </div>
          <!-- 數量 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">數量（件） <span class="text-red-500">*</span></label>
            <input id="mov-qty" type="number" step="1" required
              value="${isEdit ? Math.abs(parseInt(movement.quantity) || 0) : ''}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="輸入件數">
            <p id="mov-qty-hint" class="text-[11px] text-slate-400 mt-1">${type0 === 'adjust' ? '盤盈填正、盤虧填負（例：少了 3 件填 -3）' : '填正整數即可'}</p>
          </div>
          <!-- 日期 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">異動日期 <span class="text-red-500">*</span></label>
            <input id="mov-date" type="date" required value="${movement?.movement_date || new Date().toISOString().slice(0,10)}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
          <!-- 備註 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input id="mov-note" type="text" value="${escHtmlInv(movement?.note || '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="選填，例：3 月生產批次 / 破損報廢">
          </div>
          <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
          <div class="flex gap-3 pt-2">
            <button type="button" id="modal-cancel" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            <button type="submit" id="modal-submit" class="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">儲存</button>
          </div>
        </form>
      </div>
    </div>`;

  let activeType = type0;
  function close() { root.innerHTML = ''; }
  document.getElementById('modal-close').onclick = close;
  document.getElementById('modal-cancel').onclick = close;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) close(); };

  // 類型切換
  document.querySelectorAll('.mov-type-btn').forEach(btn => {
    btn.onclick = () => {
      activeType = btn.dataset.type;
      document.querySelectorAll('.mov-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === activeType));
      document.getElementById('mov-channel-wrap').classList.toggle('hidden', activeType !== 'out');
      document.getElementById('mov-hint').textContent = typeMeta[activeType].hint;
      document.getElementById('mov-qty-hint').textContent = activeType === 'adjust'
        ? '盤盈填正、盤虧填負（例：少了 3 件填 -3）' : '填正整數即可';
      if (!isEdit) document.getElementById('mov-title').textContent = typeMeta[activeType].title;
    };
  });

  document.getElementById('mov-form').onsubmit = async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('modal-submit');
    btn.disabled = true; btn.textContent = '儲存中…';

    const qtyRaw = parseInt(document.getElementById('mov-qty').value);
    if (activeType !== 'adjust' && (!qtyRaw || qtyRaw <= 0)) {
      errEl.textContent = '數量必須為正整數'; errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存'; return;
    }

    const body = {
      product_id:    document.getElementById('mov-product').value,
      type:          activeType,
      channel:       activeType === 'out' ? document.getElementById('mov-channel').value : (activeType === 'in' ? 'restock' : null),
      quantity:      qtyRaw,  // 後端依 type 決定正負
      movement_date: document.getElementById('mov-date').value,
      note:          document.getElementById('mov-note').value.trim() || null,
    };
    if (!body.product_id) {
      errEl.textContent = '請選擇產品'; errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存'; return;
    }

    try {
      if (isEdit) await api.inventory.update(movement.id, body);
      else        await api.inventory.create(body);
      close();
      if (onSave) onSave();
      toast(isEdit ? '庫存異動已更新' : '庫存異動已新增');
    } catch (err) {
      errEl.textContent = err.message; errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

async function deleteMovement(m, onDelete) {
  const ok = await confirm(`確定要刪除這筆「${m.product_name || ''}」的庫存異動嗎？`);
  if (!ok) return;
  try {
    await api.inventory.delete(m.id);
    toast('已刪除');
    if (onDelete) onDelete();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── 工具函式 ────────────────────────────────────────────
function fmtIntInv(n) {
  return (parseInt(n) || 0).toLocaleString('zh-TW');
}
function fmtDateInv(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function escHtmlInv(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.renderInventoryList = renderInventoryList;
