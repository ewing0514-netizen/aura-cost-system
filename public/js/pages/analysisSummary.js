// 頁面 3：損益總覽（多通路 × 全公司成本 × 活動模擬器）

// ===== Chart.js 延遲載入 =====
function loadChartJs() {
  return new Promise((resolve, reject) => {
    if (window.Chart) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ===== 情境模擬器（state） =====
//
// channelVolumes: 各產品 × 各通路的月銷量
//   { [productId]: { web: 0, kol: 0, b2b: 0, kolTierId: <group price tier id> } }
//
// campaigns: 行銷活動清單（一次性，% 抽成只扣 KOL 通路）
//   [{ id, name, type: 'percentage'|'fixed', amount, count }]
//
const _SIM = {
  channelVolumes: {},
  campaigns: [],
  data: null,
  chart: null,
};

const SIM_STORAGE_KEY = 'aura_sim_config_v3';
const SIM_LEGACY_KEY  = 'aura_sim_config_v2';

function _simLoad() {
  try {
    const raw = localStorage.getItem(SIM_STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj.channelVolumes) _SIM.channelVolumes = obj.channelVolumes;
      if (Array.isArray(obj.campaigns)) _SIM.campaigns = obj.campaigns;
      return;
    }
    // 從 v2 (volumes) 遷移：舊月銷量視為「官網」
    const legacy = localStorage.getItem(SIM_LEGACY_KEY);
    if (legacy) {
      const obj = JSON.parse(legacy);
      if (obj.volumes) {
        const cv = {};
        for (const [pid, vol] of Object.entries(obj.volumes)) {
          cv[pid] = { web: vol, kol: 0, b2b: 0, kolTierId: null };
        }
        _SIM.channelVolumes = cv;
      }
      if (Array.isArray(obj.campaigns)) _SIM.campaigns = obj.campaigns;
    }
  } catch {}
}
function _simSave() {
  try {
    localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify({
      channelVolumes: _SIM.channelVolumes,
      campaigns:      _SIM.campaigns,
    }));
  } catch {}
}

function _newCampaignId() {
  return 'cmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

// ── 通路 / 售價方案 對應 ─────────────────────────────────
function getChannelMap(product) {
  const all = product.all_prices || [];
  const findFirst = type => all.find(p => p.price_type === type);
  return {
    web:        findFirst('normal'),                                    // 官網 → 常態價
    kolOptions: all.filter(p => p.price_type === 'group'),              // KOL → 團購價（多檔可選）
    b2b:        findFirst('custom') || findFirst('member'),             // B 端 → 企業/會員價
  };
}

function ensureChannelInit(productId) {
  if (!_SIM.channelVolumes[productId]) {
    _SIM.channelVolumes[productId] = { web: 0, kol: 0, b2b: 0, kolTierId: null };
  }
  return _SIM.channelVolumes[productId];
}

// =====================================================
// 入口
// =====================================================
async function renderAnalysisSummary() {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="ambient-bg font-apple">
      <div class="max-w-6xl mx-auto px-4 py-10">
        <div class="flex items-center gap-3 mb-8">
          <button id="btn-back" class="chip-btn chip-btn-primary text-base px-3 py-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <h1 class="h-display">損益總覽</h1>
            <p class="section-subtitle">官網 / KOL 團購 / B 端採購 三通路損益分析</p>
          </div>
        </div>
        <div id="summary-content">
          <div class="flex justify-center py-12"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').onclick = () => { window.location.hash = '#/'; };

  try {
    _simLoad();

    const [result] = await Promise.all([
      api.analysis.summary(),
      loadChartJs(),
    ]);

    const { products, global_costs, stats } = result;

    if (products.length === 0) {
      document.getElementById('summary-content').innerHTML = `
        <div class="text-center py-16 text-gray-400">
          <div class="text-5xl mb-4">📊</div>
          <p class="text-lg">還沒有任何產品資料</p>
          <p class="text-sm mt-1">請先新增產品並設定售價</p>
        </div>
      `;
      return;
    }

    // 初始化各產品的通路資料
    for (const p of products) {
      const cv = ensureChannelInit(p.product_id);
      // 第一次進來：官網 100、KOL 0、B 端 0（合理預設值）
      if (cv.web === 0 && cv.kol === 0 && cv.b2b === 0) {
        cv.web = 100;
      }
      // KOL tier 預設第一個 group 方案
      if (!cv.kolTierId) {
        const map = getChannelMap(p);
        if (map.kolOptions.length > 0) cv.kolTierId = map.kolOptions[0].price_tier_id;
      }
    }
    _simSave();

    renderDashboard(products, global_costs, stats);
    bindSimulatorEvents(products, global_costs);
    recomputeAndRender(products, global_costs);

  } catch (err) {
    document.getElementById('summary-content').innerHTML =
      window.renderLoadError(err);
  }
}

// =====================================================
// 計算引擎（多通路）
// =====================================================
function computeScenario(products, global_costs) {
  const mPctRate = (global_costs?.marketing?.percentage_total  || 0) / 100;
  const oPctRate = (global_costs?.operations?.percentage_total || 0) / 100;
  const mFixed   = global_costs?.marketing?.fixed_total  || 0;
  const oFixed   = global_costs?.operations?.fixed_total || 0;

  // 活動：% 抽成 → 只扣 KOL 通路的營收；NT$ 固定 → 一次性
  let adhocPctRate    = 0;
  let adhocFixedTotal = 0;
  for (const c of (_SIM.campaigns || [])) {
    const amount = parseFloat(c.amount) || 0;
    const count  = Math.max(1, parseInt(c.count) || 1);
    const total  = amount * count;
    if (c.type === 'percentage') adhocPctRate    += total / 100;
    else                          adhocFixedTotal += total;
  }

  // 通路彙總
  const channelTotals = {
    web: { rev: 0, cost: 0, vol: 0 },
    kol: { rev: 0, cost: 0, vol: 0 },
    b2b: { rev: 0, cost: 0, vol: 0 },
  };

  const productRows = products.map(p => {
    const cv = ensureChannelInit(p.product_id);
    const map = getChannelMap(p);
    const kolTier = map.kolOptions.find(t => t.price_tier_id === cv.kolTierId) || map.kolOptions[0] || null;

    const ch = {
      web: { tier: map.web,  qty: cv.web || 0 },
      kol: { tier: kolTier,  qty: cv.kol || 0 },
      b2b: { tier: map.b2b,  qty: cv.b2b || 0 },
    };

    let pRev = 0, pCost = 0, pVol = 0;
    for (const key of ['web','kol','b2b']) {
      const t = ch[key].tier;
      const q = ch[key].qty;
      if (!t || q <= 0) continue;
      const rev  = parseFloat(t.selling_price) * q;
      const cost = parseFloat(t.total_cost) * q;
      pRev  += rev;
      pCost += cost;
      pVol  += q;
      channelTotals[key].rev  += rev;
      channelTotals[key].cost += cost;
      channelTotals[key].vol  += q;
    }

    // 平均售價（用於 margin %）
    const avgPrice = pVol > 0 ? pRev / pVol : 0;
    const profitGross = pRev - pCost;
    const grossMarginPct = pRev > 0 ? (profitGross / pRev * 100) : null;

    return {
      product_id:        p.product_id,
      product_name:      p.product_name,
      volume:            pVol,
      revenue:           pRev,
      cost:              pCost,
      avg_price:         avgPrice,
      gross_profit:      profitGross,
      gross_margin_pct:  grossMarginPct,
      // 通路明細（供 detail / breakdown）
      channels: {
        web: { tier: ch.web.tier, qty: ch.web.qty, rev: (ch.web.tier ? parseFloat(ch.web.tier.selling_price) * ch.web.qty : 0), cost: (ch.web.tier ? parseFloat(ch.web.tier.total_cost) * ch.web.qty : 0) },
        kol: { tier: ch.kol.tier, qty: ch.kol.qty, rev: (ch.kol.tier ? parseFloat(ch.kol.tier.selling_price) * ch.kol.qty : 0), cost: (ch.kol.tier ? parseFloat(ch.kol.tier.total_cost) * ch.kol.qty : 0), options: map.kolOptions },
        b2b: { tier: ch.b2b.tier, qty: ch.b2b.qty, rev: (ch.b2b.tier ? parseFloat(ch.b2b.tier.selling_price) * ch.b2b.qty : 0), cost: (ch.b2b.tier ? parseFloat(ch.b2b.tier.total_cost) * ch.b2b.qty : 0) },
      },
    };
  });

  const monthlyRevenue     = productRows.reduce((s, r) => s + r.revenue, 0);
  const monthlyProductCost = productRows.reduce((s, r) => s + r.cost,    0);
  const totalVolume        = productRows.reduce((s, r) => s + r.volume,  0);

  const grossProfitTotal = monthlyRevenue - monthlyProductCost;

  // 行銷成本：
  //   公司行銷 % × 全營收
  //   公司行銷固定
  //   活動 % × KOL 營收（僅 KOL 通路抽成）
  //   活動固定
  const marketingPctTotal   = monthlyRevenue * mPctRate;
  const adhocPctTotal       = channelTotals.kol.rev * adhocPctRate;
  const marketingFixedTotal = mFixed;
  const totalMarketingDeduction =
    marketingPctTotal + marketingFixedTotal + adhocPctTotal + adhocFixedTotal;

  // 營運成本：% × 全營收 + 固定
  const operationsPctTotal       = monthlyRevenue * oPctRate;
  const operationsFixedTotal     = oFixed;
  const totalOperationsDeduction = operationsPctTotal + operationsFixedTotal;

  const afterMarketingTotal = grossProfitTotal     - totalMarketingDeduction;
  const netProfitTotal      = afterMarketingTotal  - totalOperationsDeduction;

  const grossMarginPct    = monthlyRevenue > 0 ? (grossProfitTotal    / monthlyRevenue * 100) : null;
  const afterMktMarginPct = monthlyRevenue > 0 ? (afterMarketingTotal / monthlyRevenue * 100) : null;
  const netMarginPct      = monthlyRevenue > 0 ? (netProfitTotal      / monthlyRevenue * 100) : null;

  // 通路毛利率（用 tier-level data 計算，僅產品成本層）
  for (const k of ['web','kol','b2b']) {
    const c = channelTotals[k];
    c.gross = c.rev - c.cost;
    c.gross_margin_pct = c.rev > 0 ? (c.gross / c.rev * 100) : null;
  }

  // 為產品 row 算每件淨利（用全公司成本攤提）
  const fixedAlloc = totalVolume > 0
    ? (marketingFixedTotal + adhocFixedTotal + operationsFixedTotal) / totalVolume
    : 0;
  productRows.forEach(r => {
    if (r.revenue > 0 && r.volume > 0) {
      // 該產品分擔的全公司 % 成本（按其營收佔比攤提，較精確）
      const revShare = monthlyRevenue > 0 ? (r.revenue / monthlyRevenue) : 0;
      const mktPctAlloc = (marketingPctTotal + adhocPctTotal) * revShare;
      // 注意：adhocPctTotal 只來自 KOL 營收，但攤到該產品的全部營收 — 為了顯示簡化，這裡用整體攤提
      const opsPctAlloc = operationsPctTotal * revShare;
      r.net_profit = r.gross_profit
        - mktPctAlloc - r.volume * (marketingFixedTotal + adhocFixedTotal) / Math.max(totalVolume, 1)
        - opsPctAlloc - r.volume * operationsFixedTotal / Math.max(totalVolume, 1);
      // 等同於：r.net_profit = r.gross_profit - revShare*(mktPct+adhocPct+opsPct) - volShare*(allFixed)
      r.net_margin_pct = r.revenue > 0 ? (r.net_profit / r.revenue * 100) : null;
      // 也算個 after_marketing 利潤率給 chart 用
      r.after_mkt_profit = r.gross_profit - mktPctAlloc - r.volume * (marketingFixedTotal + adhocFixedTotal) / Math.max(totalVolume, 1);
      r.after_mkt_margin_pct = r.revenue > 0 ? (r.after_mkt_profit / r.revenue * 100) : null;
    } else {
      r.net_profit = null;
      r.net_margin_pct = null;
      r.after_mkt_profit = null;
      r.after_mkt_margin_pct = null;
    }
  });

  return {
    productRows,
    channelTotals,
    monthlyRevenue,
    monthlyProductCost,
    totalVolume,

    grossProfitTotal,
    marketingPctTotal,
    marketingFixedTotal,
    adhocPctTotal,
    adhocFixedTotal,
    totalMarketingDeduction,

    operationsPctTotal,
    operationsFixedTotal,
    totalOperationsDeduction,

    afterMarketingTotal,
    netProfitTotal,

    grossMarginPct,
    afterMktMarginPct,
    netMarginPct,

    rates: { mPctRate, oPctRate, mFixed, oFixed, adhocPctRate, adhocFixedTotal },
  };
}

// =====================================================
// 渲染主面板
// =====================================================
function renderDashboard(products, global_costs, stats) {
  const c = document.getElementById('summary-content');
  const avgColor = stats.avgMargin == null ? 'text-gray-500'
    : stats.avgMargin >= 30 ? 'text-emerald-600'
    : stats.avgMargin >= 10 ? 'text-amber-600'
    : 'text-red-500';

  c.innerHTML = `
    <!-- ① 產品毛利層 -->
    <div class="mb-4 flex items-center gap-2">
      <span class="status-chip" style="background:rgba(148,163,184,0.15);color:#475569;border-color:rgba(148,163,184,0.3)">Layer 1</span>
      <h2 class="text-sm font-semibold text-slate-700">產品毛利層（不含全公司成本）</h2>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      <div class="glass-stat">
        <div class="text-xs text-slate-500 font-semibold tracking-wide mb-1.5">產品總數</div>
        <div class="num-display text-2xl text-slate-900">${stats.total}</div>
        <div class="text-[11px] text-slate-400 mt-1.5">種產品</div>
      </div>
      <div class="glass-stat">
        <div class="text-xs text-slate-500 font-semibold tracking-wide mb-1.5">平均最佳利潤率</div>
        <div class="num-display text-2xl ${avgColor}">${stats.avgMargin != null ? formatPct(stats.avgMargin) : '-'}</div>
        <div class="text-[11px] text-slate-400 mt-1.5">跨所有產品</div>
      </div>
      <div class="glass-stat glass-stat-income">
        <div class="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold tracking-wide mb-1.5">
          <span class="text-base">🟢</span>高利潤率
        </div>
        <div class="num-display text-2xl text-emerald-700">${stats.highCount}</div>
        <div class="text-[11px] text-emerald-500/70 mt-1.5">≥ 30%</div>
      </div>
      <div class="glass-stat ${stats.lowCount > 0 ? 'glass-stat-expense' : ''}">
        <div class="flex items-center gap-1.5 ${stats.lowCount > 0 ? 'text-rose-700' : 'text-slate-500'} text-xs font-semibold tracking-wide mb-1.5">
          <span class="text-base">${stats.lowCount > 0 ? '🔴' : '✅'}</span>${stats.lowCount > 0 ? '需關注' : '全部健康'}
        </div>
        <div class="num-display text-2xl ${stats.lowCount > 0 ? 'text-rose-600' : 'text-slate-400'}">${stats.lowCount}</div>
        <div class="text-[11px] text-slate-400 mt-1.5">低於 10%</div>
      </div>
    </div>

    <!-- ② 情境模擬器 -->
    <div class="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-5 mb-6">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-0.5 rounded-full bg-indigo-600 text-white font-medium">情境模擬</span>
          <h2 class="text-sm font-semibold text-gray-800">🧪 三通路配貨 + 行銷活動模擬</h2>
        </div>
        <button id="btn-sim-reset" class="text-xs text-indigo-600 hover:text-indigo-800 underline">重設預設值</button>
      </div>

      <p class="text-xs text-gray-500 mb-4 leading-relaxed">
        💡 <strong>官網</strong>用「常態價」、<strong>KOL 團購</strong>用「開團價」(可選 1入/2入/4入)、<strong>B 端採購</strong>用「企業採購價」。
        全公司行銷成本（廣告等）攤到所有營收；活動 %（KOL 抽成）<strong>只扣 KOL 通路</strong>的營收，不會誤扣官網或 B 端。
      </p>

      <!-- 各產品 × 各通路銷量 -->
      <div class="bg-white/70 rounded-lg p-3 mb-4">
        <div class="grid grid-cols-[minmax(120px,1.4fr)_1fr_1fr_1fr] gap-2 text-xs font-medium text-gray-500 mb-2 px-1">
          <span>產品</span>
          <span class="text-center text-blue-700">🌐 官網</span>
          <span class="text-center text-pink-700">📣 KOL 團購</span>
          <span class="text-center text-emerald-700">🏢 B 端採購</span>
        </div>
        <div id="sim-channel-rows" class="space-y-2"></div>

        <div class="mt-3 flex items-center gap-2 text-xs flex-wrap">
          <span class="text-gray-500">快速套用：</span>
          <button data-preset="web100" class="ch-preset px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50">官網全部 100 件</button>
          <button data-preset="kol50"  class="ch-preset px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50">KOL 全部 50 件</button>
          <button data-preset="balanced" class="ch-preset px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50">三通路平均 50 件</button>
          <button data-preset="zero"   class="ch-preset px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50">全部歸零</button>
        </div>
      </div>

      <!-- 行銷活動清單 -->
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-2">🎯 額外行銷活動清單（這個月一次性 — % 抽成只扣 KOL 通路）</label>
        <div id="sim-campaigns" class="space-y-2"></div>

        <div class="mt-2 flex items-center gap-1.5 text-xs flex-wrap">
          <button id="btn-add-campaign" class="px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 font-medium">+ 新增活動</button>
          <button data-preset="kol20" class="preset-btn px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50">+ 1 個 20% KOL</button>
          <button data-preset="kol25" class="preset-btn px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50">+ 1 個 25% KOL</button>
          <button data-preset="ad5k"  class="preset-btn px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50">+ FB 廣告 NT$5,000</button>
        </div>
        <p class="text-xs text-gray-400 mt-1.5">
          💡 KOL 抽成 % 會自動只扣 <strong>KOL 通路</strong> 的營收（例如 20% × KOL 營收 NT$10,000 = -NT$2,000）；NT$ 固定費用按全部銷量分攤
        </p>
      </div>
    </div>

    <!-- ③ 損益瀑布 -->
    <div id="sim-result-block"></div>

    <!-- ④ 通路明細 -->
    <div id="channel-summary-block"></div>

    <!-- ⑤ 詳細計算過程 -->
    <details class="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
      <summary class="px-5 py-3 cursor-pointer hover:bg-gray-50 select-none flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-gray-800">📋 詳細計算過程</span>
          <span class="text-xs text-gray-400">— 教你看懂每個數字怎麼來的</span>
        </div>
        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </summary>
      <div id="breakdown-content" class="px-5 pb-5 pt-2 text-sm"></div>
    </details>

    <!-- ⑥ 利潤率分層比較圖 -->
    <div class="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 class="text-sm font-semibold text-gray-700">📊 各產品利潤率分層比較</h3>
        <div class="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500"></span>毛利率</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm inline-block bg-pink-500"></span>含行銷</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm inline-block bg-indigo-500"></span>淨利率</span>
        </div>
      </div>
      <canvas id="overview-chart" height="80"></canvas>
    </div>

    <!-- ⑦ 損益明細表 -->
    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
      <div class="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-700">產品損益明細（多通路加總）</h3>
        <span class="text-xs text-gray-400">按淨利率排序</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" id="detail-table">
          <thead class="text-gray-500 text-xs uppercase bg-gray-50">
            <tr>
              <th class="text-left px-3 py-3 font-medium">產品</th>
              <th class="text-right px-3 py-3 font-medium">營收</th>
              <th class="text-right px-3 py-3 font-medium">總銷量</th>
              <th class="text-right px-3 py-3 font-medium text-blue-600">官網</th>
              <th class="text-right px-3 py-3 font-medium text-pink-600">KOL</th>
              <th class="text-right px-3 py-3 font-medium text-emerald-600">B 端</th>
              <th class="text-right px-3 py-3 font-medium text-emerald-700">毛利率</th>
              <th class="text-right px-3 py-3 font-medium text-indigo-700">淨利率</th>
              <th class="text-right px-3 py-3 font-medium">月淨利</th>
            </tr>
          </thead>
          <tbody id="detail-tbody" class="divide-y divide-gray-100"></tbody>
        </table>
      </div>
    </div>

    <!-- ⑧ 全公司成本明細 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      ${renderGlobalCostBlock('行銷成本', global_costs.marketing, '📣', 'pink')}
      ${renderGlobalCostBlock('營運成本', global_costs.operations, '🏢', 'violet')}
    </div>
  `;

  renderChannelInputs(products);
  renderCampaignList();
}

// ── 各產品 × 各通路銷量輸入列 ─────────────────────────
function renderChannelInputs(products) {
  const wrap = document.getElementById('sim-channel-rows');
  if (!wrap) return;

  wrap.innerHTML = products.map(p => {
    const cv = ensureChannelInit(p.product_id);
    const map = getChannelMap(p);
    const webPrice = map.web ? map.web.selling_price : null;
    const b2bPrice = map.b2b ? map.b2b.selling_price : null;
    const kolTier  = map.kolOptions.find(t => t.price_tier_id === cv.kolTierId) || map.kolOptions[0] || null;

    return `
      <div class="grid grid-cols-[minmax(120px,1.4fr)_1fr_1fr_1fr] gap-2 items-start bg-white rounded-md p-2 border border-gray-100" data-pid="${p.product_id}">
        <div class="text-sm text-gray-700 truncate self-center" title="${escapeHtml(p.product_name)}">
          ${escapeHtml(p.product_name)}
        </div>

        <!-- 官網 -->
        <div>
          <input type="number" min="0" step="1" value="${cv.web || 0}"
            data-pid="${p.product_id}" data-channel="web"
            class="ch-vol-input w-full text-right border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${webPrice == null ? 'opacity-40' : ''}"
            ${webPrice == null ? 'disabled' : ''}>
          <div class="text-[10px] text-gray-400 mt-0.5 truncate text-center">
            ${webPrice != null ? formatMoney(webPrice) : '無常態價'}
          </div>
        </div>

        <!-- KOL -->
        <div>
          <input type="number" min="0" step="1" value="${cv.kol || 0}"
            data-pid="${p.product_id}" data-channel="kol"
            class="ch-vol-input w-full text-right border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-pink-400 ${map.kolOptions.length === 0 ? 'opacity-40' : ''}"
            ${map.kolOptions.length === 0 ? 'disabled' : ''}>
          <div class="text-[10px] mt-0.5 text-center">
            ${map.kolOptions.length === 0 ? '<span class="text-gray-400">無團購價</span>' :
              `<select data-pid="${p.product_id}" class="kol-tier-select text-[10px] border border-gray-200 rounded px-1 py-0.5 max-w-full">
                ${map.kolOptions.map(t => `
                  <option value="${t.price_tier_id}" ${t.price_tier_id === (kolTier ? kolTier.price_tier_id : '') ? 'selected' : ''}>
                    ${escapeHtml(t.price_name)} ${formatMoney(t.selling_price)}
                  </option>
                `).join('')}
              </select>`
            }
          </div>
        </div>

        <!-- B 端 -->
        <div>
          <input type="number" min="0" step="1" value="${cv.b2b || 0}"
            data-pid="${p.product_id}" data-channel="b2b"
            class="ch-vol-input w-full text-right border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400 ${b2bPrice == null ? 'opacity-40' : ''}"
            ${b2bPrice == null ? 'disabled' : ''}>
          <div class="text-[10px] text-gray-400 mt-0.5 truncate text-center">
            ${b2bPrice != null ? formatMoney(b2bPrice) : '無企業價'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderGlobalCostBlock(title, group, icon, color) {
  const colorMap = {
    pink:   { bg: 'bg-pink-50/60',   border: 'border-pink-100',   text: 'text-pink-700' },
    violet: { bg: 'bg-violet-50/60', border: 'border-violet-100', text: 'text-violet-700' },
  };
  const cls = colorMap[color] || colorMap.pink;

  if (!group.items || group.items.length === 0) {
    return `
      <div class="border ${cls.border} rounded-xl ${cls.bg} p-4">
        <div class="flex items-center gap-2 mb-2">
          <span>${icon}</span>
          <h4 class="font-semibold text-sm ${cls.text}">${title}</h4>
        </div>
        <p class="text-xs text-gray-400">尚未設定任何${title}項目</p>
      </div>
    `;
  }

  return `
    <div class="border ${cls.border} rounded-xl ${cls.bg} p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span>${icon}</span>
          <h4 class="font-semibold text-sm ${cls.text}">${title}</h4>
        </div>
        <span class="text-xs ${cls.text} font-mono">
          ${formatMoney(group.fixed_total)}${group.percentage_total > 0 ? ` + ${group.percentage_total.toFixed(2)}%` : ''}
        </span>
      </div>
      <ul class="space-y-1.5">
        ${group.items.map(it => `
          <li class="flex items-center justify-between text-xs">
            <div class="flex-1 truncate">
              <span class="text-gray-700">${escapeHtml(it.name)}</span>
              <span class="text-gray-400 ml-1">${escapeHtml(it.display_category || categoryLabel(it.category))}</span>
            </div>
            <span class="font-mono ${cls.text} ml-2">
              ${it.amount_type === 'percentage' ? parseFloat(it.amount).toFixed(2) + '%' : formatMoney(it.amount)}
            </span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

// ── 行銷活動清單 ─────────────────────────────────────────
function renderCampaignList() {
  const wrap = document.getElementById('sim-campaigns');
  if (!wrap) return;

  if (_SIM.campaigns.length === 0) {
    wrap.innerHTML = `
      <div class="text-center text-xs text-gray-400 py-3 bg-white/50 rounded-lg border border-dashed border-gray-300">
        尚未新增任何活動 — 點下方按鈕新增，或使用預設範本
      </div>
    `;
    return;
  }

  wrap.innerHTML = _SIM.campaigns.map(c => {
    const amount = parseFloat(c.amount) || 0;
    const count  = Math.max(1, parseInt(c.count) || 1);
    const total  = amount * count;
    const totalLabel = c.type === 'percentage'
      ? `${total.toFixed(2)}% × KOL 營收`
      : formatMoney(total);

    return `
      <div class="bg-white rounded-lg p-2.5 border border-gray-200" data-cid="${c.id}">
        <div class="flex items-center gap-1.5 mb-1.5">
          <input type="text" value="${escapeHtml(c.name || '')}" placeholder="活動名稱"
            data-cid="${c.id}" data-field="name"
            class="campaign-input flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400">
          <button class="campaign-del text-gray-400 hover:text-red-500 text-sm px-1" data-cid="${c.id}" title="刪除">✕</button>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <select data-cid="${c.id}" data-field="type"
            class="campaign-input text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
            <option value="percentage" ${c.type === 'percentage' ? 'selected' : ''}>% 抽成 (KOL)</option>
            <option value="fixed"      ${c.type === 'fixed'      ? 'selected' : ''}>NT$ 固定</option>
          </select>
          <input type="number" min="0" step="${c.type === 'percentage' ? '0.5' : '100'}"
            value="${c.amount}" placeholder="金額"
            data-cid="${c.id}" data-field="amount"
            class="campaign-input w-20 text-right text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400">
          <span class="text-xs text-gray-400">×</span>
          <input type="number" min="1" step="1" value="${count}"
            data-cid="${c.id}" data-field="count"
            class="campaign-input w-14 text-right text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400">
          <span class="text-xs text-gray-400">個 =</span>
          <span class="text-xs font-mono text-indigo-700 font-semibold">${totalLabel}</span>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('.campaign-input').forEach(el => {
    el.addEventListener('input', onCampaignInput);
    el.addEventListener('change', onCampaignInput);
  });
  wrap.querySelectorAll('.campaign-del').forEach(btn => {
    btn.addEventListener('click', () => {
      _SIM.campaigns = _SIM.campaigns.filter(x => x.id !== btn.dataset.cid);
      _simSave();
      renderCampaignList();
      window._renderTrigger && window._renderTrigger();
    });
  });
}

function onCampaignInput(e) {
  const el = e.target;
  const camp = _SIM.campaigns.find(c => c.id === el.dataset.cid);
  if (!camp) return;
  const field = el.dataset.field;
  if (field === 'name')        camp.name   = el.value;
  else if (field === 'type')   camp.type   = el.value;
  else if (field === 'amount') camp.amount = parseFloat(el.value) || 0;
  else if (field === 'count')  camp.count  = Math.max(1, parseInt(el.value) || 1);
  _simSave();
  renderCampaignList();
  window._renderTrigger && window._renderTrigger();
}

// =====================================================
// 事件綁定
// =====================================================
function bindSimulatorEvents(products, global_costs) {
  window._renderTrigger = () => recomputeAndRender(products, global_costs);

  // 通路銷量輸入
  document.addEventListener('input', e => {
    const inp = e.target.closest('.ch-vol-input');
    if (!inp) return;
    const pid = inp.dataset.pid;
    const channel = inp.dataset.channel;
    const cv = ensureChannelInit(pid);
    cv[channel] = Math.max(0, parseInt(inp.value) || 0);
    _simSave();
    window._renderTrigger();
  });

  // KOL 方案切換
  document.addEventListener('change', e => {
    const sel = e.target.closest('.kol-tier-select');
    if (!sel) return;
    const pid = sel.dataset.pid;
    const cv = ensureChannelInit(pid);
    cv.kolTierId = sel.value;
    _simSave();
    window._renderTrigger();
  });

  // 通路快速套用
  document.querySelectorAll('.ch-preset').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.dataset.preset;
      for (const p of products) {
        const cv = ensureChannelInit(p.product_id);
        if (preset === 'web100')   { cv.web = 100; cv.kol = 0;  cv.b2b = 0; }
        if (preset === 'kol50')    { cv.web = 0;   cv.kol = 50; cv.b2b = 0; }
        if (preset === 'balanced') { cv.web = 50;  cv.kol = 50; cv.b2b = 50; }
        if (preset === 'zero')     { cv.web = 0;   cv.kol = 0;  cv.b2b = 0; }
      }
      _simSave();
      renderChannelInputs(products);
      window._renderTrigger();
    };
  });

  // 重設整個情境
  document.getElementById('btn-sim-reset').onclick = () => {
    for (const p of products) {
      const map = getChannelMap(p);
      _SIM.channelVolumes[p.product_id] = {
        web: 100, kol: 0, b2b: 0,
        kolTierId: map.kolOptions[0]?.price_tier_id || null,
      };
    }
    _SIM.campaigns = [];
    _simSave();
    renderChannelInputs(products);
    renderCampaignList();
    window._renderTrigger();
  };

  // 新增活動
  document.getElementById('btn-add-campaign').onclick = () => {
    _SIM.campaigns.push({ id: _newCampaignId(), name: '', type: 'percentage', amount: 20, count: 1 });
    _simSave();
    renderCampaignList();
    window._renderTrigger();
  };

  // 預設範本按鈕
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.dataset.preset;
      let camp = null;
      if (preset === 'kol20') camp = { id: _newCampaignId(), name: 'KOL 開團分潤', type: 'percentage', amount: 20, count: 1 };
      if (preset === 'kol25') camp = { id: _newCampaignId(), name: 'KOL 開團分潤', type: 'percentage', amount: 25, count: 1 };
      if (preset === 'ad5k')  camp = { id: _newCampaignId(), name: 'FB 廣告檔次',  type: 'fixed',      amount: 5000, count: 1 };
      if (camp) {
        _SIM.campaigns.push(camp);
        _simSave();
        renderCampaignList();
        window._renderTrigger();
      }
    };
  });
}

