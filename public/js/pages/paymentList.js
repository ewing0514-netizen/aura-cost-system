// 頁面：現金財務記錄（收入 + 支出 + 合夥人分潤）

const STATUS_LABEL = {
  pending:        { text: '待付訂金', cls: 'bg-orange-100 text-orange-700' },
  deposit_paid:   { text: '待付尾款', cls: 'bg-yellow-100 text-yellow-700' },
  completed:      { text: '已完成',   cls: 'bg-green-100  text-green-700'  },
  cancelled:      { text: '已取消',   cls: 'bg-gray-100   text-gray-500'   },
  pending_income: { text: '待入帳',   cls: 'bg-amber-100  text-amber-700'  },
  received:       { text: '已入帳',   cls: 'bg-emerald-100 text-emerald-700' },
};

const INCOME_CATEGORY_LABEL = {
  product_sales: { text: '產品銷售', emoji: '📦', cls: 'bg-blue-100 text-blue-700' },
  service:       { text: '業務合作', emoji: '🤝', cls: 'bg-purple-100 text-purple-700' },
  consulting:    { text: '顧問費',   emoji: '💼', cls: 'bg-teal-100 text-teal-700' },
  other:         { text: '其他收入', emoji: '✨', cls: 'bg-gray-100 text-gray-700' },
};

// 預設合夥人分潤 % (每筆收入可獨立調整)
const DEFAULT_PARTNER_SPLIT = 50;

