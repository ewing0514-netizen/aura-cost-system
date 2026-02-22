// 簡易 hash router

function handleRoute() {
  const hash = window.location.hash || '#/';

  if (hash === '#/' || hash === '') {
    renderProductList();
    updateNav('home');
  } else if (hash === '#/analysis') {
    renderAnalysisSummary();
    updateNav('analysis');
  } else {
    const m = hash.match(/^#\/product\/([a-f0-9-]+)$/);
    if (m) {
      renderProductDetail(m[1]);
      updateNav('');
    } else {
      renderProductList();
      updateNav('home');
    }
  }
}

function updateNav(active) {
  document.querySelectorAll('[data-nav]').forEach(el => {
    const isActive = el.dataset.nav === active;
    el.className = isActive
      ? 'flex items-center gap-1.5 text-sm font-medium text-indigo-600 px-3 py-1.5 rounded-lg bg-indigo-50'
      : 'flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-50';
  });
}

window.addEventListener('hashchange', handleRoute);
document.addEventListener('DOMContentLoaded', handleRoute);