// =====================================================
// 重算 + 重繪
// =====================================================
function recomputeAndRender(products, global_costs) {
  const data = computeScenario(products, global_costs);
  _SIM.data = data;

  renderWaterfall(data);
  renderChannelSummary(data);
  renderBreakdown(data, products, global_costs);
  renderComparisonChart(data);
  renderDetailTable(data);
}

// ── 損益瀑布（4 張卡）──────────────────────────────────
function renderWaterfall(data) {
  const block = document.getElementById('sim-result-block');
  const netColor = data.netMarginPct == null ? 'text-gray-500'
    : data.netMarginPct >= 20 ? 'text-emerald-600'
    : data.netMarginPct >= 5  ? 'text-amber-600'
    : 'text-red-500';

  const companyMktTotal = data.marketingPctTotal + data.marketingFixedTotal;
  const adhocTotal      = data.adhocPctTotal + data.adhocFixedTotal;

  block.innerHTML = `
    <div class="mb-3 flex items-center gap-2">
      <span class="text-xs px-2 py-0.5 rounded-full bg-indigo-600 text-white font-medium">月度預估</span>
      <h2 class="text-sm font-semibold text-gray-700">📈 全公司損益瀑布（依目前情境設定）</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
      <div class="bg-white border-2 border-gray-200 rounded-xl p-4">
        <div class="text-xs text-gray-500 mb-1">月營收</div>
        <div class="text-xl font-bold text-gray-900">${formatMoney(data.monthlyRevenue)}</div>
        <div class="text-xs text-gray-400 mt-0.5">${data.totalVolume} 件（多通路加總）</div>
      </div>

      <div class="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
        <div class="text-xs text-emerald-700 mb-1">① 產品毛利</div>
        <div class="text-xl font-bold text-emerald-600">${formatMoney(data.grossProfitTotal)}</div>
        <div class="text-xs text-emerald-500 mt-0.5">毛利率 ${data.grossMarginPct != null ? formatPct(data.grossMarginPct) : '-'}</div>
        <div class="text-[10px] text-gray-400 mt-1">扣產品成本 -${formatMoney(data.monthlyProductCost)}</div>
      </div>

      <div class="bg-pink-50 border-2 border-pink-200 rounded-xl p-4">
        <div class="text-xs text-pink-700 mb-1">② 含行銷後 <span class="text-pink-400">（公司+活動）</span></div>
        <div class="text-xl font-bold text-pink-600">${formatMoney(data.afterMarketingTotal)}</div>
        <div class="text-xs text-pink-500 mt-0.5">利潤率 ${data.afterMktMarginPct != null ? formatPct(data.afterMktMarginPct) : '-'}</div>
        <div class="text-[10px] text-gray-500 mt-1 leading-relaxed">
          扣 -${formatMoney(data.totalMarketingDeduction)}<br>
          <span class="text-gray-400">公司 -${formatMoney(companyMktTotal)}${adhocTotal > 0 ? ` + 活動 -${formatMoney(adhocTotal)}` : ''}</span>
        </div>
      </div>

      <div class="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-xl p-4">
        <div class="text-xs text-indigo-700 mb-1 font-semibold">💰 月度淨利</div>
        <div class="text-2xl font-bold ${netColor}">${formatMoney(data.netProfitTotal)}</div>
        <div class="text-xs ${netColor} mt-0.5 font-semibold">淨利率 ${data.netMarginPct != null ? formatPct(data.netMarginPct) : '-'}</div>
        <div class="text-[10px] text-gray-500 mt-1">扣公司營運 -${formatMoney(data.totalOperationsDeduction)}</div>
      </div>
    </div>
  `;
}

