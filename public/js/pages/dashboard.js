// 頁面：總覽（只看關鍵數字，細節點進各分頁）

let _dashYM = null;      // 目前檢視月份 YYYY-MM
let _dashData = null;    // 已載入的原始資料

function _dashNowYM() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}
function _dashShiftYM(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const _dashMin = '2026-01';
const _m = n => formatMoney(Math.round(n));
const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function renderOverview() {
  const main = document.getElementById('app');
  _dashYM = _dashYM || _dashNowYM();
  main.innerHTML = `
    <div class="ambient-bg font-apple">
      <div class="max-w-5xl mx-auto px-4 py-10">
        <div class="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 class="h-display"><span class="text-accent">總覽</span></h1>
            <p class="text-slate-500 text-sm mt-1.5">只看最重要的四件事：賺多少、每個賺多少、還要付多少、庫存夠不夠</p>
          </div>
          <div class="flex items-center gap-2" id="dash-month"></div>
        </div>
        <div id="dash-body"><div class="flex justify-center py-24"><div class="spinner"></div></div></div>
      </div>
    </div>`;

  try {
    const safe = p => p.catch(() => []);
    const [products, summary, globalCosts, kolList, kols, orders, incomes, expenses, movements] = await Promise.all([
      api.products.list(),
      api.analysis.summary().catch(() => ({ products: [] })),
      safe(api.globalCosts.list()),
      safe(api.kols.list()),
      safe(api.kolCommissions.list()),
      safe(api.purchaseOrders.list()),
      safe(api.incomeRecords.list()),
      safe(api.expenseRecords.list()),
      safe(api.inventory.list()),
    ]);
    _dashData = { products, summary, globalCosts, kolList, kols, orders, incomes, expenses, movements };
    paintOverview();
  } catch (err) {
    document.getElementById('dash-body').innerHTML = window.renderLoadError(err);
  }
}

function paintOverview() {
  const d = _dashData;
  const ym = _dashYM;
  const now = _dashNowYM();

  // 月份切換
  const monthEl = document.getElementById('dash-month');
  const canPrev = ym > _dashMin, canNext = ym < now;
  monthEl.innerHTML = `
    <button class="chip-btn" id="dm-prev" ${canPrev ? '' : 'disabled style="opacity:.35"'}>‹</button>
    <span class="font-semibold text-slate-800 w-20 text-center">${ym.replace('-', '/')}</span>
    <button class="chip-btn" id="dm-next" ${canNext ? '' : 'disabled style="opacity:.35"'}>›</button>
    ${ym !== now ? `<button class="chip-btn" id="dm-now">回本月</button>` : ''}`;
  if (canPrev) document.getElementById('dm-prev').onclick = () => { _dashYM = _dashShiftYM(ym, -1); paintOverview(); };
  if (canNext) document.getElementById('dm-next').onclick = () => { _dashYM = _dashShiftYM(ym, 1); paintOverview(); };
  if (ym !== now) document.getElementById('dm-now').onclick = () => { _dashYM = now; paintOverview(); };

  document.getElementById('dash-body').innerHTML = `
    ${sectionMoney(d, ym)}
    ${sectionPending(d)}
    ${sectionUnitProfit(d)}
    ${sectionStock(d)}
  `;
}

// ── ① 這個月賺了多少 ───────────────────────────────
function sectionMoney(d, ym) {
  const cur  = computeMonthCash(d, ym);
  const prev = computeMonthCash(d, _dashShiftYM(ym, -1));
  const delta = cur.net - prev.net;
  const netCls = cur.net >= 0 ? 'text-emerald-700' : 'text-rose-600';

  const cats = Object.entries(cur.byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 0;
  const catRows = cats.length
    ? cats.map(([k, v]) => `
        <div class="flex items-center gap-3 text-sm">
          <span class="w-20 text-slate-600 truncate">${_esc(k)}</span>
          <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full bg-rose-400" style="width:${(v / maxCat * 100).toFixed(1)}%"></div></div>
          <span class="w-24 text-right num-display text-slate-700">${_m(v)}</span>
        </div>`).join('')
    : `<p class="text-sm text-slate-400">這個月還沒有支出</p>`;

  // 近 6 個月淨利
  const months = [];
  for (let i = 5; i >= 0; i--) { const m = _dashShiftYM(ym, -i); if (m >= _dashMin) months.push(m); }
  const trend = months.map(m => computeMonthCash(d, m));
  const maxAbs = Math.max(1, ...trend.map(t => Math.abs(t.net)));
  const trendBars = trend.map(t => {
    const h = Math.max(4, Math.abs(t.net) / maxAbs * 64);
    const pos = t.net >= 0;
    return `<div class="flex flex-col items-center gap-1 flex-1" title="${t.ym}：淨利 ${_m(t.net)}">
      <div class="h-16 flex items-end"><div class="w-6 rounded-md ${pos ? 'bg-emerald-400' : 'bg-rose-400'} ${t.ym === ym ? 'ring-2 ring-offset-1 ring-slate-400' : ''}" style="height:${h}px"></div></div>
      <span class="text-[10px] text-slate-400">${t.ym.slice(5)}月</span>
    </div>`;
  }).join('');

  return `
    <section class="mb-10">
      <h2 class="section-title mb-3">① 這個月賺了多少</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div class="glass-stat glass-stat-income p-5">
          <div class="text-xs text-emerald-700 font-medium">💰 收進來</div>
          <div class="num-display text-2xl text-emerald-700 mt-1">${_m(cur.income)}</div>
          <div class="text-[11px] text-emerald-700/70 mt-1">${cur.incomeKol ? `其中 KOL 團購 ${_m(cur.incomeKol)}` : '收入記錄＋KOL 團購'}</div>
        </div>
        <div class="glass-stat glass-stat-expense p-5">
          <div class="text-xs text-rose-600 font-medium">💸 花出去</div>
          <div class="num-display text-2xl text-rose-600 mt-1">${_m(cur.expense)}</div>
          <div class="text-[11px] text-rose-600/70 mt-1">貨款＋已付分潤＋各類支出</div>
        </div>
        <div class="glass-stat glass-stat-net p-5">
          <div class="text-xs text-indigo-700 font-medium">📊 淨賺（收 − 花）</div>
          <div class="num-display text-2xl ${netCls} mt-1">${_m(cur.net)}</div>
          <div class="text-[11px] text-slate-500 mt-1">比上個月 <span class="${delta >= 0 ? 'text-emerald-600' : 'text-rose-500'} font-semibold">${delta >= 0 ? '+' : ''}${_m(delta)}</span></div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="glass-card-soft p-5">
          <div class="text-xs text-slate-500 font-medium mb-3">🤝 你和合夥人各分到</div>
          <div class="flex justify-between text-sm mb-2"><span class="text-slate-600">你</span><span class="num-display ${cur.self >= 0 ? 'text-indigo-700' : 'text-rose-600'}">${_m(cur.self)}</span></div>
          <div class="flex justify-between text-sm"><span class="text-slate-600">合夥人</span><span class="num-display ${cur.partner >= 0 ? 'text-purple-700' : 'text-rose-600'}">${_m(cur.partner)}</span></div>
          <p class="text-[10px] text-slate-400 mt-3 leading-relaxed">收入依每筆設定的分潤比例拆，KOL 收入對半；支出兩人各負擔一半</p>
        </div>
        <div class="glass-card-soft p-5">
          <div class="text-xs text-slate-500 font-medium mb-3">🧾 錢花去哪了</div>
          <div class="space-y-2">${catRows}</div>
        </div>
        <div class="glass-card-soft p-5">
          <div class="text-xs text-slate-500 font-medium mb-2">📈 近幾個月淨賺</div>
          <div class="flex items-end gap-1">${trendBars}</div>
          <p class="text-[10px] text-slate-400 mt-2">綠＝賺、紅＝虧；滑過可看金額</p>
        </div>
      </div>
      <div class="text-right mt-2"><a href="#/payments" class="text-xs text-indigo-600 hover:underline">看每一筆收支 →</a></div>
    </section>`;
}

// ── ② 還要付多少錢 ────────────────────────────────
function sectionPending(d) {
  const p = computePending(d);
  const kindCls = { '訂金': 'status-pending', '尾款': 'status-deposit-paid', 'KOL 分潤': 'status-pending-inc' };
  const rows = p.items.length
    ? p.items.map(i => `
        <a href="${i.link}" class="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-white/50 rounded-lg px-2 -mx-2">
          <span class="status-chip ${kindCls[i.kind] || ''} flex-shrink-0">${i.kind}</span>
          <span class="flex-1 min-w-0 text-sm text-slate-700 truncate">${_esc(i.who)}<span class="text-slate-400"> · ${_esc(i.what)}</span></span>
          <span class="text-[11px] text-slate-400 hidden sm:inline">${i.date ? i.date.replace(/-/g, '/') : ''}</span>
          <span class="num-display text-slate-900 w-28 text-right">${_m(i.amount)}</span>
        </a>`).join('')
    : `<p class="text-sm text-slate-400 py-4 text-center">目前沒有待付款項 🎉</p>`;
  return `
    <section class="mb-10">
      <h2 class="section-title mb-3">② 還要付多少錢</h2>
      <div class="glass-card-soft p-5">
        <div class="flex items-end justify-between flex-wrap gap-2 mb-3">
          <div>
            <div class="text-xs text-slate-500">合計待付</div>
            <div class="num-display text-2xl text-amber-700">${_m(p.total)}</div>
          </div>
          <div class="text-xs text-slate-500 flex gap-3">
            <span>訂金 <b class="text-slate-700">${_m(p.deposit)}</b></span>
            <span>尾款 <b class="text-slate-700">${_m(p.balance)}</b></span>
            <span>KOL 分潤 <b class="text-slate-700">${_m(p.kol)}</b></span>
          </div>
        </div>
        <div>${rows}</div>
        <p class="text-[10px] text-slate-400 mt-2">依日期由舊到新排列，越上面越該先處理；點一下可到該筆記錄</p>
      </div>
    </section>`;
}

// ── ③ 每支／每組賺多少 ────────────────────────────
function _unitProfitRules(d) {
  const pct = d.globalCosts.filter(c => c.amount_type === 'percentage');
  const ads = pct.filter(c => c.category === 'advertising');
  const common = pct.filter(c => c.category !== 'advertising');
  const sum = arr => arr.reduce((s, c) => s + finNum(c.amount), 0);
  const kolPcts = d.kolList.map(k => finNum(k.default_commission_pct)).filter(v => v > 0);
  const kolPct = kolPcts.length ? kolPcts.reduce((a, b) => a + b, 0) / kolPcts.length : 20;
  return {
    commonPct: sum(common), commonNames: common.map(c => `${c.name} ${finNum(c.amount)}%`),
    adsPct: sum(ads), adsNames: ads.map(c => `${c.name} ${finNum(c.amount)}%`),
    kolPct,
  };
}
function _unitCell(price, cost, extraPct, label) {
  if (!price) return `<td class="px-3 py-3 text-center text-slate-300">—</td>`;
  const amt = finNum(price.selling_price ?? price.amount);
  const profit = amt - cost - amt * extraPct / 100;
  const margin = amt > 0 ? profit / amt * 100 : 0;
  const cls = margin >= 40 ? 'text-emerald-700' : margin >= 20 ? 'text-amber-700' : 'text-rose-600';
  return `<td class="px-3 py-3 text-right align-top">
    <div class="num-display ${cls}">${_m(profit)}</div>
    <div class="text-[10px] text-slate-400">${label ? _esc(label) + ' ' : ''}賣 ${_m(amt)} · ${margin.toFixed(0)}%</div>
  </td>`;
}
function sectionUnitProfit(d) {
  const r = _unitProfitRules(d);
  const costMap = Object.fromEntries(d.products.map(p => [p.id, finNum(p.total_cost)]));
  const bundleSet = new Set(d.products.filter(p => p.is_bundle).map(p => p.id));
  const rowsFor = list => list.map(sp => {
    const all = sp.all_prices || [];
    const cost = costMap[sp.product_id] ?? finNum(all[0]?.total_cost);
    const web = all.find(x => x.price_type === 'normal');
    const groups = all.filter(x => x.price_type === 'group').sort((a, b) => a.selling_price - b.selling_price);
    const kolLow = groups[0];
    const kolLabel = groups.length > 1 ? '最低團購價' : '';
    const b2b = all.find(x => x.price_type === 'custom') || all.find(x => x.price_type === 'member');
    const promo = all.find(x => x.price_type === 'promotion');
    const name = sp.product_name.replace(/^【組合】/, '');
    return `<tr class="border-t border-slate-100">
      <td class="px-3 py-3 align-top"><a href="#/product/${sp.product_id}" class="text-sm font-medium text-slate-800 hover:text-indigo-600">${_esc(name)}</a>
        <div class="text-[10px] text-slate-400">成本 ${_m(cost)}</div></td>
      ${_unitCell(web, cost, r.commonPct + r.adsPct)}
      ${_unitCell(kolLow, cost, r.commonPct + r.kolPct, kolLabel)}
      ${_unitCell(b2b, cost, r.commonPct)}
      ${_unitCell(promo, cost, r.commonPct + r.adsPct, promo ? promo.price_name : '')}
    </tr>`;
  }).join('');
  const singles = (d.summary.products || []).filter(p => !bundleSet.has(p.product_id));
  const bundles = (d.summary.products || []).filter(p => bundleSet.has(p.product_id));
  const head = t => `<tr class="bg-slate-50/60"><td colspan="5" class="px-3 py-2 text-xs font-semibold text-slate-500">${t}</td></tr>`;

  return `
    <section class="mb-10">
      <h2 class="section-title mb-3">③ 每賣一支／一組，實際賺多少</h2>
      <div class="glass-card-soft p-2 overflow-x-auto">
        <table class="w-full min-w-[680px]">
          <thead><tr class="text-xs text-slate-500">
            <th class="px-3 py-2 text-left font-medium">產品</th>
            <th class="px-3 py-2 text-right font-medium">官網賣一個</th>
            <th class="px-3 py-2 text-right font-medium">KOL 團購賣一個</th>
            <th class="px-3 py-2 text-right font-medium">企業採購賣一個</th>
            <th class="px-3 py-2 text-right font-medium">活動價（官網）</th>
          </tr></thead>
          <tbody>
            ${singles.length ? head('單品') + rowsFor(singles) : ''}
            ${bundles.length ? head('組合') + rowsFor(bundles) : ''}
          </tbody>
        </table>
      </div>
      <div class="text-[11px] text-slate-500 mt-2 leading-relaxed space-y-0.5">
        <p>怎麼算：每個賺 ＝ 售價 − 產品成本 − 依售價扣的費用。綠色毛利 ≥ 40%、黃色 20–40%、紅色 &lt; 20%。</p>
        <p>三個通路都扣：${r.commonNames.join('、') || '無'}（共 ${r.commonPct}%）。官網和活動價另扣：${r.adsNames.join('、') || '無'}（${r.adsPct}%）。KOL 團購另扣：KOL 分潤 ${r.kolPct.toFixed(0)}%。</p>
        <p>倉儲費這類每月固定的費用沒有攤進「每個賺多少」。實際付出去的錢，請在記帳新增一筆「每月固定」支出，就會出現在 ① 的支出裡。</p>
      </div>
      <div class="text-right mt-1"><a href="#/products" class="text-xs text-indigo-600 hover:underline">改售價或成本 →</a></div>
    </section>`;
}

// ── ④ 庫存還夠賣多久 ──────────────────────────────
function sectionStock(d) {
  const since = new Date(); since.setDate(since.getDate() - 90);
  const sinceStr = since.toISOString().slice(0, 10);
  const sold = {};
  for (const m of d.movements) {
    if (m.type !== 'out' || (m.movement_date || '') < sinceStr) continue;
    sold[m.product_id] = (sold[m.product_id] || 0) + Math.abs(parseInt(m.quantity) || 0);
  }
  const singles = d.products.filter(p => !p.is_bundle);
  const rows = singles.map(p => {
    const stock = p.current_stock ?? 0;
    const perMonth = (sold[p.id] || 0) / 3;
    const months = perMonth > 0 ? stock / perMonth : null;
    let tag, cls;
    if (stock <= 0)                         { tag = '缺貨';       cls = 'status-pending'; }
    else if (p.stock_status === 'low')      { tag = '低於安全庫存'; cls = 'status-deposit-paid'; }
    else if (months != null && months < 2) { tag = '快賣完了';   cls = 'status-deposit-paid'; }
    else                                    { tag = '充足';       cls = 'status-completed'; }
    const howLong = months == null
      ? '<span class="text-slate-400">近 90 天沒有出貨紀錄</span>'
      : months >= 24 ? '超過 2 年' : `約 ${months.toFixed(1)} 個月`;
    return `<tr class="border-t border-slate-100 text-sm">
      <td class="px-3 py-3 text-slate-800">${_esc(p.name)}</td>
      <td class="px-3 py-3 text-right num-display">${stock.toLocaleString()}</td>
      <td class="px-3 py-3 text-right text-slate-600">${perMonth > 0 ? Math.round(perMonth).toLocaleString() : '—'}</td>
      <td class="px-3 py-3 text-right">${howLong}</td>
      <td class="px-3 py-3 text-right"><span class="status-chip ${cls}">${tag}</span></td>
    </tr>`;
  }).join('');
  return `
    <section class="mb-6">
      <h2 class="section-title mb-3">④ 庫存還夠賣多久</h2>
      <div class="glass-card-soft p-2 overflow-x-auto">
        <table class="w-full min-w-[520px]">
          <thead><tr class="text-xs text-slate-500">
            <th class="px-3 py-2 text-left font-medium">產品</th>
            <th class="px-3 py-2 text-right font-medium">剩幾件</th>
            <th class="px-3 py-2 text-right font-medium">每月約出貨</th>
            <th class="px-3 py-2 text-right font-medium">還能賣</th>
            <th class="px-3 py-2 text-right font-medium">狀態</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="text-[11px] text-slate-500 mt-2">「每月約出貨」用近 90 天的出貨量平均，包含賣出和寄給 KOL 的樣品；KOL 開團有填件數會自動算進出貨。組合商品的庫存看裡面的單品。</p>
      <div class="text-right mt-1"><a href="#/inventory" class="text-xs text-indigo-600 hover:underline">進貨或盤點 →</a></div>
    </section>`;
}