async function renderPaymentList() {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="ambient-bg font-apple">
      <div class="max-w-5xl mx-auto px-4 py-10">
        <!-- 標題 -->
        <div class="flex items-end justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 class="h-display">現金財務記錄</h1>
            <p class="text-slate-500 text-sm mt-1.5">追蹤所有現金收入與支出，合夥人分潤一目了然</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-add-income" class="btn-apple-income">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              新增收入
            </button>
            <button id="btn-add-order" class="btn-apple-primary">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              新增支出
            </button>
          </div>
        </div>

        <!-- 月份切換器 -->
        <div id="month-selector" class="mb-4"></div>

        <!-- Stats 卡片 -->
        <div id="payment-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="flex justify-center py-6 col-span-2 md:col-span-4"><div class="spinner"></div></div>
        </div>

        <!-- 篩選 Tab Pill -->
        <div class="flex justify-start mb-5 overflow-x-auto pb-1">
          <div class="pill-tab-bar">
            <button data-tab="all"            class="tab-btn pill-tab active">全部</button>
            <button data-tab="income"         class="tab-btn pill-tab">💰 收入</button>
            <button data-tab="expense"        class="tab-btn pill-tab">💸 支出</button>
            <button data-tab="pending"        class="tab-btn pill-tab">待付訂金</button>
            <button data-tab="deposit_paid"   class="tab-btn pill-tab">待付尾款</button>
            <button data-tab="pending_income" class="tab-btn pill-tab">待入帳</button>
            <button data-tab="completed"      class="tab-btn pill-tab">已完成</button>
            <button data-tab="cancelled"      class="tab-btn pill-tab">已取消</button>
          </div>
        </div>

        <!-- 記錄列表（合併收入 + 支出，按日期排序）-->
        <div id="order-list-content">
          <div class="flex justify-center py-12"><div class="spinner"></div></div>
        </div>

        <!-- 分隔線 -->
        <div class="glass-divider my-10"></div>

        <!-- 供應商管理 -->
        <div class="flex items-end justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900" style="letter-spacing:-0.02em">供應商管理</h2>
            <p class="text-slate-500 text-sm mt-1">管理合作供應商的聯絡資訊與匯款帳號</p>
          </div>
          <button id="btn-add-supplier" class="btn-apple-ghost">+ 新增供應商</button>
        </div>
        <div id="supplier-list-content">
          <div class="flex justify-center py-8"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  let currentTab = 'all';
  let allOrders   = [];
  let allIncomes  = [];
  let allKolCommissions = [];
  let allExpenseRecords = [];
  let allSuppliers = [];

  // 月份篩選 state — null = 預設用瀏覽器當月，'all' = 累計，其他 = 'YYYY-MM'
  let selectedMonth = null;
  const currentBrowserYM = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();

  document.getElementById('btn-add-order').onclick    = () => showExpenseTypeChooser(refresh);
  document.getElementById('btn-add-income').onclick   = () => showIncomeModal(null, refresh);
  document.getElementById('btn-add-supplier').onclick = () => showSupplierModal(null, loadSuppliers);

  // Tab 切換（pill style）
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === currentTab);
      });
      renderOrders();
    };
  });

  // 事件委派：列表按鈕
  document.getElementById('order-list-content').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, name } = btn.dataset;
    if (action === 'edit-order') {
      const order = allOrders.find(o => o.id === id);
      if (order) showPurchaseOrderModal(order, refresh);
    } else if (action === 'delete-order') {
      deletePurchaseOrder(id, name, refresh);
    } else if (action === 'edit-income') {
      const inc = allIncomes.find(i => i.id === id);
      if (inc) showIncomeModal(inc, refresh);
    } else if (action === 'delete-income') {
      deleteIncomeRecord(id, name, refresh);
    } else if (action === 'edit-expense') {
      const exp = allExpenseRecords.find(x => x.id === id);
      if (exp) showExpenseModal(exp, exp.category, refresh);
    } else if (action === 'delete-expense') {
      deleteExpenseRecord(id, name, refresh);
    }
  });

  function renderOrders() {
    const container = document.getElementById('order-list-content');

    // 合併收入 + 貨款支出 + 系統/其他支出，加上 _kind 區分
    const merged = [
      ...allOrders.map(o  => ({ ...o, _kind: 'expense',  _date: o.order_date,   _ts: o.order_date   + (o.created_at || '') })),
      ...allIncomes.map(i => ({ ...i, _kind: 'income',   _date: i.income_date,  _ts: i.income_date  + (i.created_at || '') })),
      ...allExpenseRecords.map(x => ({ ...x, _kind: 'exprec', _date: x.expense_date, _ts: x.expense_date + (x.created_at || '') })),
    ];

    // 按目前 tab 過濾
    let rows;
    if (currentTab === 'all') {
      rows = merged;
    } else if (currentTab === 'income') {
      rows = merged.filter(r => r._kind === 'income');
    } else if (currentTab === 'expense') {
      rows = merged.filter(r => r._kind === 'expense' || r._kind === 'exprec');
    } else if (currentTab === 'pending_income') {
      rows = merged.filter(r => r._kind === 'income' && r.status === 'pending_income');
    } else {
      // 既有支出狀態 (pending / deposit_paid / completed / cancelled)
      rows = merged.filter(r => r._kind === 'expense' && r.status === currentTab);
    }

    // 按日期排序（新到舊）
    rows.sort((a, b) => (b._ts || '').localeCompare(a._ts || ''));

    if (rows.length === 0) {
      container.innerHTML = `<div class="text-center py-16 text-gray-400"><div class="text-5xl mb-4">📋</div><p class="text-lg">沒有符合條件的記錄</p></div>`;
      return;
    }

    container.innerHTML = rows.map(r =>
      r._kind === 'income' ? renderIncomeCard(r)
      : r._kind === 'exprec' ? renderExpenseRecordCard(r)
      : renderExpenseCard(r)
    ).join('');
  }

  // 系統 / 其他支出卡片
  function renderExpenseRecordCard(x) {
    const catMeta = x.category === 'system'
      ? { emoji: '💻', text: '系統相關', chip: 'cat-service', accent: 'text-violet-700' }
      : { emoji: '🧾', text: '其他支出', chip: 'cat-other',   accent: 'text-slate-700' };
    return `
      <div class="glass-record-expense p-5 mb-3 ${x.cancelled ? 'opacity-50' : ''}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-2">
              <span class="status-chip" style="background:linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%);color:white;border:0">${catMeta.emoji} ${catMeta.text}</span>
              <span class="text-base font-semibold text-slate-900" style="letter-spacing:-0.015em">${escHtml(x.name)}</span>
              ${x.label ? `<span class="category-chip ${catMeta.chip}">${escHtml(x.label)}</span>` : ''}
              ${x.recurring ? `<span class="status-chip status-deposit-paid">🔁 每月固定</span>` : ''}
            </div>
            <div class="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
              ${x.vendor ? `<span class="text-slate-500">${escHtml(x.vendor)}</span>` : ''}
              ${x.payment_method ? `<span>${escHtml(x.payment_method)}</span>` : ''}
              ${x.note ? `<span class="truncate max-w-[240px]">${escHtml(x.note)}</span>` : ''}
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="num-display text-xl text-slate-900">NT$${fmtMoney(x.amount)}${x.recurring ? '<span class="text-xs font-normal text-slate-400"> /月</span>' : ''}</div>
            <div class="text-[11px] text-slate-400 mt-1">${x.recurring ? '起始 ' : ''}${fmtDate(x.expense_date)}</div>
          </div>
        </div>
        <div class="flex justify-end gap-1.5 mt-3">
          <button data-action="edit-expense" data-id="${x.id}" class="chip-btn chip-btn-primary">編輯</button>
          <button data-action="delete-expense" data-id="${x.id}" data-name="${escHtml(x.name)}" class="chip-btn chip-btn-danger">刪除</button>
        </div>
      </div>`;
  }

  function renderIncomeCard(i) {
    const cat = INCOME_CATEGORY_LABEL[i.category] || INCOME_CATEGORY_LABEL.other;
    const splitPct = parseFloat(i.partner_split_pct ?? DEFAULT_PARTNER_SPLIT);
    const partnerShare = parseFloat(i.partner_share || 0);
    const selfShare    = parseFloat(i.self_share || 0);
    const catCls = ({
      product_sales: 'cat-product-sales',
      service:       'cat-service',
      consulting:    'cat-consulting',
      other:         'cat-other',
    })[i.category] || 'cat-other';
    const statusChip = i.received_at
      ? `<span class="status-chip status-received">✓ 入帳 ${fmtDate(i.received_at)}</span>`
      : `<span class="status-chip status-pending-inc">⏳ 待入帳</span>`;

    return `
      <div class="glass-record-income p-5 mb-3 ${i.cancelled ? 'opacity-50' : ''}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-2">
              <span class="status-chip" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:white;border:0">💰 收入</span>
              <span class="text-base font-semibold text-slate-900" style="letter-spacing:-0.015em">${escHtml(i.source_name)}</span>
              <span class="category-chip ${catCls}">${cat.emoji} ${cat.text}</span>
              ${statusChip}
              ${i.invoice_no ? `<span class="text-[11px] text-slate-400 font-mono">${escHtml(i.invoice_no)}</span>` : ''}
            </div>
            ${i.description ? `<p class="text-sm text-slate-600 line-clamp-2 mb-2 leading-relaxed">${escHtml(i.description)}</p>` : ''}
            <div class="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
              ${i.product_name ? `<span class="text-indigo-500/80">${escHtml(i.product_name)}</span>` : ''}
              ${i.payment_method ? `<span>${escHtml(i.payment_method)}</span>` : ''}
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="num-display text-xl text-emerald-700">+NT$${fmtMoney(i.amount)}</div>
            <div class="text-[11px] text-slate-400 mt-1">${fmtDate(i.income_date)}</div>
          </div>
        </div>
        <!-- 合夥人分潤拆分 -->
        <div class="mt-3 pt-3 border-t border-emerald-200/40 text-xs flex items-center justify-between flex-wrap gap-2">
          <span class="text-slate-500">🤝 合夥人分潤 <span class="text-purple-700 font-semibold">${splitPct.toFixed(0)}%</span> <span class="text-slate-300">/</span> <span class="text-indigo-700 font-semibold">${(100 - splitPct).toFixed(0)}%</span></span>
          <span class="tabular-nums flex items-center gap-2">
            <span class="text-purple-700 font-semibold">合夥人 NT$${fmtMoney(partnerShare)}</span>
            <span class="text-slate-300">·</span>
            <span class="text-indigo-700 font-semibold">你 NT$${fmtMoney(selfShare)}</span>
          </span>
        </div>
        <div class="flex justify-end gap-1.5 mt-3">
          <button data-action="edit-income" data-id="${i.id}" class="chip-btn chip-btn-success">編輯</button>
          <button data-action="delete-income" data-id="${i.id}" data-name="${escHtml(i.source_name)}" class="chip-btn chip-btn-danger">刪除</button>
        </div>
      </div>
    `;
  }

  function renderExpenseCard(o) {
      const statusClsMap = {
        pending:      'status-pending',
        deposit_paid: 'status-deposit-paid',
        completed:    'status-completed',
        cancelled:    'status-cancelled',
      };
      const statusCls = statusClsMap[o.status] || 'status-pending';
      const sl = STATUS_LABEL[o.status] || STATUS_LABEL.pending;
      const depositBadge = o.deposit_paid_at
        ? `<span class="status-chip status-completed">✓ 訂金 ${fmtDate(o.deposit_paid_at)}</span>`
        : `<span class="status-chip status-pending">⏳ 訂金待付</span>`;
      const balanceBadge = o.balance_paid_at
        ? `<span class="status-chip status-completed">✓ 尾款 ${fmtDate(o.balance_paid_at)}</span>`
        : `<span class="status-chip status-deposit-paid">⏳ 尾款待付</span>`;

      // 額外成本顯示
      const extras    = Array.isArray(o.extra_expenses) ? o.extra_expenses : [];
      const extrasSum = parseFloat(o.extra_expenses_total || 0);
      const opsAmount = parseFloat(o.operating_fee_amount || 0);
      const fundAmt   = parseFloat(o.public_fund_amount  || 0);
      const actual    = parseFloat(o.actual_total_cost   || o.total_amount || 0);
      const hasExtras = extrasSum > 0 || opsAmount > 0 || fundAmt > 0;

      const extrasBreakdown = hasExtras ? `
        <div class="mt-3 pt-3 border-t border-slate-200/60 text-xs space-y-1">
          ${extrasSum > 0 ? `<div class="flex items-center justify-between text-orange-600">
            <span>📦 其他支出 ${extras.map(e => escHtml(e.name)).join(' / ')}</span>
            <span class="num-display">+NT$${fmtMoney(extrasSum)}</span>
          </div>` : ''}
          ${opsAmount > 0 ? `<div class="flex items-center justify-between text-violet-600">
            <span>🏢 公司運營費 (${(o.operating_fee_pct != null ? parseFloat(o.operating_fee_pct) : 15).toFixed(1)}%)</span>
            <span class="num-display">+NT$${fmtMoney(opsAmount)}</span>
          </div>` : ''}
          ${fundAmt > 0 ? `<div class="flex items-center justify-between text-emerald-600">
            <span>💰 公基金</span>
            <span class="num-display">+NT$${fmtMoney(fundAmt)}</span>
          </div>` : ''}
          <div class="flex items-center justify-between pt-1.5 mt-1 border-t border-dashed border-slate-200 text-indigo-700 font-semibold">
            <span>💼 實際總成本</span>
            <span class="num-display">NT$${fmtMoney(actual)}</span>
          </div>
        </div>
      ` : '';

      return `
        <div class="glass-record-expense p-5 mb-3 ${o.cancelled ? 'opacity-50' : ''}">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-2">
                <span class="status-chip" style="background:linear-gradient(135deg,#64748b 0%,#475569 100%);color:white;border:0">💸 支出</span>
                <span class="text-base font-semibold text-slate-900" style="letter-spacing:-0.015em">${escHtml(o.supplier_name)}</span>
                <span class="status-chip ${statusCls}">${sl.text}</span>
                ${o.invoice_no ? `<span class="text-[11px] text-slate-400 font-mono">${escHtml(o.invoice_no)}</span>` : ''}
              </div>
              <p class="text-sm text-slate-600 line-clamp-2 mb-2 leading-relaxed">${escHtml(o.item_description)}</p>
              <div class="flex items-center gap-2 flex-wrap">
                ${depositBadge}
                ${balanceBadge}
                ${o.product_name ? `<span class="text-[11px] text-indigo-500/80">${escHtml(o.product_name)}</span>` : ''}
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="num-display text-xl text-slate-900">NT$${fmtMoney(o.total_amount)}</div>
              <div class="text-[11px] text-slate-400 mt-1 tabular-nums">訂金 NT$${fmtMoney(o.deposit_amount)}</div>
              <div class="text-[11px] text-slate-400 tabular-nums">尾款 NT$${fmtMoney(o.balance_amount)}</div>
              <div class="text-[11px] text-slate-400 mt-1">${fmtDate(o.order_date)}</div>
            </div>
          </div>
          ${extrasBreakdown}
          <div class="flex justify-end gap-1.5 mt-3">
            <button data-action="edit-order" data-id="${o.id}" class="chip-btn chip-btn-primary">編輯</button>
            <button data-action="delete-order" data-id="${o.id}" data-name="${escHtml(o.item_description)}" class="chip-btn chip-btn-danger">刪除</button>
          </div>
        </div>
      `;
  }

  // 月份列表 — 從 2026/01 起到當月（或最新資料月份）連續顯示
  function extractAvailableMonths(orders, incomes) {
    const months = new Set();
    const now = new Date();

    // 收集所有資料月份，順便算出最晚的月份
    const dataMonths = [];
    for (const r of incomes) {
      if (r.cancelled) continue;
      if (r.income_date) dataMonths.push(r.income_date.slice(0, 7));
      if (r.received_at) dataMonths.push(r.received_at.slice(0, 7));
    }
    for (const o of orders) {
      if (o.cancelled) continue;
      if (o.order_date)       dataMonths.push(o.order_date.slice(0, 7));
      if (o.balance_paid_at)  dataMonths.push(o.balance_paid_at.slice(0, 7));
      if (o.deposit_paid_at)  dataMonths.push(o.deposit_paid_at.slice(0, 7));
    }
    // KOL 通路月份（依開團開始日 + 支付日）
    for (const k of allKolCommissions) {
      if (k.start_date) dataMonths.push(k.start_date.slice(0, 7));
      if (k.paid_at)    dataMonths.push(k.paid_at.slice(0, 7));
    }
    // 系統/其他支出月份
    for (const x of allExpenseRecords) {
      if (!x.cancelled && x.expense_date) dataMonths.push(x.expense_date.slice(0, 7));
    }

    // 起點：2026/01；終點：當月與資料中最晚月份取大
    let cursor = new Date(2026, 0, 1);
    let endY = now.getFullYear(), endM = now.getMonth();
    for (const ym of dataMonths) {
      const [y, m] = ym.split('-').map(Number);
      if (y > endY || (y === endY && m - 1 > endM)) { endY = y; endM = m - 1; }
    }
    const end = new Date(endY, endM, 1);
    while (cursor <= end) {
      const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      months.add(ym);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    // 保護：補上 2026/01 之前的歷史資料（避免遺失）
    for (const ym of dataMonths) months.add(ym);

    return Array.from(months).sort().reverse(); // 新到舊
  }

  function renderMonthSelector(orders, incomes) {
    const wrap = document.getElementById('month-selector');
    if (!wrap) return;
    const months = extractAvailableMonths(orders, incomes);
    const activeKey = selectedMonth === 'all' ? 'all' : (selectedMonth || currentBrowserYM);

    wrap.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-slate-500 font-semibold tracking-wide">📅 檢視期間：</span>
        <div class="pill-tab-bar">
          <button data-month="all" class="month-pill pill-tab ${activeKey === 'all' ? 'active' : ''}">全部累計</button>
          ${months.map(m => `
            <button data-month="${m}" class="month-pill pill-tab ${activeKey === m ? 'active' : ''}">
              ${m.replace('-', '/')}${m === currentBrowserYM ? ' ⌃' : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    wrap.querySelectorAll('.month-pill').forEach(btn => {
      btn.onclick = () => {
        selectedMonth = btn.dataset.month;
        loadStats(allOrders, allIncomes);
      };
    });
  }

  async function loadStats(orders, incomes) {
    const container = document.getElementById('payment-stats');

    // 先渲染月份切換器
    renderMonthSelector(orders, incomes);

    // 決定要篩選的月份（'all' = 不篩選，其他 = YYYY-MM）
    const isAll = selectedMonth === 'all';
    const filterYM = isAll ? null : (selectedMonth || currentBrowserYM);
    const monthLabel = isAll ? '累計' : filterYM.replace('-', '/');
    const periodTitle = isAll ? '累計' : '本月';

    const matchYM = (dateStr) => {
      if (!dateStr || !filterYM) return false;
      return dateStr.slice(0, 7) === filterYM;
    };

    // ── 本月收入（income_date 或 received_at 任一在本月即算；累計則全收）──
    const monthIncomes = incomes.filter(i => {
      if (i.cancelled) return false;
      if (isAll) return true;
      return matchYM(i.income_date) || matchYM(i.received_at);
    });
    let monthIncomeTotal   = monthIncomes.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    let monthIncomePartner = monthIncomes.reduce((s, i) => s + parseFloat(i.partner_share || 0), 0);
    let monthIncomeSelf    = monthIncomes.reduce((s, i) => s + parseFloat(i.self_share || 0), 0);

    // ── KOL 通路本月銷售（依開團開始日）── 視為收入
    const monthKolSales = allKolCommissions.filter(k => {
      if (isAll) return true;
      return matchYM(k.start_date);
    });
    const monthKolSalesTotal = monthKolSales.reduce((s, k) => s + parseFloat(k.sales_amount || 0), 0);
    // KOL 收入預設 50/50 分潤（沒有 per-record split）
    monthIncomeTotal   += monthKolSalesTotal;
    monthIncomePartner += monthKolSalesTotal * 0.5;
    monthIncomeSelf    += monthKolSalesTotal * 0.5;

    // ── 累計收入（不分月份，所有未取消的）──
    const allIncomeRecs     = incomes.filter(i => !i.cancelled);
    const allKolSalesTotal  = allKolCommissions.reduce((s, k) => s + parseFloat(k.sales_amount || 0), 0);
    const allIncomeTotal    = allIncomeRecs.reduce((s, i) => s + parseFloat(i.amount || 0), 0) + allKolSalesTotal;
    const allIncomePartner  = allIncomeRecs.reduce((s, i) => s + parseFloat(i.partner_share || 0), 0) + allKolSalesTotal * 0.5;
    const allIncomeSelf     = allIncomeRecs.reduce((s, i) => s + parseFloat(i.self_share || 0), 0) + allKolSalesTotal * 0.5;

    // ── 本月支出（order_date 或 balance_paid_at 任一在本月即算；累計則全收）──
    const monthOrders = orders.filter(o => {
      if (o.cancelled) return false;
      if (isAll) return true;
      return matchYM(o.order_date) || matchYM(o.balance_paid_at);
    });
    let monthExpenseTotal = monthOrders.reduce((s, o) =>
      s + (parseFloat(o.actual_total_cost) || parseFloat(o.total_amount) || 0), 0);

    // ── KOL 分潤支出（已付，依 paid_at）──
    const monthKolPaid = allKolCommissions.filter(k => {
      if (!k.paid) return false;
      if (isAll) return true;
      return matchYM(k.paid_at);
    });
    const monthKolCommissionPaid = monthKolPaid.reduce((s, k) => s + parseFloat(k.commission_amount || 0), 0);
    monthExpenseTotal += monthKolCommissionPaid;

    // ── 系統/其他支出（含每月固定 recurring 邏輯）──
    //   非固定：支出月份 === 篩選月才計入
    //   每月固定：從起始月起，篩選月 >= 起始月即計入（訂閱持續中）
    const monthsBetweenYM = (a, b) => {
      const [ay, am] = a.split('-').map(Number);
      const [by, bm] = b.split('-').map(Number);
      return Math.max(0, (by - ay) * 12 + (bm - am) + 1);
    };
    const expenseInMonth = (x, ym) => {
      if (x.cancelled) return false;
      const startYM = (x.expense_date || '').slice(0, 7);
      if (!startYM) return false;
      if (x.recurring) return ym >= startYM;
      return startYM === ym;
    };
    const monthExpenseRecs = isAll
      ? allExpenseRecords.filter(x => !x.cancelled)
      : allExpenseRecords.filter(x => expenseInMonth(x, filterYM));
    const monthExpenseRecordTotal = isAll
      ? 0  // 累計另算（見下）
      : monthExpenseRecs.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
    monthExpenseTotal += monthExpenseRecordTotal;

    // ── 累計支出 ──
    const allOrdersActive = orders.filter(o => !o.cancelled);
    const allKolPaidTotal = allKolCommissions.filter(k => k.paid).reduce((s, k) => s + parseFloat(k.commission_amount || 0), 0);
    // 系統/其他累計：非固定算一次；每月固定 = 金額 × (起始月→當月 的月數)
    const allExpenseRecordTotal = allExpenseRecords
      .filter(x => !x.cancelled)
      .reduce((s, x) => {
        const amt = parseFloat(x.amount || 0);
        if (!x.recurring) return s + amt;
        const startYM = (x.expense_date || '').slice(0, 7);
        return s + amt * (startYM ? monthsBetweenYM(startYM, currentBrowserYM) : 1);
      }, 0);
    const allExpenseTotal = allOrdersActive.reduce((s, o) =>
      s + (parseFloat(o.actual_total_cost) || parseFloat(o.total_amount) || 0), 0)
      + allKolPaidTotal + allExpenseRecordTotal;
    if (isAll) monthExpenseTotal += allExpenseRecordTotal;

    // 本月淨利 + 累計淨利
    const monthNet = monthIncomeTotal - monthExpenseTotal;
    const allNet   = allIncomeTotal   - allExpenseTotal;
    const netColor    = monthNet >= 0 ? 'text-emerald-700' : 'text-rose-600';
    const netColorAll = allNet >= 0   ? 'text-emerald-600' : 'text-rose-500';

    // 待付總額（訂金 + 尾款 + KOL 未付分潤）
    const totalPendingDeposit = orders.filter(o => o.status === 'pending').reduce((s, o) => s + parseFloat(o.deposit_amount || 0), 0);
    const totalPendingBalance = orders.filter(o => o.status === 'deposit_paid').reduce((s, o) => s + parseFloat(o.balance_amount || 0), 0);
    const totalPendingKol     = allKolCommissions.filter(k => !k.paid).reduce((s, k) => s + parseFloat(k.commission_amount || 0), 0);
    const totalPending        = totalPendingDeposit + totalPendingBalance + totalPendingKol;

    // 分潤拆分（本月）
    const monthExpenseHalf = monthExpenseTotal / 2;
    const monthSelfNet     = monthIncomeSelf    - monthExpenseHalf;
    const monthPartnerNet  = monthIncomePartner - monthExpenseHalf;
    // 分潤拆分（累計）
    const allExpenseHalf   = allExpenseTotal / 2;
    const allSelfNet       = allIncomeSelf    - allExpenseHalf;
    const allPartnerNet    = allIncomePartner - allExpenseHalf;

    const netDeltaColor = monthNet >= 0 ? 'text-emerald-700' : 'text-rose-600';

    container.innerHTML = `
      <div class="glass-stat glass-stat-income">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold tracking-wide">
            <span class="text-base">💰</span>${periodTitle}收入
          </div>
          <span class="text-[10px] text-emerald-600/60 font-mono">${monthLabel}</span>
        </div>
        <div class="num-display text-2xl text-emerald-800">NT$${fmtMoney(monthIncomeTotal)}</div>
        <div class="text-[11px] text-emerald-600/70 mt-1.5">${monthIncomes.length + monthKolSales.length} 筆${monthKolSalesTotal > 0 ? `（含 KOL 通路 <span class="font-semibold text-pink-600">NT$${fmtMoney(monthKolSalesTotal)}</span>）` : ''}${isAll ? '' : ` · 累計 <span class="font-semibold">NT$${fmtMoney(allIncomeTotal)}</span>`}</div>
      </div>

      <div class="glass-stat glass-stat-expense">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-rose-700 text-xs font-semibold tracking-wide">
            <span class="text-base">💸</span>${periodTitle}支出
          </div>
          <span class="text-[10px] text-rose-600/60 font-mono">${monthLabel}</span>
        </div>
        <div class="num-display text-2xl text-rose-700">NT$${fmtMoney(monthExpenseTotal)}</div>
        <div class="text-[11px] text-rose-500/70 mt-1.5">${monthOrders.length + monthKolPaid.length + monthExpenseRecs.length} 筆${monthExpenseRecordTotal > 0 ? `（含系統/其他 <span class="font-semibold text-violet-600">NT$${fmtMoney(monthExpenseRecordTotal)}</span>）` : (monthKolCommissionPaid > 0 ? `（含 KOL 分潤 <span class="font-semibold text-pink-600">NT$${fmtMoney(monthKolCommissionPaid)}</span>）` : '')}${isAll ? '' : ` · 累計 <span class="font-semibold">NT$${fmtMoney(allExpenseTotal)}</span>`}</div>
      </div>

      <div class="glass-stat glass-stat-net">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-indigo-700 text-xs font-semibold tracking-wide">
            <span class="text-base">📊</span>${periodTitle}淨利
          </div>
          <span class="text-[10px] text-indigo-600/60 font-mono">${monthLabel}</span>
        </div>
        <div class="num-display text-2xl ${netDeltaColor}">NT$${fmtMoney(monthNet)}</div>
        <div class="text-[11px] text-indigo-500/70 mt-1.5">收入 − 支出${isAll ? '' : ` · 累計 <span class="${netColorAll} font-semibold">NT$${fmtMoney(allNet)}</span>`}</div>
      </div>

      <div class="glass-stat glass-stat-partner">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-purple-700 text-xs font-semibold tracking-wide">
            <span class="text-base">🤝</span>合夥人 / 你
          </div>
          <span class="text-[10px] text-purple-600/60 font-mono">${monthLabel}</span>
        </div>
        <div class="space-y-0.5">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-[11px] text-purple-600/80">合夥人</span>
            <span class="num-display text-sm text-purple-700">NT$${fmtMoney(monthPartnerNet)}</span>
          </div>
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-[11px] text-indigo-600/80">你</span>
            <span class="num-display text-sm text-indigo-700">NT$${fmtMoney(monthSelfNet)}</span>
          </div>
        </div>
        ${isAll ? '' : `<div class="text-[10px] text-purple-500/70 mt-1.5">累計：合夥人 <span class="font-semibold">NT$${fmtMoney(allPartnerNet)}</span> · 你 <span class="font-semibold">NT$${fmtMoney(allSelfNet)}</span></div>`}
      </div>

      ${totalPending > 0 ? `
        <div class="col-span-2 md:col-span-4 glass-warning px-4 py-2.5 text-xs text-amber-800 flex items-center justify-between flex-wrap gap-2">
          <span class="flex items-center gap-1.5">
            <span class="text-sm">⏳</span>待付款項：訂金 <span class="num-display">NT$${fmtMoney(totalPendingDeposit)}</span> + 尾款 <span class="num-display">NT$${fmtMoney(totalPendingBalance)}</span>${totalPendingKol > 0 ? ` + KOL 分潤 <span class="num-display">NT$${fmtMoney(totalPendingKol)}</span>` : ''}
          </span>
          <span class="font-bold num-display text-amber-900">= NT$${fmtMoney(totalPending)}</span>
        </div>
      ` : ''}
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
      // 並行載入支出 + 收入 + KOL 分潤 + 系統/其他支出
      const [orders, incomes, kolCommissions, expenseRecords] = await Promise.all([
        api.purchaseOrders.list(),
        api.incomeRecords.list().catch(err => {
          if (isTableMissingError(err)) {
            console.warn('income_records 表尚未建立，請執行 migration_income_records.sql');
            return [];
          }
          throw err;
        }),
        api.kolCommissions.list().catch(err => {
          if (isTableMissingError(err)) {
            console.warn('kol_commissions 表尚未建立，請執行 migration_kol.sql');
            return [];
          }
          throw err;
        }),
        api.expenseRecords.list().catch(err => {
          if (isTableMissingError(err)) {
            console.warn('expense_records 表尚未建立，請執行 migration_expense_records.sql');
            return [];
          }
          throw err;
        }),
      ]);
      allOrders  = orders;
      allIncomes = incomes;
      allKolCommissions = kolCommissions;
      allExpenseRecords = expenseRecords;
      loadStats(allOrders, allIncomes);
      renderOrders();
    } catch (err) {
      if (isTableMissingError(err)) {
        container.innerHTML = renderMigrationNotice();
        document.getElementById('payment-stats').innerHTML = `<div class="col-span-2 md:col-span-4 text-center text-xs text-gray-400 py-4">執行 migration 後即可看到統計資料</div>`;
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
// 新增支出 — 類型選擇器
// =====================================================
function showExpenseTypeChooser(onSave) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md font-apple">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">新增支出 — 選擇類型</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div class="px-6 py-5 space-y-3">
          <button data-pick="order" class="exp-pick w-full text-left glass-card-soft p-4 hover:shadow-lg transition-all flex items-center gap-3">
            <span class="text-2xl">📦</span>
            <span class="flex-1">
              <span class="block font-semibold text-slate-900">貨款記錄</span>
              <span class="block text-xs text-slate-500 mt-0.5">向供應商採購，含訂金/尾款、入庫件數</span>
            </span>
            <span class="text-slate-300">→</span>
          </button>
          <button data-pick="system" class="exp-pick w-full text-left glass-card-soft p-4 hover:shadow-lg transition-all flex items-center gap-3">
            <span class="text-2xl">💻</span>
            <span class="flex-1">
              <span class="block font-semibold text-slate-900">系統相關支出</span>
              <span class="block text-xs text-slate-500 mt-0.5">雲端、AI、軟體訂閱等（可設每月固定）</span>
            </span>
            <span class="text-slate-300">→</span>
          </button>
          <button data-pick="other" class="exp-pick w-full text-left glass-card-soft p-4 hover:shadow-lg transition-all flex items-center gap-3">
            <span class="text-2xl">🧾</span>
            <span class="flex-1">
              <span class="block font-semibold text-slate-900">其他支出</span>
              <span class="block text-xs text-slate-500 mt-0.5">行銷工具、外包、雜支等共用費用</span>
            </span>
            <span class="text-slate-300">→</span>
          </button>
        </div>
      </div>
    </div>`;
  function close() { root.innerHTML = ''; }
  document.getElementById('modal-close').onclick = close;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) close(); };
  root.querySelectorAll('.exp-pick').forEach(btn => {
    btn.onclick = () => {
      const pick = btn.dataset.pick;
      close();
      if (pick === 'order') showPurchaseOrderModal(null, onSave);
      else                  showExpenseModal(null, pick, onSave);
    };
  });
}

// =====================================================
// Modal：系統 / 其他支出
// =====================================================
const EXPENSE_LABEL_SUGGESTIONS = {
  system: ['雲端費用', 'AI 系統費用', '軟體訂閱', '網域 / 主機', '金流手續費', '簡訊 / 通訊'],
  other:  ['行銷工具', '設計外包', '辦公用品', '差旅交通', '雜支'],
};
function showExpenseModal(expense, category, onSave) {
  const isEdit = !!expense;
  const cat = expense?.category || category || 'other';
  const root = document.getElementById('modal-root');
  const meta = cat === 'system'
    ? { title: '系統相關支出', emoji: '💻', accent: 'violet' }
    : { title: '其他支出',     emoji: '🧾', accent: 'slate' };
  const suggestions = EXPENSE_LABEL_SUGGESTIONS[cat] || [];

  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto font-apple">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">${isEdit ? '編輯' : '新增'}${meta.title}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form id="exp-form" class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">子類別</label>
            <input id="e-label" type="text" list="e-label-list" value="${escHtml(expense?.label || '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="${cat === 'system' ? '例：雲端費用、AI 系統費用' : '例：行銷工具、外包'}">
            <datalist id="e-label-list">${suggestions.map(s => `<option value="${s}">`).join('')}</datalist>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">項目名稱 <span class="text-red-500">*</span></label>
            <input id="e-name" type="text" required value="${escHtml(expense?.name || '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="${cat === 'system' ? '例：AWS EC2、ChatGPT Team' : '例：Canva Pro、攝影外包'}">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">廠商</label>
              <input id="e-vendor" type="text" value="${escHtml(expense?.vendor || '')}"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="選填，例：AWS">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">金額 <span class="text-red-500">*</span></label>
              <div class="relative"><span class="absolute left-3 top-2 text-gray-400 text-sm">NT$</span>
                <input id="e-amount" type="number" min="1" step="1" required value="${expense?.amount || ''}"
                  class="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
              </div>
            </div>
          </div>
          <!-- 每月固定 -->
          <label class="flex items-start gap-2 cursor-pointer bg-violet-50 border border-violet-200 rounded-lg p-3">
            <input id="e-recurring" type="checkbox" class="w-4 h-4 mt-0.5 text-violet-600 rounded" ${expense?.recurring ? 'checked' : ''}>
            <span>
              <span class="text-sm font-medium text-violet-800">🔁 每月固定支出（訂閱）</span>
              <span class="block text-[11px] text-violet-600/80 mt-0.5">勾選後，從下方日期的月份起，每個月的支出統計都會自動算入這筆，不用每月重填</span>
            </span>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1" id="e-date-label">${expense?.recurring ? '起始月份' : '支出日期'} <span class="text-red-500">*</span></label>
              <input id="e-date" type="date" required value="${expense?.expense_date || new Date().toISOString().slice(0,10)}"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
              <select id="e-payment" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">（選填）</option>
                <option value="信用卡"   ${expense?.payment_method === '信用卡'   ? 'selected' : ''}>信用卡</option>
                <option value="銀行轉帳" ${expense?.payment_method === '銀行轉帳' ? 'selected' : ''}>銀行轉帳</option>
                <option value="現金"     ${expense?.payment_method === '現金'     ? 'selected' : ''}>現金</option>
                <option value="其他"     ${expense?.payment_method === '其他'     ? 'selected' : ''}>其他</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input id="e-note" type="text" value="${escHtml(expense?.note || '')}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" placeholder="選填">
          </div>
          ${isEdit ? `
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="e-cancelled" type="checkbox" class="w-4 h-4 text-red-600 rounded" ${expense?.cancelled ? 'checked' : ''}>
            <span class="text-sm text-gray-600">標記為已取消</span>
          </label>` : ''}
          <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
          <div class="flex gap-3 pt-2">
            <button type="button" id="modal-cancel" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            <button type="submit" id="modal-submit" class="flex-1 bg-violet-600 text-white py-2 rounded-lg hover:bg-violet-700 text-sm font-medium">儲存</button>
          </div>
        </form>
      </div>
    </div>`;

  function close() { root.innerHTML = ''; }
  document.getElementById('modal-close').onclick = close;
  document.getElementById('modal-cancel').onclick = close;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) close(); };

  // recurring toggle → 日期 label 改字
  document.getElementById('e-recurring').onchange = function() {
    document.getElementById('e-date-label').firstChild.textContent = (this.checked ? '起始月份' : '支出日期') + ' ';
  };

  document.getElementById('exp-form').onsubmit = async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('modal-submit');
    btn.disabled = true; btn.textContent = '儲存中…';
    const body = {
      category:       cat,
      label:          document.getElementById('e-label').value.trim() || null,
      name:           document.getElementById('e-name').value.trim(),
      vendor:         document.getElementById('e-vendor').value.trim() || null,
      amount:         parseFloat(document.getElementById('e-amount').value),
      expense_date:   document.getElementById('e-date').value,
      recurring:      document.getElementById('e-recurring').checked,
      payment_method: document.getElementById('e-payment').value || null,
      cancelled:      isEdit ? document.getElementById('e-cancelled').checked : false,
      note:           document.getElementById('e-note').value.trim() || null,
    };
    try {
      if (isEdit) await api.expenseRecords.update(expense.id, body);
      else        await api.expenseRecords.create(body);
      close();
      if (onSave) onSave();
      toast(isEdit ? '支出已更新' : '支出已新增');
    } catch (err) {
      errEl.textContent = err.message; errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

async function deleteExpenseRecord(id, name, onDelete) {
  const ok = await confirm(`確定要刪除「${name}」這筆支出嗎？`);
  if (!ok) return;
  try {
    await api.expenseRecords.delete(id);
    toast('已刪除');
    if (onDelete) onDelete();
  } catch (err) {
    toast(err.message, 'error');
  }
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

          <!-- 🆕 其他支出明細（運費、報關費等）-->
          <div class="border border-gray-200 rounded-lg p-3 bg-orange-50/30">
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-orange-800">📦 其他支出（運費、報關費等）</label>
              <button type="button" id="f-add-extra" class="text-xs px-2 py-1 rounded bg-orange-600 text-white hover:bg-orange-700">+ 新增</button>
            </div>
            <div id="f-extras-list" class="space-y-1.5"></div>
            <div class="mt-2 pt-2 border-t border-orange-200/60 flex justify-between text-xs text-orange-700">
              <span>其他支出小計</span>
              <span id="f-extras-total" class="font-mono font-semibold">NT$0</span>
            </div>
          </div>

          <!-- 🆕 公司運營費 % -->
          <div class="border border-gray-200 rounded-lg p-3 bg-violet-50/30">
            <label class="block text-sm font-medium text-violet-800 mb-1">🏢 公司運營費</label>
            <div class="flex items-center gap-2">
              <input id="f-ops-pct" type="number" min="0" max="100" step="0.5"
                value="${order?.operating_fee_pct ?? 15}"
                class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-right">
              <span class="text-sm text-gray-600">%</span>
              <span class="text-xs text-gray-400 ml-2">套用於（總金額 + 其他支出）</span>
              <span class="ml-auto text-sm text-violet-700 font-mono font-semibold" id="f-ops-amount">NT$0</span>
            </div>
          </div>

          <!-- 🆕 公基金 -->
          <div class="border border-gray-200 rounded-lg p-3 bg-emerald-50/30">
            <label class="block text-sm font-medium text-emerald-800 mb-1">💰 公基金（這個案子的提撥金額，選填）</label>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">NT$</span>
              <input id="f-fund" type="number" min="0" step="100"
                value="${order?.public_fund_amount ?? 0}"
                class="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0（沒有公基金時留空或填 0）">
            </div>
          </div>

          <!-- 🆕 實際採購總成本（自動計算）-->
          <div class="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-3">
            <div class="text-xs text-indigo-700 mb-1">💼 這筆採購對公司的實際總成本</div>
            <div class="text-xl font-bold text-indigo-700" id="f-actual-cost">NT$0</div>
            <div class="text-[10px] text-gray-500 mt-1" id="f-actual-cost-formula">總金額 + 其他支出 + 運營費 + 公基金</div>
          </div>

          <!-- 🆕 入庫件數（庫存）-->
          <div class="border border-gray-200 rounded-lg p-3 bg-blue-50/30">
            <label class="flex items-center gap-2 cursor-pointer mb-2">
              <input id="f-stocked-in" type="checkbox" class="w-4 h-4 text-blue-600 rounded" ${order?.stocked_in ? 'checked' : ''}>
              <span class="text-sm font-medium text-blue-800">📦 這批貨已入庫（自動增加庫存）</span>
            </label>
            <div id="f-stock-rows" class="space-y-1.5 ${order?.stocked_in ? '' : 'hidden'}">
              ${products.map(p => {
                const existing = (Array.isArray(order?.stock_items) ? order.stock_items : []).find(s => s.product_id === p.id);
                return `
                  <div class="flex items-center gap-2">
                    <span class="flex-1 text-sm text-gray-700 truncate">${escHtml(p.name)}</span>
                    <input type="number" min="0" step="1" data-pid="${p.id}" data-pname="${escHtml(p.name)}"
                      value="${existing ? existing.quantity : ''}"
                      class="f-stock-qty w-24 text-right border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0">
                    <span class="text-xs text-gray-400">件</span>
                  </div>`;
              }).join('')}
            </div>
            <p class="text-[10px] text-gray-400 mt-1.5">勾選後填入這批採購各產品的入庫件數，庫存頁會自動增加</p>
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

  // ── 其他支出清單（state） ──
  let extras = Array.isArray(order?.extra_expenses) ? [...order.extra_expenses] : [];

  function renderExtrasList() {
    const wrap = document.getElementById('f-extras-list');
    if (extras.length === 0) {
      wrap.innerHTML = '<div class="text-xs text-gray-400 italic py-1">尚未新增任何支出 — 點「+ 新增」加入運費、報關費等</div>';
    } else {
      wrap.innerHTML = extras.map((e, i) => `
        <div class="flex items-center gap-1.5">
          <input type="text" value="${escHtml(e.name || '')}" placeholder="支出項目（如：運費）"
            data-idx="${i}" data-field="name"
            class="extra-input flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400">
          <span class="text-xs text-gray-400">NT$</span>
          <input type="number" min="0" step="1" value="${e.amount || 0}" placeholder="0"
            data-idx="${i}" data-field="amount"
            class="extra-input w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-400">
          <button type="button" class="extra-del text-gray-400 hover:text-red-500 text-sm px-1" data-idx="${i}">✕</button>
        </div>
      `).join('');
      wrap.querySelectorAll('.extra-input').forEach(el => {
        el.addEventListener('input', e => {
          const idx = parseInt(e.target.dataset.idx);
          const field = e.target.dataset.field;
          if (field === 'amount') extras[idx].amount = parseFloat(e.target.value) || 0;
          else extras[idx][field] = e.target.value;
          updateAllAmounts();
        });
      });
      wrap.querySelectorAll('.extra-del').forEach(btn => {
        btn.addEventListener('click', () => {
          extras.splice(parseInt(btn.dataset.idx), 1);
          renderExtrasList();
          updateAllAmounts();
        });
      });
    }
  }

  document.getElementById('f-add-extra').onclick = () => {
    extras.push({ name: '', amount: 0 });
    renderExtrasList();
    // focus 最後一個欄位
    setTimeout(() => {
      const inputs = document.querySelectorAll('#f-extras-list .extra-input[data-field="name"]');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 0);
  };

  // 統一的金額重算
  function updateAllAmounts() {
    const total   = parseFloat(document.getElementById('f-total').value)   || 0;
    const deposit = parseFloat(document.getElementById('f-deposit').value) || 0;
    const opsPct  = parseFloat(document.getElementById('f-ops-pct').value) || 0;
    const fund    = parseFloat(document.getElementById('f-fund').value)    || 0;
    const extrasTotal = extras.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const opsAmount = (total + extrasTotal) * opsPct / 100;
    const actualCost = total + extrasTotal + opsAmount + fund;

    document.getElementById('f-balance-display').textContent = 'NT$' + fmtMoney(Math.max(0, total - deposit));
    document.getElementById('f-extras-total').textContent    = 'NT$' + fmtMoney(extrasTotal);
    document.getElementById('f-ops-amount').textContent      = 'NT$' + fmtMoney(opsAmount);
    document.getElementById('f-actual-cost').textContent     = 'NT$' + fmtMoney(actualCost);
    document.getElementById('f-actual-cost-formula').textContent =
      `${fmtMoney(total)} + ${fmtMoney(extrasTotal)} (其他) + ${fmtMoney(opsAmount)} (${opsPct}% 運營) + ${fmtMoney(fund)} (公基金) = ${fmtMoney(actualCost)}`;
  }

  document.getElementById('f-total').oninput   = updateAllAmounts;
  document.getElementById('f-deposit').oninput = updateAllAmounts;
  document.getElementById('f-ops-pct').oninput = updateAllAmounts;
  document.getElementById('f-fund').oninput    = updateAllAmounts;

  renderExtrasList();
  updateAllAmounts();

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

  // 入庫 toggle → 顯示/隱藏件數輸入
  document.getElementById('f-stocked-in').onchange = function() {
    document.getElementById('f-stock-rows').classList.toggle('hidden', !this.checked);
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

    // 過濾掉空名稱的 extras
    const cleanExtras = extras
      .filter(e => (e.name || '').trim() && parseFloat(e.amount) > 0)
      .map(e => ({ name: e.name.trim(), amount: parseFloat(e.amount) }));

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
      extra_expenses:     cleanExtras,
      operating_fee_pct:  parseFloat(document.getElementById('f-ops-pct').value) || 0,
      public_fund_amount: parseFloat(document.getElementById('f-fund').value)    || 0,
    };

    // 入庫件數
    const stockedIn = document.getElementById('f-stocked-in').checked;
    body.stocked_in = stockedIn;
    body.stock_items = stockedIn
      ? Array.from(document.querySelectorAll('.f-stock-qty'))
          .map(inp => ({ product_id: inp.dataset.pid, product_name: inp.dataset.pname, quantity: parseInt(inp.value) || 0 }))
          .filter(s => s.quantity > 0)
      : [];

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
  const ok = await confirm(`確定要刪除「${desc}」這筆支出記錄嗎？`);
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
// Modal：新增/編輯收入記錄
// =====================================================
async function showIncomeModal(income, onSave) {
  const isEdit = !!income;
  const root = document.getElementById('modal-root');

  // 預載產品清單（讓使用者選擇對應產品，選填）
  let products = [];
  try { products = await api.products.list(); } catch (_) {}

  const productOpts = `<option value="">（不關聯產品）</option>` + products.map(p =>
    `<option value="${p.id}" ${income?.product_id === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`
  ).join('');

  const cats = [
    { v: 'product_sales', t: '📦 產品銷售' },
    { v: 'service',       t: '🤝 業務合作（網站設計、外包）' },
    { v: 'consulting',    t: '💼 顧問費' },
    { v: 'other',         t: '✨ 其他收入' },
  ];
  const catOpts = cats.map(c =>
    `<option value="${c.v}" ${(income?.category || 'service') === c.v ? 'selected' : ''}>${c.t}</option>`
  ).join('');

  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">${isEdit ? '編輯收入記錄' : '新增收入記錄'}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form id="income-form" class="px-6 py-4 space-y-4">
          <!-- 收入分類 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">收入分類 <span class="text-red-500">*</span></label>
            <select id="i-category" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" required>
              ${catOpts}
            </select>
          </div>
          <!-- 來源/客戶名稱 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">來源 / 客戶名稱 <span class="text-red-500">*</span></label>
            <input id="i-source" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="例：ABC 公司網站設計案" value="${escHtml(income?.source_name || '')}" required>
          </div>
          <!-- 金額 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">收入金額 <span class="text-red-500">*</span></label>
            <div class="relative"><span class="absolute left-3 top-2 text-gray-400 text-sm">NT$</span>
              <input id="i-amount" type="number" min="1" step="1" class="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" value="${income?.amount || ''}" required>
            </div>
          </div>
          <!-- 案子日期 + 入帳日期 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">案子日期 <span class="text-red-500">*</span></label>
              <input id="i-date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" value="${income?.income_date || new Date().toISOString().slice(0,10)}" required>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">入帳日期</label>
              <input id="i-received-date" type="date" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" value="${income?.received_at || ''}" placeholder="尚未入帳則留空">
            </div>
          </div>
          <!-- 入帳狀態 -->
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input id="i-received" type="checkbox" class="w-4 h-4 text-emerald-600 rounded" ${income?.received_at ? 'checked' : ''}>
            <span class="text-gray-700">標記為已入帳（沒勾＝待入帳）</span>
          </label>
          <!-- 對應產品（選填）-->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">關聯產品（選填）</label>
            <select id="i-product" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              ${productOpts}
            </select>
          </div>
          <!-- 合夥人分潤 -->
          <div class="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <label class="block text-sm font-medium text-purple-800 mb-1">🤝 合夥人分潤 %</label>
            <div class="flex items-center gap-2">
              <input id="i-split" type="number" min="0" max="100" step="1" value="${income?.partner_split_pct ?? 50}"
                class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-right">
              <span class="text-sm text-gray-600">%（合夥人）</span>
              <span class="ml-auto text-xs text-purple-700" id="i-split-preview"></span>
            </div>
            <p class="text-[10px] text-gray-500 mt-1">這筆收入合夥人拿多少 %，剩下是你的；預設 50/50</p>
          </div>
          <!-- 發票 + 付款方式 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">發票編號</label>
              <input id="i-invoice" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="選填" value="${escHtml(income?.invoice_no || '')}">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
              <select id="i-payment" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">（選填）</option>
                <option value="bank_transfer" ${income?.payment_method === 'bank_transfer' ? 'selected' : ''}>銀行匯款</option>
                <option value="cash"          ${income?.payment_method === 'cash'          ? 'selected' : ''}>現金</option>
                <option value="check"         ${income?.payment_method === 'check'         ? 'selected' : ''}>支票</option>
                <option value="other"         ${income?.payment_method === 'other'         ? 'selected' : ''}>其他</option>
              </select>
            </div>
          </div>
          <!-- 描述 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">案子描述</label>
            <textarea id="i-desc" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" placeholder="例：5 頁形象官網 + 後台管理">${escHtml(income?.description || '')}</textarea>
          </div>
          <!-- 取消 -->
          ${isEdit ? `
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="i-cancelled" type="checkbox" class="w-4 h-4 text-red-600 rounded" ${income?.cancelled ? 'checked' : ''}>
            <span class="text-sm text-gray-600">標記為已取消</span>
          </label>` : ''}
          <!-- 錯誤 -->
          <div id="form-error" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
          <!-- 按鈕 -->
          <div class="flex gap-3 pt-2">
            <button type="button" id="modal-cancel" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            <button type="submit" id="modal-submit" class="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 text-sm font-medium">儲存</button>
          </div>
        </form>
      </div>
    </div>
  `;

  function closeModal() { root.innerHTML = ''; }
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  // 即時預覽分潤
  function updateSplitPreview() {
    const amt = parseFloat(document.getElementById('i-amount').value) || 0;
    const pct = parseFloat(document.getElementById('i-split').value)  || 0;
    const partner = amt * pct / 100;
    const self    = amt - partner;
    document.getElementById('i-split-preview').textContent =
      `合夥人 NT$${fmtMoney(partner)} | 你 NT$${fmtMoney(self)}`;
  }
  document.getElementById('i-amount').oninput = updateSplitPreview;
  document.getElementById('i-split').oninput  = updateSplitPreview;
  updateSplitPreview();

  // 已入帳 toggle 同步日期欄位
  document.getElementById('i-received').onchange = function() {
    if (this.checked && !document.getElementById('i-received-date').value) {
      document.getElementById('i-received-date').value = new Date().toISOString().slice(0,10);
    } else if (!this.checked) {
      document.getElementById('i-received-date').value = '';
    }
  };
  document.getElementById('i-received-date').onchange = function() {
    document.getElementById('i-received').checked = !!this.value;
  };

  // 表單提交
  document.getElementById('income-form').onsubmit = async e => {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.classList.add('hidden');
    const btn = document.getElementById('modal-submit');
    btn.disabled = true; btn.textContent = '儲存中…';

    const received     = document.getElementById('i-received').checked;
    const receivedDate = document.getElementById('i-received-date').value;

    const body = {
      source_name:       document.getElementById('i-source').value.trim(),
      category:          document.getElementById('i-category').value,
      product_id:        document.getElementById('i-product').value || null,
      amount:            parseFloat(document.getElementById('i-amount').value),
      income_date:       document.getElementById('i-date').value,
      received_at:       received ? (receivedDate || new Date().toISOString().slice(0,10)) : null,
      invoice_no:        document.getElementById('i-invoice').value.trim() || null,
      payment_method:    document.getElementById('i-payment').value || null,
      partner_split_pct: parseFloat(document.getElementById('i-split').value) || 0,
      description:       document.getElementById('i-desc').value.trim() || null,
      cancelled:         isEdit ? document.getElementById('i-cancelled').checked : false,
    };

    try {
      if (isEdit) {
        await api.incomeRecords.update(income.id, body);
      } else {
        await api.incomeRecords.create(body);
      }
      closeModal();
      if (onSave) onSave();
      toast(isEdit ? '收入記錄已更新' : '收入記錄已新增');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存';
    }
  };
}

async function deleteIncomeRecord(id, sourceName, onDelete) {
  const ok = await confirm(`確定要刪除「${sourceName}」這筆收入記錄嗎？`);
  if (!ok) return;
  try {
    await api.incomeRecords.delete(id);
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