// ── 通路明細（NEW）──────────────────────────────────────
function renderChannelSummary(data) {
  const block = document.getElementById('channel-summary-block');
  if (!block) return;

  const ch = data.channelTotals;
  const totalRev = data.monthlyRevenue;

  const card = (key, label, icon, colorBg, colorText) => {
    const c = ch[key];
    const sharePct = totalRev > 0 ? (c.rev / totalRev * 100) : 0;
    return `
      <div class="${colorBg} border-2 rounded-xl p-4">
        <div class="flex items-center justify-between mb-1">
          <div class="text-xs ${colorText} font-semibold">${icon} ${label}</div>
          <div class="text-[10px] text-gray-500">營收占比 ${sharePct.toFixed(1)}%</div>
        </div>
        <div class="text-lg font-bold text-gray-900">${formatMoney(c.rev)}</div>
        <div class="text-xs text-gray-500 mt-0.5">${c.vol} 件 × 平均 ${c.vol > 0 ? formatMoney(c.rev / c.vol) : '—'}</div>
        <div class="mt-2 pt-2 border-t border-gray-200/50 flex justify-between text-xs">
          <span class="text-gray-500">毛利</span>
          <span class="font-semibold ${c.gross >= 0 ? 'text-emerald-600' : 'text-red-500'}">
            ${formatMoney(c.gross)} <span class="text-gray-400">(${c.gross_margin_pct != null ? formatPct(c.gross_margin_pct) : '-'})</span>
          </span>
        </div>
      </div>
    `;
  };

  // 占比條
  const webPct = totalRev > 0 ? (ch.web.rev / totalRev * 100) : 0;
  const kolPct = totalRev > 0 ? (ch.kol.rev / totalRev * 100) : 0;
  const b2bPct = totalRev > 0 ? (ch.b2b.rev / totalRev * 100) : 0;

  block.innerHTML = `
    <div class="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-gray-700">📦 各通路銷售明細</h3>
        <span class="text-xs text-gray-400">毛利＝售價-產品成本，尚未扣全公司行銷/營運</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        ${card('web', '官網銷售（常態價）',     '🌐', 'bg-blue-50 border-blue-200',       'text-blue-700')}
        ${card('kol', 'KOL 團購（開團價）',      '📣', 'bg-pink-50 border-pink-200',       'text-pink-700')}
        ${card('b2b', 'B 端採購（企業價）',      '🏢', 'bg-emerald-50 border-emerald-200', 'text-emerald-700')}
      </div>

      ${totalRev > 0 ? `
        <div>
          <div class="text-xs text-gray-500 mb-1.5">營收占比</div>
          <div class="flex h-3 rounded-full overflow-hidden bg-gray-100">
            ${webPct > 0 ? `<div style="width:${webPct}%" class="bg-blue-500"    title="官網 ${webPct.toFixed(1)}%"></div>` : ''}
            ${kolPct > 0 ? `<div style="width:${kolPct}%" class="bg-pink-500"    title="KOL ${kolPct.toFixed(1)}%"></div>` : ''}
            ${b2bPct > 0 ? `<div style="width:${b2bPct}%" class="bg-emerald-500" title="B 端 ${b2bPct.toFixed(1)}%"></div>` : ''}
          </div>
          <div class="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>🌐 ${webPct.toFixed(1)}%</span>
            <span>📣 ${kolPct.toFixed(1)}%</span>
            <span>🏢 ${b2bPct.toFixed(1)}%</span>
          </div>
        </div>
      ` : '<p class="text-xs text-gray-400 text-center py-2">尚未配貨任何通路銷量</p>'}
    </div>
  `;
}

