// 簡易 hash router
//   導覽列：總覽 / 記帳 / 產品與定價 / 庫存
//   記帳底下分「現金收支」「KOL 分潤」；產品與定價底下分「產品列表」「損益模擬器」

const SUBNAV = {
  ledger: [
    { hash: '#/payments', label: '💵 現金收支' },
    { hash: '#/kols',     label: '🎀 KOL 分潤' },
  ],
  products: [
    { hash: '#/products', label: '🧴 產品列表' },
    { hash: '#/analysis', label: '🧮 損益模擬器' },
  ],
};

function handleRoute() {
  const hash = window.location.hash || '#/';

  if (hash === '#/' || hash === '') {
    renderOverview();         updateNav('home');
  } else if (hash === '#/products') {
    renderProductList();       updateNav('products', hash);
  } else if (hash === '#/analysis') {
    renderAnalysisSummary();   updateNav('products', hash);
  } else if (hash === '#/payments') {
    renderPaymentList();       updateNav('ledger', hash);
  } else if (hash === '#/kols') {
    renderKolList();           updateNav('ledger', hash);
  } else if (hash === '#/inventory') {
    renderInventoryList();     updateNav('inventory');
  } else {
    const m = hash.match(/^#\/product\/([a-f0-9-]+)$/);
    if (m) {
      renderProductDetail(m[1]); updateNav('products');
    } else {
      renderOverview();         updateNav('home');
    }
  }
}

function updateNav(active, subHash) {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === active);
  });
  const sub = document.getElementById('subnav');
  const items = SUBNAV[active];
  if (!sub) return;
  if (!items || !subHash) { sub.innerHTML = ''; return; }
  sub.innerHTML = `
    <div class="relative z-10 max-w-5xl mx-auto px-4 pt-5 font-apple">
      <div class="pill-tab-bar inline-flex">
        ${items.map(i => `<a href="${i.hash}" class="pill-tab ${i.hash === subHash ? 'active' : ''}">${i.label}</a>`).join('')}
      </div>
    </div>`;
}

window.addEventListener('hashchange', handleRoute);
document.addEventListener('DOMContentLoaded', handleRoute);
