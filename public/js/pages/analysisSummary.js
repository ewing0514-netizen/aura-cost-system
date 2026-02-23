// 頁面 3：損益總覽（整體利潤率分析）

async function renderAnalysisSummary() {
  const main = document.getElementById('app');
  main.innerHTML = `
    <div class="max-w-5xl mx-auto px-4 py-8">
      <div class="flex items-center gap-3 mb-8">
        <button id="btn-back" class="text-gray-400 hover:text-gray-700">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">損益總覽</h1>
          <p class="text-gray-500 text-sm mt-1">所有產品的整體利潤率分析</p>
        </div>
      </div>

      <div id="summary-content">
        <div class="flex justify-center py-12"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').onclick = () => { window.location.hash = '#/'; };

  try {
    const result = await api.analysis.summary();
    const { products: summary, stats } = result;
    const container = document.getElementById('summary-content');

    if (summary.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 text-gray-400">
          <div class="text-5xl mb-4">📊</div>
          <p class="text-lg">還沒有任何產品資料</p>
          <p class="text-sm mt-1">請先新增產品並設定售價</p>
        </div>
      `;
      return;
    }

    // 顏色邏輯
    const avgColor = stats.avgMargin == null ? 'text-gray-500'
      : stats.avgMargin >= 30 ? 'text-emerald-600'
      : stats.avgMargin >= 10 ? 'text-amber-600'
      : 'text-red-500';

    container.innerHTML = `
      <!-- ① 整體統計卡片 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div class="bg-white border border-gray-200 rounded-xl p-4">
          <div class="text-xs text-gray-500 mb-1">產品總數</div>
          <div class="text-2xl font-bold text-gray-900">${stats.total}</div>
          <div class="text-xs text-gray-400 mt-0.5">種產品</div>
        </div>
        <div class="bg-white border border-gray-200 rounded-xl p-4">
          <div class="text-xs text-gray-500 mb-1">平均最佳利潤率</div>
          <div class="text-2xl font-bold ${avgColor}">
            ${stats.avgMargin != null ? formatPct(stats.avgMargin) : '-'}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">跨所有產品</div>
        </div>
        <div class="bg-white border border-gray-100 rounded-xl p-4 bg-emerald-50/60">
          <div class="text-xs text-emerald-700 mb-1">🟢 高利潤率</div>
          <div class="text-2xl font-bold text-emerald-600">${stats.highCount}</div>
          <div class="text-xs text-gray-400 mt-0.5">≥ 30%</div>
        </div>
        <div class="bg-white border border-gray-100 rounded-xl p-4 ${stats.lowCount > 0 ? 'bg-red-50/60' : ''}">
          <div class="text-xs ${stats.lowCount > 0 ? 'text-red-600' : 'text-gray-500'} mb-1">
            ${stats.lowCount > 0 ? '🔴 需關注' : '✅ 需關注'}
          </div>
          <div class="text-2xl font-bold ${stats.lowCount > 0 ? 'text-red-500' : 'text-gray-400'}">${stats.lowCount}</div>
          <div class="text-xs text-gray-400 mt-0.5">低於 10%</div>
        </div>
      </div>

      <!-- ② 利潤率分布圖 -->
      <div class="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-700">📊 各產品最佳利潤率比較</h3>
          <div class="flex items-center gap-3 text-xs text-gray-500">
            <span class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500"></span> ≥ 30%
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-sm inline-block bg-amber-400"></span> 10–30%
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-sm inline-block bg-red-400"></span> &lt; 10%
            </span>
          </div>
        </div>
        <canvas id="overview-chart" height="75"></canvas>
      </div>

      <!-- ③ 利潤率健康分布 -->
      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
          <div class="text-xs font-medium text-emerald-700 mb-1">🟢 健康</div>
          <div class="text-xl font-bold text-emerald-600">${stats.highCount} 種</div>
          <div class="text-xs text-emerald-500 mt-0.5">利潤率 ≥ 30%</div>
        </div>
        <div class="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
          <div class="text-xs font-medium text-amber-700 mb-1">🟡 尚可</div>
          <div class="text-xl font-bold text-amber-600">${stats.midCount} 種</div>
          <div class="text-xs text-amber-500 mt-0.5">利潤率 10–30%</div>
        </div>
        <div class="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <div class="text-xs font-medium text-red-700 mb-1">🔴 需關注</div>
          <div class="text-xl font-bold text-red-500">${stats.lowCount} 種</div>
          <div class="text-xs text-red-400 mt-0.5">利潤率 &lt; 10%</div>
        </div>
      </div>

      <!-- ④ 產品明細表格 -->
      <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700">產品損益明細</h3>
          <span class="text-xs text-gray-400">按最佳利潤率排序</span>
        </div>
        <table class="w-full text-sm">
          <thead class="text-gray-500 text-xs uppercase bg-gray-50">
            <tr>
              <th class="text-left px-4 py-3 font-medium">產品名稱</th>
              <th class="text-center px-4 py-3 font-medium">售價方案</th>
              <th class="text-right px-4 py-3 font-medium">最佳利潤率</th>
              <th class="text-left px-4 py-3 font-medium hidden md:table-cell">最佳售價方案</th>
              <th class="text-center px-4 py-3 font-medium">健康度</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${[...summary]
              .sort((a, b) => (b.best_margin_pct ?? -999) - (a.best_margin_pct ?? -999))
              .map(p => {
                const m = p.best_margin_pct;
                const marginClass = m == null ? 'text-gray-400'
                  : m >= 30 ? 'text-emerald-600 font-bold'
                  : m >= 10 ? 'text-amber-600 font-bold'
                  : 'text-red-500 font-bold';
                const badge = m == null ? '<span class="text-gray-300">—</span>'
                  : m >= 30 ? '<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">健康</span>'
                  : m >= 10 ? '<span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">尚可</span>'
                  : '<span class="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">需關注</span>';

                return `
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(p.product_name)}</td>
                    <td class="px-4 py-3 text-center text-gray-500">${p.price_count} 種</td>
                    <td class="px-4 py-3 text-right ${marginClass}">
                      ${m != null ? formatPct(m) : '<span class="text-gray-300">-</span>'}
                    </td>
                    <td class="px-4 py-3 text-gray-500 hidden md:table-cell">
                      ${p.best_price_name ? escapeHtml(p.best_price_name) : '<span class="text-gray-300">-</span>'}
                    </td>
                    <td class="px-4 py-3 text-center">${badge}</td>
                    <td class="px-4 py-3 text-right">
                      <a href="#/product/${p.product_id}" class="text-indigo-600 hover:underline text-xs font-medium">詳情 →</a>
                    </td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // 繪製圖表
    const withMargin = summary.filter(p => p.best_margin_pct != null);
    if (withMargin.length > 0) {
      const sorted = [...withMargin].sort((a, b) => b.best_margin_pct - a.best_margin_pct);
      const ctx = document.getElementById('overview-chart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: sorted.map(p => p.product_name),
          datasets: [{
            label: '最佳利潤率 (%)',
            data:  sorted.map(p => p.best_margin_pct),
            backgroundColor: sorted.map(p =>
              p.best_margin_pct >= 30 ? '#10b981'
              : p.best_margin_pct >= 10 ? '#f59e0b'
              : '#f87171'
            ),
            borderRadius: 6,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(1)}%` }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: v => v + '%', font: { size: 11 } },
              grid: { color: '#f3f4f6' },
            },
            x: {
              grid: { display: false },
              ticks: { font: { size: 11 } },
            }
          }
        }
      });
    }

  } catch (err) {
    document.getElementById('summary-content').innerHTML =
      `<div class="text-center py-12 text-red-500">載入失敗：${err.message}</div>`;
  }
}

window.renderAnalysisSummary = renderAnalysisSummary;