// ── 詳細計算明細（含通路）──────────────────────────────
function renderBreakdown(data, products, global_costs) {
  const out = document.getElementById('breakdown-content');
  if (!out) return;

  const { productRows, channelTotals, monthlyRevenue, monthlyProductCost,
          grossProfitTotal, marketingPctTotal, marketingFixedTotal,
          afterMarketingTotal, totalMarketingDeduction,
          totalOperationsDeduction, adhocPctTotal, adhocFixedTotal,
          netProfitTotal, totalVolume } = data;

  const renderItemLine = (name, amt, type, suffix = '', baseLabel = monthlyRevenue) => {
    if (type === 'percentage') {
      const cost = baseLabel * amt / 100;
      return `<div class="flex justify-between gap-2">
        <span class="truncate">${escapeHtml(name)}${suffix}</span>
        <span>${amt.toFixed(2)}% × ${formatMoney(baseLabel)} = <strong class="text-red-600">-${formatMoney(cost)}</strong></span>
      </div>`;
    }
    return `<div class="flex justify-between gap-2">
      <span class="truncate">${escapeHtml(name)}${suffix}</span>
      <span>固定 / 月 = <strong class="text-red-600">-${formatMoney(amt)}</strong></span>
    </div>`;
  };

  // ── Step 1: 月營收（依通路）──────────────────────────
  const channelBlock = (key, label, icon) => {
    const rows = productRows.filter(r => r.channels[key].qty > 0);
    if (rows.length === 0) return '';
    const total = channelTotals[key].rev;
    return `
      <div class="text-xs font-medium text-gray-500 mt-2 mb-1">${icon} ${label}</div>
      <div class="space-y-1 text-xs font-mono text-gray-600">
        ${rows.map(r => {
          const c = r.channels[key];
          const tierName = c.tier ? c.tier.price_name : '—';
          return `<div class="flex justify-between gap-2">
            <span class="truncate">${escapeHtml(r.product_name)} <span class="text-gray-400">（${escapeHtml(tierName)}）</span></span>
            <span>${formatMoney(c.tier?.selling_price || 0)} × ${c.qty} = <strong>${formatMoney(c.rev)}</strong></span>
          </div>`;
        }).join('')}
      </div>
      <div class="mt-1 flex justify-between text-xs">
        <span class="text-gray-500">${label}小計（${channelTotals[key].vol} 件）</span>
        <span class="font-semibold text-gray-700">${formatMoney(total)}</span>
      </div>
    `;
  };

  const step1 = `
    <div class="step-block border-l-4 border-gray-300 pl-4 mb-4">
      <div class="font-semibold text-gray-700 mb-2">[一] 月營收（依通路 × 售價方案）</div>
      ${channelBlock('web', '🌐 官網（常態價）',      '')}
      ${channelBlock('kol', '📣 KOL 團購（開團價）',  '')}
      ${channelBlock('b2b', '🏢 B 端採購（企業價）',  '')}
      <div class="mt-3 pt-2 border-t border-gray-200 flex justify-between text-sm font-semibold text-gray-800">
        <span>月營收合計</span>
        <span>${formatMoney(monthlyRevenue)}（共 ${totalVolume} 件）</span>
      </div>
    </div>
  `;

  // ── Step 2: 扣產品成本 ───────────────────────────────
  const step2 = `
    <div class="step-block border-l-4 border-emerald-400 pl-4 mb-4">
      <div class="font-semibold text-emerald-700 mb-2">[二] 扣產品成本（每個通路的成本，因 % 成本依售價而變）</div>
      <div class="space-y-1 text-xs font-mono text-gray-600">
        ${productRows.filter(r => r.volume > 0).map(r => `
          <div class="flex justify-between gap-2">
            <span class="truncate">${escapeHtml(r.product_name)}</span>
            <span>共 ${r.volume} 件成本 = <strong class="text-red-600">-${formatMoney(r.cost)}</strong></span>
          </div>
        `).join('')}
      </div>
      <div class="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm">
        <span class="text-gray-600">產品成本合計</span>
        <span class="font-semibold text-red-600">-${formatMoney(monthlyProductCost)}</span>
      </div>
      <div class="mt-1 flex justify-between text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded">
        <span>① 產品毛利</span>
        <span>${formatMoney(grossProfitTotal)}（毛利率 ${data.grossMarginPct != null ? formatPct(data.grossMarginPct) : '-'}）</span>
      </div>
    </div>
  `;

  // ── Step 3: 扣全部行銷成本 ───────────────────────────
  const mktItems = global_costs.marketing.items || [];
  const camps    = _SIM.campaigns || [];

  const step3 = `
    <div class="step-block border-l-4 border-pink-400 pl-4 mb-4">
      <div class="font-semibold text-pink-700 mb-2">[三] 扣全部行銷成本（公司行銷 + 這個月活動）</div>

      <div class="text-xs font-medium text-gray-500 mt-2 mb-1">📋 來自「公司營運成本」（套用全部營收）</div>
      <div class="space-y-1 text-xs font-mono text-gray-600">
        ${mktItems.length === 0 ? '<div class="text-gray-400 italic">未設定全公司行銷成本</div>' :
          mktItems.map(it => renderItemLine(it.name, parseFloat(it.amount), it.amount_type, '', monthlyRevenue)).join('')
        }
      </div>
      ${mktItems.length > 0 ? `
        <div class="mt-1 flex justify-between text-xs">
          <span class="text-gray-500">公司行銷小計</span>
          <span class="font-semibold text-red-600">-${formatMoney(marketingPctTotal + marketingFixedTotal)}</span>
        </div>
      ` : ''}

      <div class="text-xs font-medium text-gray-500 mt-3 mb-1">🎯 這個月的額外活動（% 抽成<strong>只扣 KOL 通路營收</strong>）</div>
      <div class="space-y-1 text-xs font-mono text-gray-600">
        ${camps.length === 0 ? '<div class="text-gray-400 italic">尚未輸入額外活動</div>' :
          camps.map(c => {
            const amount = parseFloat(c.amount) || 0;
            const count  = Math.max(1, parseInt(c.count) || 1);
            const total  = amount * count;
            const name   = c.name || '（未命名）';
            const suffix = count > 1 ? ` <span class="text-gray-400">（${amount}% × ${count} 個）</span>` : '';
            if (c.type === 'percentage') {
              return renderItemLine(name + ' [KOL]', total, 'percentage', suffix, channelTotals.kol.rev);
            }
            return renderItemLine(name, total, 'fixed', suffix);
          }).join('')
        }
      </div>
      ${camps.length > 0 ? `
        <div class="mt-1 flex justify-between text-xs">
          <span class="text-gray-500">活動小計</span>
          <span class="font-semibold text-red-600">-${formatMoney(adhocPctTotal + adhocFixedTotal)}</span>
        </div>
      ` : ''}

      <div class="mt-3 pt-2 border-t border-gray-200 flex justify-between text-sm">
        <span class="text-gray-700 font-medium">行銷成本合計</span>
        <span class="font-semibold text-red-600">-${formatMoney(totalMarketingDeduction)}</span>
      </div>
      <div class="mt-1 flex justify-between text-sm font-bold text-pink-700 bg-pink-50 px-2 py-1.5 rounded">
        <span>② 含行銷後</span>
        <span>${formatMoney(afterMarketingTotal)}（利潤率 ${data.afterMktMarginPct != null ? formatPct(data.afterMktMarginPct) : '-'}）</span>
      </div>
    </div>
  `;

  // ── Step 4: 扣全公司營運 ─────────────────────────────
  const opsItems = global_costs.operations.items || [];
  const step4 = `
    <div class="step-block border-l-4 border-violet-400 pl-4 mb-4">
      <div class="font-semibold text-violet-700 mb-2">[四] 扣全公司營運成本</div>
      <div class="space-y-1 text-xs font-mono text-gray-600">
        ${opsItems.length === 0 ? '<div class="text-gray-400 italic">未設定全公司營運成本</div>' :
          opsItems.map(it => renderItemLine(it.name, parseFloat(it.amount), it.amount_type, '', monthlyRevenue)).join('')
        }
      </div>
      <div class="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm">
        <span class="text-gray-600">營運成本合計</span>
        <span class="font-semibold text-red-600">-${formatMoney(totalOperationsDeduction)}</span>
      </div>
      <div class="mt-1 flex justify-between text-sm font-bold text-violet-700 bg-violet-50 px-2 py-1.5 rounded">
        <span>💰 月度淨利</span>
        <span>${formatMoney(netProfitTotal)}（淨利率 ${data.netMarginPct != null ? formatPct(data.netMarginPct) : '-'}）</span>
      </div>
    </div>
  `;

  const netColor = netProfitTotal >= 0 ? 'from-emerald-50 to-teal-50 border-emerald-300 text-emerald-700' : 'from-red-50 to-pink-50 border-red-300 text-red-600';
  const final = `
    <div class="bg-gradient-to-br ${netColor} border-2 rounded-xl p-4 mt-2">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs font-medium mb-1">💰 月度淨利</div>
          <div class="text-2xl font-bold">${formatMoney(netProfitTotal)}</div>
        </div>
        <div class="text-right">
          <div class="text-xs">淨利率</div>
          <div class="text-xl font-bold">${data.netMarginPct != null ? formatPct(data.netMarginPct) : '-'}</div>
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-current opacity-70 text-xs">
        計算式：營收 ${formatMoney(monthlyRevenue)} - 產品成本 ${formatMoney(monthlyProductCost)}
        - 行銷成本 ${formatMoney(totalMarketingDeduction)}
        - 營運成本 ${formatMoney(totalOperationsDeduction)}
        = <strong>${formatMoney(netProfitTotal)}</strong>
      </div>
    </div>
  `;

  out.innerHTML = step1 + step2 + step3 + step4 + final;
}

