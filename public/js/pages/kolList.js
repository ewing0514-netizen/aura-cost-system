// 頁面：KOL 分潤管理（團主資料 + 每場團購分潤紀錄）

async function renderKolList() {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="ambient-bg font-apple">
      <div class="max-w-6xl mx-auto px-4 py-10">
        <!-- 標題 -->
        <div class="section-header">
          <div>
            <h1 class="h-display">KOL 分潤管理</h1>
            <p class="section-subtitle">追蹤每場團購的銷售金額、分潤百分比與支付狀態</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-add-kol" class="btn-apple-ghost">+ 新增團主</button>
            <button id="btn-add-commission" class="btn-apple-pink">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              新增分潤
            </button>
          </div>
        </div>

        <!-- 月份切換器 -->
        <div id="kol-month-selector" class="mb-4"></div>

        <!-- 統計卡片 -->
        <div id="kol-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="flex justify-center py-6 col-span-2 md:col-span-4"><div class="spinner"></div></div>
        </div>

        <!-- 篩選 Tab Pill -->
        <div class="flex justify-start mb-5 overflow-x-auto pb-1">
          <div class="pill-tab-bar">
            <button data-tab="all"     class="kol-tab-btn pill-tab active">全部</button>
            <button data-tab="unpaid"  class="kol-tab-btn pill-tab">⏳ 待付分潤</button>
            <button data-tab="paid"    class="kol-tab-btn pill-tab">✓ 已付</button>
          </div>
        </div>

        <!-- 分潤表格 -->
        <div id="commission-list" class="glass-card overflow-hidden">
          <div class="flex justify-center py-12"><div class="spinner"></div></div>
        </div>

        <!-- 分隔線 -->
        <div class="glass-divider my-10"></div>

        <!-- 團主名單 -->
        <div class="section-header">
          <div>
            <h2 class="section-title">團主名單</h2>
            <p class="section-subtitle">管理常合作的 KOL，新增分潤時會自動帶入預設 % 與帳號</p>
          </div>
          <button id="btn-add-kol-2" class="btn-apple-ghost">+ 新增團主</button>
        </div>
        <div id="kol-roster"><div class="flex justify-center py-8"><div class="spinner"></div></div></div>
      </div>
    </div>
  `;

  let currentTab = 'all';
  let allKols = [];
  let allCommissions = [];

  // 月份篩選 state — null = 預設用瀏覽器當月，'all' = 全部，其他 = 'YYYY-MM'
  let selectedMonth = null;
  const currentBrowserYM = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();

  // 萃取月份列表 — 從 2026/01 起到當月（或最新資料月份）連續顯示
  function extractKolMonths() {
    const months = new Set();
    const now = new Date();

    // 起點：2026/01
    let cursor = new Date(2026, 0, 1);
    // 終點：當月（或更晚的資料月份）
    let endY = now.getFullYear(), endM = now.getMonth();
    for (const c of allCommissions) {
      if (!c.start_date) continue;
      const [y, m] = c.start_date.split('-').map(Number);
      if (y > endY || (y === endY && m - 1 > endM)) { endY = y; endM = m - 1; }
    }
    const end = new Date(endY, endM, 1);

    while (cursor <= end) {
      const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      months.add(ym);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    // 保護：補上任何 2026/01 之前的歷史資料月份（依開團開始日）
    for (const c of allCommissions) {
      if (c.start_date) months.add(c.start_date.slice(0, 7));
    }
    return Array.from(months).sort().reverse();
  }

  // 判斷一筆分潤是否在指定月份 — 僅看「開團開始日」
  function commissionInMonth(c, ym) {
    if (!ym) return true; // 'all'
    return c.start_date && c.start_date.slice(0, 7) === ym;
  }

  function renderMonthSelector() {
    const wrap = document.getElementById('kol-month-selector');
    if (!wrap) return;
    const months = extractKolMonths();
    const activeKey = selectedMonth === 'all' ? 'all' : (selectedMonth || currentBrowserYM);

    wrap.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-slate-500 font-semibold tracking-wide">📅 檢視期間：</span>
        <div class="pill-tab-bar">
          <button data-month="all" class="kol-month-pill pill-tab ${activeKey === 'all' ? 'active' : ''}">全部累計</button>
          ${months.map(m => `
            <button data-month="${m}" class="kol-month-pill pill-tab ${activeKey === m ? 'active' : ''}">
              ${m.replace('-', '/')}${m === currentBrowserYM ? ' ⌃' : ''}
            </button>
          `).join('')}
        </div>
        <span class="text-[11px] text-slate-400 ml-1">＊以開團開始日為基準</span>
      </div>
    `;

    wrap.querySelectorAll('.kol-month-pill').forEach(btn => {
      btn.onclick = () => {
        selectedMonth = btn.dataset.month;
        renderMonthSelector();    // 重畫 pill 讓 active 狀態同步
        renderStats();
        renderCommissionTable();
      };
    });
  }

  document.getElementById('btn-add-kol').onclick        = () => showKolModal(null, refresh);
  document.getElementById('btn-add-kol-2').onclick      = () => showKolModal(null, refresh);
  document.getElementById('btn-add-commission').onclick = () => showCommissionModal(null, allKols, refresh);

  // Tab 切換（pill style）
  document.querySelectorAll('.kol-tab-btn').forEach(btn => {
    btn.onclick = () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.kol-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === currentTab);
      });
      renderCommissionTable();
    };
  });

  // 事件委派
  document.getElementById('commission-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const c = allCommissions.find(x => x.id === id);
    if (!c) return;
    if (action === 'edit-comm')      showCommissionModal(c, allKols, refresh);
    else if (action === 'delete-comm') deleteCommission(c, refresh);
    else if (action === 'toggle-paid') togglePaid(c, refresh);
  });

  document.getElementById('kol-roster').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const k = allKols.find(x => x.id === id);
    if (!k) return;
    if (action === 'edit-kol')        showKolModal(k, refresh);
    else if (action === 'delete-kol') deleteKol(k, refresh);
  });

  function isMissing(err) {
    return err.message && err.message.includes('Could not find the table');
  }

  function migrationNotice() {
    return `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
        <div class="text-3xl mb-2">🔧</div>
        <p class="text-sm font-semibold text-amber-800 mb-1">需要先執行資料庫 Migration</p>
        <p class="text-xs text-amber-600 mb-3">請到 Supabase SQL Editor 執行 <code class="font-mono bg-amber-100 px-1 rounded">database/migration_kol.sql</code></p>
      </div>
    `;
  }

  async function refresh() {
    try {
      const [kols, commissions] = await Promise.all([
        api.kols.list(),
        api.kolCommissions.list(),
      ]);
      allKols = kols;
      allCommissions = commissions;
      renderMonthSelector();
      renderStats();
      renderCommissionTable();
      renderKolRoster();
    } catch (err) {
      if (isMissing(err)) {
        document.getElementById('commission-list').innerHTML = migrationNotice();
        document.getElementById('kol-roster').innerHTML = '';
        document.getElementById('kol-stats').innerHTML = `<div class="col-span-2 md:col-span-4 text-center text-xs text-gray-400 py-4">執行 migration 後即可使用</div>`;
      } else {
        document.getElementById('commission-list').innerHTML = `<div class="text-center py-12 text-red-500">載入失敗：${err.message}</div>`;
      }
    }
  }

  function renderStats() {
    const c = document.getElementById('kol-stats');

    const isAll = selectedMonth === 'all';
    const filterYM = isAll ? null : (selectedMonth || currentBrowserYM);
    const monthLabel = isAll ? '累計' : filterYM.replace('-', '/');
    const periodTitle = isAll ? '累計' : '本月';

    const filtered = allCommissions.filter(c => commissionInMonth(c, filterYM));
    const totalUnpaid = filtered.filter(x => !x.paid).reduce((s, x) => s + parseFloat(x.commission_amount || 0), 0);
    const totalPaid   = filtered.filter(x =>  x.paid).reduce((s, x) => s + parseFloat(x.commission_amount || 0), 0);
    const totalSales  = filtered.reduce((s, x) => s + parseFloat(x.sales_amount || 0), 0);
    const unpaidCount = filtered.filter(x => !x.paid).length;
    const paidCount   = filtered.filter(x =>  x.paid).length;

    // 累計參考（全部團購）
    const cumUnpaid = allCommissions.filter(x => !x.paid).reduce((s, x) => s + parseFloat(x.commission_amount || 0), 0);
    const cumPaid   = allCommissions.filter(x =>  x.paid).reduce((s, x) => s + parseFloat(x.commission_amount || 0), 0);
    const cumSales  = allCommissions.reduce((s, x) => s + parseFloat(x.sales_amount || 0), 0);

    // 該月活躍 KOL（有任何分潤紀錄落在該月的團主）
    const activeKolIds = new Set(filtered.map(x => x.kol_id).filter(Boolean));
    const activeKolCount = activeKolIds.size;

    c.innerHTML = `
      <div class="glass-stat glass-stat-expense">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-pink-700 text-xs font-semibold tracking-wide">
            <span class="text-base">⏳</span>${periodTitle}待付分潤
          </div>
          <span class="text-[10px] text-pink-600/60 font-mono">${monthLabel}</span>
        </div>
        <div class="num-display text-2xl text-pink-700">NT$${fmtMoneyKol(totalUnpaid)}</div>
        <div class="text-[11px] text-pink-500/70 mt-1.5">${unpaidCount} 筆${isAll ? '' : ` · 累計 <span class="font-semibold">NT$${fmtMoneyKol(cumUnpaid)}</span>`}</div>
      </div>
      <div class="glass-stat glass-stat-income">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold tracking-wide">
            <span class="text-base">✓</span>${periodTitle}已付分潤
          </div>
          <span class="text-[10px] text-emerald-600/60 font-mono">${monthLabel}</span>
        </div>
        <div class="num-display text-2xl text-emerald-700">NT$${fmtMoneyKol(totalPaid)}</div>
        <div class="text-[11px] text-emerald-500/70 mt-1.5">${paidCount} 筆${isAll ? '' : ` · 累計 <span class="font-semibold">NT$${fmtMoneyKol(cumPaid)}</span>`}</div>
      </div>
      <div class="glass-stat glass-stat-net">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-indigo-700 text-xs font-semibold tracking-wide">
            <span class="text-base">📦</span>${periodTitle}銷售金額
          </div>
          <span class="text-[10px] text-indigo-600/60 font-mono">${monthLabel}</span>
        </div>
        <div class="num-display text-2xl text-indigo-700">NT$${fmtMoneyKol(totalSales)}</div>
        <div class="text-[11px] text-indigo-500/70 mt-1.5">${filtered.length} 場團購${isAll ? '' : ` · 累計 <span class="font-semibold">NT$${fmtMoneyKol(cumSales)}</span>`}</div>
      </div>
      <div class="glass-stat glass-stat-partner">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-purple-700 text-xs font-semibold tracking-wide">
            <span class="text-base">👥</span>${isAll ? '合作' : '本月活躍'}團主
          </div>
          <span class="text-[10px] text-purple-600/60 font-mono">${monthLabel}</span>
        </div>
        <div class="num-display text-2xl text-purple-700">${isAll ? allKols.filter(k => k.is_active).length : activeKolCount} <span class="text-base font-normal text-purple-500">位</span></div>
        <div class="text-[11px] text-purple-500/70 mt-1.5">${isAll ? `${allCommissions.length} 場團購` : `名單上共 ${allKols.filter(k => k.is_active).length} 位 KOL`}</div>
      </div>
    `;
  }

  function renderCommissionTable() {
    const wrap = document.getElementById('commission-list');

    // 先依月份篩選
    const isAll = selectedMonth === 'all';
    const filterYM = isAll ? null : (selectedMonth || currentBrowserYM);
    let rows = allCommissions.filter(c => commissionInMonth(c, filterYM));

    // 再依狀態 tab 篩選
    if (currentTab === 'unpaid')    rows = rows.filter(c => !c.paid);
    else if (currentTab === 'paid') rows = rows.filter(c =>  c.paid);

    if (rows.length === 0) {
      wrap.innerHTML = `
        <div class="text-center py-16 text-gray-400">
          <div class="text-5xl mb-3">📣</div>
          <p class="text-sm">沒有符合條件的分潤紀錄</p>
        </div>
      `;
      return;
    }

    const totalCommission = rows.reduce((s, c) => s + parseFloat(c.commission_amount || 0), 0);

    wrap.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="text-left  px-3 py-3 font-medium">團主</th>
              <th class="text-left  px-3 py-3 font-medium">團購名稱</th>
              <th class="text-left  px-3 py-3 font-medium hidden md:table-cell">商品</th>
              <th class="text-left  px-3 py-3 font-medium hidden lg:table-cell">開始 / 結束</th>
              <th class="text-right px-3 py-3 font-medium">銷售金額</th>
              <th class="text-right px-3 py-3 font-medium">分潤(%)</th>
              <th class="text-right px-3 py-3 font-medium">分潤金額</th>
              <th class="text-center px-3 py-3 font-medium">狀態</th>
              <th class="px-2 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${rows.map(c => renderCommissionRow(c)).join('')}
          </tbody>
          <tfoot class="bg-pink-50 border-t-2 border-pink-200 text-sm">
            <tr>
              <td colspan="6" class="px-3 py-3 text-right font-medium text-gray-600">${currentTab === 'unpaid' ? '待付總分潤' : currentTab === 'paid' ? '已付總分潤' : '總分潤金額'}</td>
              <td class="px-3 py-3 text-right font-bold text-pink-700">NT$${fmtMoneyKol(totalCommission)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  function renderCommissionRow(c) {
    const dateRange = c.end_date
      ? `${fmtDateKol(c.start_date)} ~ ${fmtDateKol(c.end_date)}`
      : fmtDateKol(c.start_date);
    const productLabel = c.product_name || c.product_label || '—';
    const kolName = c.kol_name || '<span class="text-gray-400">（無團主）</span>';
    const statusBadge = c.paid
      ? `<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ 已付</span>`
      : `<span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⏳ 待付</span>`;
    const paidInfo = c.paid && c.paid_at ? `<div class="text-[10px] text-gray-400 mt-0.5">${fmtDateKol(c.paid_at)}</div>` : '';

    return `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-3 py-3">
          <div class="font-medium text-gray-900">${kolName}</div>
          ${c.kol_bank_account ? `<div class="text-[10px] text-gray-400 truncate max-w-[140px]" title="${escHtmlKol(c.kol_bank_account)}">${escHtmlKol(c.kol_bank_account)}</div>` : ''}
        </td>
        <td class="px-3 py-3">
          <div class="text-gray-900">${escHtmlKol(c.campaign_name)}</div>
          ${c.note ? `<div class="text-[10px] text-gray-400 truncate max-w-[180px]" title="${escHtmlKol(c.note)}">${escHtmlKol(c.note)}</div>` : ''}
        </td>
        <td class="px-3 py-3 text-gray-600 hidden md:table-cell">${escHtmlKol(productLabel)}</td>
        <td class="px-3 py-3 text-gray-500 text-xs hidden lg:table-cell">${dateRange}</td>
        <td class="px-3 py-3 text-right font-mono text-gray-700">NT$${fmtMoneyKol(c.sales_amount)}</td>
        <td class="px-3 py-3 text-right text-pink-600 font-medium">${parseFloat(c.commission_pct).toFixed(1)}%</td>
        <td class="px-3 py-3 text-right font-mono font-semibold text-pink-700">NT$${fmtMoneyKol(c.commission_amount)}</td>
        <td class="px-3 py-3 text-center">${statusBadge}${paidInfo}</td>
        <td class="px-2 py-3">
          <div class="flex items-center gap-1 justify-end">
            <button data-action="toggle-paid" data-id="${c.id}" class="text-xs px-2 py-1 rounded ${c.paid ? 'text-gray-500 hover:bg-gray-100' : 'text-emerald-700 hover:bg-emerald-50 font-medium'}" title="${c.paid ? '取消已付' : '標記為已付'}">
              ${c.paid ? '↺' : '✓ 標記已付'}
            </button>
            <button data-action="edit-comm" data-id="${c.id}" class="text-xs text-gray-500 hover:text-pink-600 px-2 py-1 rounded hover:bg-pink-50">編輯</button>
            <button data-action="delete-comm" data-id="${c.id}" class="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">刪除</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderKolRoster() {
    const wrap = document.getElementById('kol-roster');
    if (allKols.length === 0) {
      wrap.innerHTML = `
        <div class="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          尚未新增任何團主 — 點上方「+ 新增團主」開始建立合作名單
        </div>
      `;
      return;
    }
    wrap.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${allKols.map(k => `
          <div class="glass-card-soft p-4 ${!k.is_active ? 'opacity-50' : ''}">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-slate-900" style="letter-spacing:-0.015em">${escHtmlKol(k.name)}</span>
                  <span class="status-chip" style="background:linear-gradient(135deg,rgba(252,231,243,0.85) 0%,rgba(251,207,232,0.55) 100%);color:#9d174d;border-color:rgba(249,168,212,0.5)">預設 ${parseFloat(k.default_commission_pct).toFixed(1)}%</span>
                  ${!k.is_active ? '<span class="text-[11px] text-slate-400">（停用）</span>' : ''}
                </div>
                ${k.contact_info ? `<div class="text-[12px] text-slate-500 mt-1.5 truncate">${escHtmlKol(k.contact_info)}</div>` : ''}
                ${k.bank_account ? `<div class="text-[11px] text-slate-400 mt-0.5 truncate font-mono">${escHtmlKol(k.bank_account)}</div>` : ''}
                ${k.note ? `<div class="text-[11px] text-slate-400 mt-1 italic line-clamp-2">${escHtmlKol(k.note)}</div>` : ''}
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button data-action="edit-kol"   data-id="${k.id}" class="chip-btn chip-btn-primary">編輯</button>
                <button data-action="delete-kol" data-id="${k.id}" class="chip-btn chip-btn-danger">刪除</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  refresh();
}

// =====================================================
// Modal：新增/編輯團主
// =====================================================
function showKolModal(kol, onSave) {
  const isEdit = !!kol;
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">${isEdit ? '編輯團主' : '新增團主'}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form id="kol-form" class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">團主名稱 <span class="text-red-500">*</span></label>
            <input id="k-name" type="text" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value="${escHtmlKol(kol?.name || '')}" placeholder="例：劉綺薇">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">預設分潤 %</label>
            <div class="flex items-center gap-2">
              <input id="k-pct" type="number" min="0" max="100" step="0.1" value="${kol?.default_commission_pct ?? 20}" class="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-pink-500">
              <span class="text-sm text-gray-500">%（新增分潤紀錄時自動帶入）</span>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">聯絡方式</label>
            <input id="k-contact" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value="${escHtmlKol(kol?.contact_info || '')}" placeholder="IG / Line ID / 電話">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">匯款帳號</label>
            <textarea id="k-bank" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none" placeholder="例：第一銀行 007 斗六分行 521-10-099608">${escHtmlKol(kol?.bank_account || '')}</textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea id="k-note" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none">${escHtmlKol(kol?.note || '')}</textarea>
          </div>
          ${isEdit ? `
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="k-active" type="checkbox" class="w-4 h-4 text-pink-600 rounded" ${kol.is_active ? 'checked' : ''}>
              <span class="text-sm text-gray-700">啟用（取消勾選 = 停用此團主）</span>
            </label>
          ` : ''}
          <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
          <div class="flex gap-3 pt-2">
            <button type="button" id="modal-cancel" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            <button type="submit" id="modal-submit" class="flex-1 bg-pink-600 text-white py-2 rounded-lg hover:bg-pink-700 text-sm font-medium">儲存</button>
          </div>
        </form>
      </div>
    </div>
  `;
  function close() { root.innerHTML = ''; }
  document.getElementById('modal-close').onclick = close;
  document.getElementById('modal-cancel').onclick = close;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) close(); };

  document.getElementById('kol-form').onsubmit = async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('modal-submit');
    btn.disabled = true; btn.textContent = '儲存中…';

    const body = {
      name:                   document.getElementById('k-name').value.trim(),
      default_commission_pct: parseFloat(document.getElementById('k-pct').value) || 20,
      contact_info:           document.getElementById('k-contact').value.trim() || null,
      bank_account:           document.getElementById('k-bank').value.trim() || null,
      note:                   document.getElementById('k-note').value.trim() || null,
      is_active:              isEdit ? document.getElementById('k-active').checked : true,
    };

    try {
      if (isEdit) await api.kols.update(kol.id, body);
      else        await api.kols.create(body);
      close();
      if (onSave) onSave();
      toast(isEdit ? '團主已更新' : '團主已新增');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

async function deleteKol(kol, onDelete) {
  const ok = await confirm(`確定要刪除團主「${kol.name}」嗎？該團主名下的分潤紀錄會保留，但失去團主資料連結。`);
  if (!ok) return;
  try {
    await api.kols.delete(kol.id);
    toast('已刪除');
    if (onDelete) onDelete();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// =====================================================
// Modal：新增/編輯分潤紀錄
// =====================================================
async function showCommissionModal(commission, kols, onSave) {
  const isEdit = !!commission;
  const root = document.getElementById('modal-root');

  // 預載產品清單（選填關聯）
  let products = [];
  try { products = await api.products.list(); } catch (_) {}

  const kolOpts = `<option value="">（自行輸入名稱）</option>` + kols.filter(k => k.is_active || k.id === commission?.kol_id).map(k =>
    `<option value="${k.id}" data-pct="${k.default_commission_pct}" ${commission?.kol_id === k.id ? 'selected' : ''}>${escHtmlKol(k.name)}（預設 ${parseFloat(k.default_commission_pct).toFixed(1)}%）</option>`
  ).join('');

  const productOpts = `<option value="">（自行輸入商品）</option>` + products.map(p =>
    `<option value="${p.id}" ${commission?.product_id === p.id ? 'selected' : ''}>${escHtmlKol(p.name)}</option>`
  ).join('');

  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">${isEdit ? '編輯分潤紀錄' : '新增分潤紀錄'}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form id="comm-form" class="px-6 py-4 space-y-4">
          <!-- 團主 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">團主</label>
            <select id="c-kol" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500">
              ${kolOpts}
            </select>
          </div>
          <!-- 團購名稱 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">團購名稱 <span class="text-red-500">*</span></label>
            <input id="c-campaign" type="text" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value="${escHtmlKol(commission?.campaign_name || '')}" placeholder="例：【18個夏天限定團】">
          </div>
          <!-- 商品 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">關聯產品</label>
              <select id="c-product-id" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500">
                ${productOpts}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">或自由輸入商品</label>
              <input id="c-product-label" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value="${escHtmlKol(commission?.product_label || '')}" placeholder="例：moïd 服飾">
            </div>
          </div>
          <!-- 起訖日期 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">開始時間 <span class="text-red-500">*</span></label>
              <input id="c-start" type="date" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value="${commission?.start_date || new Date().toISOString().slice(0,10)}">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">結束時間</label>
              <input id="c-end" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value="${commission?.end_date || ''}">
            </div>
          </div>
          <!-- 銷售金額 + 分潤% -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">銷售金額 <span class="text-red-500">*</span></label>
              <div class="relative"><span class="absolute left-3 top-2 text-gray-400 text-sm">NT$</span>
                <input id="c-sales" type="number" min="0" step="1" required class="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" value="${commission?.sales_amount || 0}">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">分潤 % <span class="text-red-500">*</span></label>
              <div class="flex items-center gap-2">
                <input id="c-pct" type="number" min="0" max="100" step="0.1" required class="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-pink-500" value="${commission?.commission_pct ?? 20}">
                <span class="text-sm text-gray-500">%</span>
              </div>
            </div>
          </div>
          <!-- 即時計算分潤金額 -->
          <div class="bg-pink-50 border border-pink-200 rounded-lg p-3 flex items-center justify-between">
            <span class="text-sm text-pink-700 font-medium">💰 應付分潤金額</span>
            <span class="text-lg font-bold text-pink-700 font-mono" id="c-amount-preview">NT$0</span>
          </div>
          <!-- 出貨件數（庫存）-->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">出貨件數 <span class="text-gray-400 text-xs font-normal">（選填，自動扣庫存）</span></label>
            <div class="flex items-center gap-2">
              <input id="c-units" type="number" min="0" step="1" value="${commission?.units_sold || 0}"
                class="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-pink-500">
              <span class="text-sm text-gray-500">件，會從「關聯產品」的庫存扣除</span>
            </div>
            <p class="text-[11px] text-slate-400 mt-1">需有設定上方「關聯產品」才會扣庫存</p>
          </div>
          <!-- 已付狀態 -->
          <div class="grid grid-cols-2 gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="c-paid" type="checkbox" class="w-4 h-4 text-emerald-600 rounded" ${commission?.paid ? 'checked' : ''}>
              <span class="text-sm text-gray-700">標記為已付</span>
            </label>
            <div id="c-paid-date-wrap" class="${commission?.paid ? '' : 'hidden'}">
              <input id="c-paid-date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" value="${commission?.paid_at || ''}">
            </div>
          </div>
          <!-- 備註 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea id="c-note" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none">${escHtmlKol(commission?.note || '')}</textarea>
          </div>
          <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
          <div class="flex gap-3 pt-2">
            <button type="button" id="modal-cancel" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            <button type="submit" id="modal-submit" class="flex-1 bg-pink-600 text-white py-2 rounded-lg hover:bg-pink-700 text-sm font-medium">儲存</button>
          </div>
        </form>
      </div>
    </div>
  `;

  function close() { root.innerHTML = ''; }
  document.getElementById('modal-close').onclick = close;
  document.getElementById('modal-cancel').onclick = close;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) close(); };

  // 選團主時帶入預設 % (僅新增模式或欄位仍是預設值時)
  const kolSel = document.getElementById('c-kol');
  const pctInp = document.getElementById('c-pct');
  kolSel.onchange = () => {
    const opt = kolSel.options[kolSel.selectedIndex];
    const defaultPct = opt.dataset.pct;
    if (defaultPct && (!isEdit || !pctInp.value)) {
      pctInp.value = parseFloat(defaultPct);
      updatePreview();
    }
  };

  function updatePreview() {
    const sales = parseFloat(document.getElementById('c-sales').value) || 0;
    const pct   = parseFloat(document.getElementById('c-pct').value)   || 0;
    const amt   = sales * pct / 100;
    document.getElementById('c-amount-preview').textContent = 'NT$' + fmtMoneyKol(amt);
  }
  document.getElementById('c-sales').oninput = updatePreview;
  document.getElementById('c-pct').oninput   = updatePreview;
  updatePreview();

  // 已付 toggle
  document.getElementById('c-paid').onchange = function() {
    document.getElementById('c-paid-date-wrap').classList.toggle('hidden', !this.checked);
    if (this.checked && !document.getElementById('c-paid-date').value) {
      document.getElementById('c-paid-date').value = new Date().toISOString().slice(0,10);
    }
  };

  // 表單送出
  document.getElementById('comm-form').onsubmit = async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('modal-submit');
    btn.disabled = true; btn.textContent = '儲存中…';

    const paid = document.getElementById('c-paid').checked;
    const body = {
      kol_id:         document.getElementById('c-kol').value || null,
      campaign_name:  document.getElementById('c-campaign').value.trim(),
      product_id:     document.getElementById('c-product-id').value || null,
      product_label:  document.getElementById('c-product-label').value.trim() || null,
      start_date:     document.getElementById('c-start').value,
      end_date:       document.getElementById('c-end').value || null,
      sales_amount:   parseFloat(document.getElementById('c-sales').value) || 0,
      commission_pct: parseFloat(document.getElementById('c-pct').value) || 0,
      paid,
      paid_at:        paid ? (document.getElementById('c-paid-date').value || new Date().toISOString().slice(0,10)) : null,
      units_sold:     parseInt(document.getElementById('c-units').value) || 0,
      note:           document.getElementById('c-note').value.trim() || null,
    };

    try {
      if (isEdit) await api.kolCommissions.update(commission.id, body);
      else        await api.kolCommissions.create(body);
      close();
      if (onSave) onSave();
      toast(isEdit ? '分潤紀錄已更新' : '分潤紀錄已新增');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

async function deleteCommission(c, onDelete) {
  const ok = await confirm(`確定要刪除「${c.campaign_name}」這筆分潤紀錄嗎？`);
  if (!ok) return;
  try {
    await api.kolCommissions.delete(c.id);
    toast('已刪除');
    if (onDelete) onDelete();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function togglePaid(c, onUpdate) {
  const newPaid = !c.paid;
  const body = {
    kol_id:         c.kol_id || null,
    campaign_name:  c.campaign_name,
    product_id:     c.product_id || null,
    product_label:  c.product_label || null,
    start_date:     c.start_date,
    end_date:       c.end_date || null,
    sales_amount:   parseFloat(c.sales_amount || 0),
    commission_pct: parseFloat(c.commission_pct || 0),
    paid:           newPaid,
    paid_at:        newPaid ? (c.paid_at || new Date().toISOString().slice(0,10)) : null,
    note:           c.note || null,
  };
  try {
    await api.kolCommissions.update(c.id, body);
    toast(newPaid ? '已標記為已付' : '已取消已付狀態');
    if (onUpdate) onUpdate();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ===== 工具函式（避免與其他頁面衝突，加 Kol 後綴）=====
function fmtMoneyKol(n) {
  return parseFloat(n || 0).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDateKol(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/');
}
function escHtmlKol(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.renderKolList = renderKolList;
