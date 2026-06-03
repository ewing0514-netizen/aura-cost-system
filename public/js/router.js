// 簡易 hash router

function handleRoute() {
  const hash = window.location.hash || '#/';

  if (hash === '#/' || hash === '') {
    renderProductList();
    updateNav('home');
  } else if (hash === '#/analysis') {
    renderAnalysisSummary();
    updateNav('analysis');
  } else if (hash === '#/payments') {
    renderPaymentList();
    updateNav('payments');
  } else if (hash === '#/kols') {
    renderKolList();
    updateNav('kols');
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
    el.classList.toggle('active', el.dataset.nav === active);
  });
}

window.addEventListener('hashchange', handleRoute);
document.addEventListener('DOMContentLoaded', handleRoute);