// ── 三層比較圖 ──────────────────────────────────────────
function renderComparisonChart(data) {
  const ctx = document.getElementById('overview-chart');
  if (!ctx) return;

  const rows = data.productRows.filter(r => r.gross_margin_pct != null);
  if (rows.length === 0) {
    if (_SIM.chart) { try { _SIM.chart.destroy(); } catch {} _SIM.chart = null; }
    ctx.parentElement.innerHTML = '<div class="text-center text-gray-400 text-sm py-12">尚無資料 — 請先配貨給通路</div>';
    return;
  }

  rows.sort((a, b) => b.gross_margin_pct - a.gross_margin_pct);

  if (_SIM.chart) {
    try { _SIM.chart.destroy(); } catch {}
    _SIM.chart = null;
  }

  _SIM.chart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.product_name),
      datasets: [
        { label: '毛利率',     data: rows.map(r => r.gross_margin_pct),     backgroundColor: '#10b981', borderRadius: 4 },
        { label: '含行銷',     data: rows.map(r => r.after_mkt_margin_pct), backgroundColor: '#ec4899', borderRadius: 4 },
        { label: '淨利率',     data: rows.map(r => r.net_margin_pct),       backgroundColor: '#6366f1', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}：${ctx.parsed.y == null ? '-' : ctx.parsed.y.toFixed(1) + '%'}`,
          },
        },
      },
      scales: {
        y: { ticks: { callback: v => v + '%', font: { size: 11 } }, grid: { color: '#f3f4f6' } },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

// ── 損益明細表 ──────────────────────────────────────────
function renderDetailTable(data) {
  const tbody = document.getElementById('detail-tbody');
  if (!tbody) return;

  const rows = [...data.productRows].sort((a, b) => {
    const aVal = a.net_margin_pct != null ? a.net_margin_pct : -999;
    const bVal = b.net_margin_pct != null ? b.net_margin_pct : -999;
    return bVal - aVal;
  });

  const colorize = (m) => {
    if (m == null) return 'text-gray-300';
    if (m >= 30) return 'text-emerald-600 font-bold';
    if (m >= 10) return 'text-amber-600 font-bold';
    if (m >= 0)  return 'text-orange-500 font-bold';
    return 'text-red-500 font-bold';
  };
  const fmtPct = m => (m == null ? '-' : formatPct(m));
  const fmtQty = q => q > 0 ? q : '<span class="text-gray-300">—</span>';

  tbody.innerHTML = rows.map(r => `
    <tr class="hover:bg-gray-50 transition-colors">
      <td class="px-3 py-3">
        <div class="font-medium text-gray-900 text-sm">${escapeHtml(r.product_name)}</div>
        <div class="text-xs text-gray-400">平均 ${formatMoney(r.avg_price)}</div>
      </td>
      <td class="px-3 py-3 text-right text-gray-700">${formatMoney(r.revenue)}</td>
      <td class="px-3 py-3 text-right text-gray-700">${r.volume}</td>
      <td class="px-3 py-3 text-right text-blue-600">${fmtQty(r.channels.web.qty)}</td>
      <td class="px-3 py-3 text-right text-pink-600">${fmtQty(r.channels.kol.qty)}</td>
      <td class="px-3 py-3 text-right text-emerald-600">${fmtQty(r.channels.b2b.qty)}</td>
      <td class="px-3 py-3 text-right ${colorize(r.gross_margin_pct)}">${fmtPct(r.gross_margin_pct)}</td>
      <td class="px-3 py-3 text-right ${colorize(r.net_margin_pct)}">${fmtPct(r.net_margin_pct)}</td>
      <td class="px-3 py-3 text-right ${(r.net_profit || 0) >= 0 ? 'text-gray-900' : 'text-red-500'} font-semibold">
        ${formatMoney(r.net_profit || 0)}
      </td>
    </tr>
  `).join('');
}

window.renderAnalysisSummary = renderAnalysisSummary;
