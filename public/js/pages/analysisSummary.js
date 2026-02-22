// 頁面 3：總覽分析

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
          <p class="text-gray-500 text-sm mt-1">所有產品的損益分析摘要</p>
        </div>
      </div>

      <div id="summary-content">
        <div class="flex justify-center py-12"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').onclick = () => { window.location.hash = '#/'; };

  try {
    const summary = await api.analysis.summary();
    const container = document.getElementById('summary-content');

    if (summary.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 text-gray-400">
          <div class="text-5xl mb-4">📊</div>
          <p>還沒有任何產品資料</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="text-left px-4 py-3 font-medium">產品名稱</th>
              <th class="text-center px-4 py-3 font-medium">售價方案數</th>
              <th class="text-right px-4 py-3 font-medium">最佳利潤率</th>
              <th class="text-left px-4 py-3 font-medium">最佳售價方案</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${summary.map(p => {
              const m = p.best_margin_pct;
              const marginClass = m == null ? '' : m > 0 ? 'profit-positive' : 'profit-negative';
              return `
                <tr>
                  <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(p.product_name)}</td>
                  <td class="px-4 py-3 text-center text-gray-500">${p.price_count} 種</td>
                  <td class="px-4 py-3 text-right font-bold ${marginClass}">
                    ${m != null ? formatPct(m) : '<span class="text-gray-300">-</span>'}
                  </td>
                  <td class="px-4 py-3 text-gray-500">
                    ${p.best_price_name ? escapeHtml(p.best_price_name) : '<span class="text-gray-300">-</span>'}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <a href="#/product/${p.product_id}" class="text-indigo-600 hover:underline text-xs">詳情</a>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('summary-content').innerHTML =
      `<div class="text-center py-12 text-red-500">載入失敗：${err.message}</div>`;
  }
}

window.renderAnalysisSummary = renderAnalysisSummary;
