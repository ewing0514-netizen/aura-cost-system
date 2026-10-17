// 共用財務計算（總覽與現金財務記錄共用，確保數字一致）

function finYM(d) { return (d || '').slice(0, 7); }
function finNum(v) { return parseFloat(v || 0) || 0; }

function finMonthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return Math.max(0, (by - ay) * 12 + (bm - am) + 1);
}

// 某月現金收支（規則與現金財務記錄頁相同）
//   收入：收入記錄（income_date 或 received_at 在該月）＋ KOL 開團銷售（依開團日）
//   支出：貨款（order_date 或 balance_paid_at 在該月）＋ 已付 KOL 分潤（依付款日）＋ 系統/其他支出（含每月固定）
function computeMonthCash({ orders, incomes, kols, expenses }, ym) {
  const inMonth = d => finYM(d) === ym;

  const inc = incomes.filter(i => !i.cancelled && (inMonth(i.income_date) || inMonth(i.received_at)));
  const kolSales = kols.filter(k => inMonth(k.start_date));
  const incomeOwn = inc.reduce((s, i) => s + finNum(i.amount), 0);
  const incomeKol = kolSales.reduce((s, k) => s + finNum(k.sales_amount), 0);
  const income = incomeOwn + incomeKol;
  const partnerIncome = inc.reduce((s, i) => s + finNum(i.partner_share), 0) + incomeKol * 0.5;
  const selfIncome    = inc.reduce((s, i) => s + finNum(i.self_share), 0)    + incomeKol * 0.5;

  const ords = orders.filter(o => !o.cancelled && (inMonth(o.order_date) || inMonth(o.balance_paid_at)));
  const expOrders = ords.reduce((s, o) => s + (finNum(o.actual_total_cost) || finNum(o.total_amount)), 0);
  const expKol = kols.filter(k => k.paid && inMonth(k.paid_at)).reduce((s, k) => s + finNum(k.commission_amount), 0);
  const expRecs = expenses.filter(x => {
    if (x.cancelled) return false;
    const start = finYM(x.expense_date);
    if (!start) return false;
    return x.recurring ? ym >= start : start === ym;
  });
  const expOther = expRecs.reduce((s, x) => s + finNum(x.amount), 0);

  // 依類別彙總支出（貨款／KOL 分潤／各支出類別）
  const byCat = {};
  const add = (k, v) => { if (v) byCat[k] = (byCat[k] || 0) + v; };
  add('貨款', expOrders);
  add('KOL 分潤', expKol);
  for (const x of expRecs) {
    const c = typeof normalizeExpenseCat === 'function' ? normalizeExpenseCat(x.category) : (x.category || '其他');
    add(c, finNum(x.amount));
  }

  const expense = expOrders + expKol + expOther;
  const net = income - expense;
  return {
    ym, income, incomeOwn, incomeKol, expense, net, byCat,
    partner: partnerIncome - expense / 2,
    self:    selfIncome    - expense / 2,
  };
}

// 還沒付的錢：每張貨款單未付的訂金＋未付的尾款，加上未付 KOL 分潤
function computePending({ orders, kols }) {
  const items = [];
  for (const o of orders) {
    if (o.cancelled || o.status === 'completed' || o.status === 'cancelled') continue;
    const supplier = o.supplier_name || o.suppliers?.name || '供應商';
    const what = o.item_description || '貨款';
    if (!o.deposit_paid_at && finNum(o.deposit_amount) > 0) {
      items.push({ kind: '訂金', who: supplier, what, amount: finNum(o.deposit_amount), date: o.order_date, link: '#/payments' });
    }
    if (!o.balance_paid_at && finNum(o.balance_amount) > 0) {
      items.push({ kind: '尾款', who: supplier, what, amount: finNum(o.balance_amount), date: o.order_date, link: '#/payments' });
    }
  }
  for (const k of kols) {
    if (k.paid || finNum(k.commission_amount) <= 0) continue;
    items.push({ kind: 'KOL 分潤', who: k.kol_name || 'KOL', what: k.campaign_name || '開團', amount: finNum(k.commission_amount), date: k.end_date || k.start_date, link: '#/kols' });
  }
  items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const sum = kind => items.filter(i => i.kind === kind).reduce((s, i) => s + i.amount, 0);
  return {
    items,
    total:   items.reduce((s, i) => s + i.amount, 0),
    deposit: sum('訂金'),
    balance: sum('尾款'),
    kol:     sum('KOL 分潤'),
  };
}
