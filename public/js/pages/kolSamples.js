// 庫存頁區塊：KOL 樣品寄送（寄出即扣庫存，追蹤每位 KOL 的樣品成本與成效）

const SMP_STATUS = {
  sent:        { text: '已寄出', cls: 'status-deposit-paid' },
  posted:      { text: '已發文', cls: 'status-received' },
  campaign:    { text: '已開團', cls: 'status-completed' },
  no_response: { text: '沒下文', cls: 'status-cancelled' },
};
const smpEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const smpMoney = n => formatMoney(Math.round(n || 0));

let _smp = { samples: [], kols: [], products: [], commissions: [], onChange: null };

// containerId：要畫在哪；onChange：存檔後要通知庫存頁重新整理
async function renderSampleSection(containerId, onChange) {
  const box = document.getElementById(containerId);
  if (!box) return;
  _smp.onChange = onChange;
  try {
    const [samples, kols, products, commissions] = await Promise.all([
      api.kolSamples.list(),
      api.kols.list().catch(() => []),
      api.products.list(),
      api.kolCommissions.list().catch(() => []),
    ]);
    _smp = { ..._smp, samples, kols, products: products.filter(p => !p.is_bundle), commissions };
    paintSamples(box);
  } catch (err) {
    if (/kol_samples|Could not find the table/.test(err.rawMessage || err.message || '')) {
      box.innerHTML = `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <div class="text-3xl mb-2">🔧</div>
          <p class="text-sm font-semibold text-amber-800 mb-1">樣品功能需要先建立資料表</p>
          <p class="text-xs text-amber-600">請到 Supabase SQL Editor 執行 <code class="font-mono bg-amber-100 px-1 rounded">database/migration_kol_samples.sql</code></p>
        </div>`;
    } else {
      box.innerHTML = window.renderLoadError(err, { small: true });
    }
  }
}

function paintSamples(box) {
  const { samples, commissions } = _smp;
  const nowYM = new Date().toISOString().slice(0, 7);
  const monthRows = samples.filter(s => (s.sent_date || '').slice(0, 7) === nowYM);
  const sum = (arr, k) => arr.reduce((s, r) => s + (parseFloat(r[k]) || 0), 0);

  // 每位 KOL 彙總：寄了幾次、幾支、樣品花了多少、後來開團賣了多少
  const byKol = {};
  for (const s of samples) {
    const key = s.kol_id || 'name:' + s.recipient_name;
    const k = byKol[key] || (byKol[key] = { name: s.kol_name || s.recipient_name, kol_id: s.kol_id, times: 0, units: 0, cost: 0, latest: s });
    k.times += 1; k.units += s.units; k.cost += s.total_cost;
    if ((s.sent_date || '') > (k.latest.sent_date || '')) k.latest = s;
  }
  for (const k of Object.values(byKol)) {
    const cs = commissions.filter(c => (k.kol_id && c.kol_id === k.kol_id) || (!k.kol_id && c.kol_name === k.name));
    k.sales = cs.reduce((s, c) => s + (parseFloat(c.sales_amount) || 0), 0);
    k.campaigns = cs.length;
  }
  const kolRows = Object.values(byKol).sort((a, b) => b.cost - a.cost).map(k => {
    const st = SMP_STATUS[k.latest.status] || SMP_STATUS.sent;
    const ratio = k.cost > 0 && k.sales > 0 ? (k.sales / k.cost).toFixed(1) + ' 倍' : '—';
    return `<tr class="border-t border-slate-100 text-sm">
      <td class="px-3 py-2.5 text-slate-800">${smpEsc(k.name)}</td>
      <td class="px-3 py-2.5 text-right">${k.times} 次 · ${k.units} 支</td>
      <td class="px-3 py-2.5 text-right num-display">${smpMoney(k.cost)}</td>
      <td class="px-3 py-2.5 text-right"><span class="status-chip ${st.cls}">${st.text}</span></td>
      <td class="px-3 py-2.5 text-right num-display ${k.sales ? 'text-emerald-700' : 'text-slate-300'}">${k.sales ? smpMoney(k.sales) : '還沒開團'}</td>
      <td class="px-3 py-2.5 text-right text-slate-600">${ratio}</td>
    </tr>`;
  }).join('');

  const listRows = samples.map(s => {
    const items = s.items.map(it => `${smpEsc(it.product_name.split(' ')[0])}×${it.quantity}`).join('、');
    return `<div class="flex items-center gap-3 py-2.5 border-t border-slate-100 text-sm flex-wrap">
      <span class="text-[11px] text-slate-400 w-20">${(s.sent_date || '').replace(/-/g, '/')}</span>
      <span class="font-medium text-slate-800 w-28 truncate" title="${smpEsc(s.kol_name || s.recipient_name)}">${smpEsc(s.kol_name || s.recipient_name)}</span>
      <span class="flex-1 min-w-[140px] text-slate-600 truncate" title="${items}">${items}</span>
      <span class="num-display text-slate-700 w-24 text-right" title="樣品成本 ${smpMoney(s.goods_cost)}＋運費 ${smpMoney(s.shipping_fee)}">${smpMoney(s.total_cost)}</span>
      <select data-smp-status="${s.id}" class="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white/70">
        ${Object.entries(SMP_STATUS).map(([v, m]) => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${m.text}</option>`).join('')}
      </select>
      <button data-smp-edit="${s.id}" class="chip-btn chip-btn-primary">編輯</button>
      <button data-smp-del="${s.id}" class="chip-btn chip-btn-danger">刪除</button>
    </div>`;
  }).join('');

  box.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div class="glass-card-soft p-4"><div class="text-[11px] text-slate-500">本月寄出</div><div class="num-display text-xl text-pink-600">${sum(monthRows, 'units')} 支</div><div class="text-[11px] text-slate-400">${monthRows.length} 位 KOL</div></div>
      <div class="glass-card-soft p-4"><div class="text-[11px] text-slate-500">本月樣品成本</div><div class="num-display text-xl text-slate-800">${smpMoney(sum(monthRows, 'total_cost'))}</div><div class="text-[11px] text-slate-400">含運費 ${smpMoney(sum(monthRows, 'shipping_fee'))}</div></div>
      <div class="glass-card-soft p-4"><div class="text-[11px] text-slate-500">累計寄出</div><div class="num-display text-xl text-slate-800">${sum(samples, 'units')} 支</div><div class="text-[11px] text-slate-400">${samples.length} 次寄送</div></div>
      <div class="glass-card-soft p-4"><div class="text-[11px] text-slate-500">累計樣品成本</div><div class="num-display text-xl text-slate-800">${smpMoney(sum(samples, 'total_cost'))}</div><div class="text-[11px] text-slate-400">產品成本＋運費</div></div>
    </div>
    ${samples.length ? `
      <div class="glass-card-soft p-2 overflow-x-auto mb-4">
        <table class="w-full min-w-[620px]">
          <thead><tr class="text-xs text-slate-500">
            <th class="px-3 py-2 text-left font-medium">KOL</th>
            <th class="px-3 py-2 text-right font-medium">寄過</th>
            <th class="px-3 py-2 text-right font-medium">樣品花費</th>
            <th class="px-3 py-2 text-right font-medium">最新狀態</th>
            <th class="px-3 py-2 text-right font-medium">開團營收</th>
            <th class="px-3 py-2 text-right font-medium">營收 ÷ 樣品花費</th>
          </tr></thead>
          <tbody>${kolRows}</tbody>
        </table>
      </div>
      <div class="glass-card-soft px-4 py-2" id="smp-list">${listRows}</div>
      <p class="text-[11px] text-slate-500 mt-2">寄出就會自動從庫存扣掉（異動帳裡顯示為「寄樣品」）。樣品成本＝產品成本 × 支數＋運費。「開團營收」抓 KOL 分潤頁裡同一位 KOL 的開團銷售額。</p>
    ` : `<div class="glass-card-soft p-8 text-center text-sm text-slate-400">還沒有寄過樣品。點右上角「🎁 寄樣品」新增第一筆。</div>`}
  `;

  box.querySelectorAll('[data-smp-status]').forEach(sel => {
    sel.onchange = async () => {
      try { await api.kolSamples.setStatus(sel.dataset.smpStatus, sel.value); toast('狀態已更新'); renderSampleSection(box.id, _smp.onChange); }
      catch (err) { toast(err.message, 'error'); }
    };
  });
  box.querySelectorAll('[data-smp-edit]').forEach(b => {
    b.onclick = () => showSampleModal(_smp.samples.find(s => s.id === b.dataset.smpEdit));
  });
  box.querySelectorAll('[data-smp-del]').forEach(b => {
    b.onclick = async () => {
      const s = _smp.samples.find(x => x.id === b.dataset.smpDel);
      if (!(await confirm(`刪除寄給「${s.kol_name || s.recipient_name}」的樣品紀錄？扣掉的庫存會加回來。`))) return;
      try { await api.kolSamples.delete(s.id); smpAfterSave('已刪除，庫存已加回'); }
      catch (err) { toast(err.message, 'error'); }
    };
  });
}

function smpAfterSave(msg) {
  // 樣品會動到庫存，清掉庫存與產品的快取
  if (typeof _cacheInvalidate === 'function') { _cacheInvalidate('GET/inventory'); _cacheInvalidate('GET/products'); }
  toast(msg);
  if (_smp.onChange) _smp.onChange();
}

function showSampleModal(sample) {
  const isEdit = !!sample;
  const { kols, products } = _smp;
  if (!products.length) { toast('請先新增產品', 'error'); return; }
  const root = document.getElementById('modal-root');
  const today = new Date().toISOString().slice(0, 10);
  const items = sample?.items?.length ? sample.items : [{ product_id: products[0].id, quantity: 1 }];
  const prodOpts = sel => products.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${smpEsc(p.name)}（剩 ${p.current_stock ?? 0}）</option>`).join('');
  const itemRow = it => `
    <div class="smp-item flex gap-2 items-center">
      <select class="smp-prod flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm">${prodOpts(it.product_id)}</select>
      <input class="smp-qty w-20 border border-gray-300 rounded-lg px-2 py-2 text-sm text-right" type="number" min="1" step="1" value="${it.quantity}">
      <span class="text-xs text-slate-400">支</span>
      <button type="button" class="smp-rm text-slate-400 hover:text-rose-500 text-lg leading-none px-1">&times;</button>
    </div>`;
  const kolSel = sample?.kol_id || '';
  const inList = !sample || !!sample.kol_id;

  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" id="modal-overlay">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto font-apple">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 class="text-base font-semibold text-gray-900">${isEdit ? '編輯樣品紀錄' : '🎁 寄樣品給 KOL'}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form id="smp-form" class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">寄給誰 <span class="text-red-500">*</span></label>
            <select id="smp-kol" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              ${kols.map(k => `<option value="${k.id}" ${k.id === kolSel ? 'selected' : ''}>${smpEsc(k.name)}</option>`).join('')}
              <option value="__other" ${inList ? '' : 'selected'}>不在名單裡（自己輸入名字）</option>
            </select>
            <input id="smp-name" type="text" placeholder="KOL 名稱，例：@xxx" value="${inList ? '' : smpEsc(sample?.recipient_name)}"
              class="${inList && kols.length ? 'hidden' : ''} mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">寄了什麼 <span class="text-red-500">*</span></label>
            <div id="smp-items" class="space-y-2">${items.map(itemRow).join('')}</div>
            <button type="button" id="smp-add" class="mt-2 text-xs text-indigo-600 hover:underline">＋ 再加一款</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">寄出日期 <span class="text-red-500">*</span></label>
              <input id="smp-date" type="date" required value="${sample?.sent_date || today}" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">運費</label>
              <input id="smp-fee" type="number" min="0" step="1" value="${sample ? parseFloat(sample.shipping_fee || 0) : 0}" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">狀態</label>
              <select id="smp-status" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                ${Object.entries(SMP_STATUS).map(([v, m]) => `<option value="${v}" ${(sample?.status || 'sent') === v ? 'selected' : ''}>${m.text}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">物流單號</label>
              <input id="smp-track" type="text" value="${smpEsc(sample?.tracking_no || '')}" placeholder="選填" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input id="smp-note" type="text" value="${smpEsc(sample?.note || '')}" placeholder="例：試用後評估開團" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          </div>
          <p id="smp-preview" class="text-xs text-slate-500"></p>
          <div id="smp-err" class="hidden text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"></div>
          <div class="flex gap-3 pt-1">
            <button type="button" id="modal-cancel" class="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            <button type="submit" id="smp-submit" class="flex-1 bg-pink-600 text-white py-2 rounded-lg hover:bg-pink-700 text-sm font-medium">儲存並扣庫存</button>
          </div>
        </form>
      </div>
    </div>`;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('modal-close').onclick = close;
  document.getElementById('modal-cancel').onclick = close;
  document.getElementById('modal-overlay').onclick = e => { if (e.target === e.currentTarget) close(); };

  const kolEl = document.getElementById('smp-kol');
  const nameEl = document.getElementById('smp-name');
  if (!kols.length) kolEl.value = '__other';
  kolEl.onchange = () => nameEl.classList.toggle('hidden', kolEl.value !== '__other');

  const itemsEl = document.getElementById('smp-items');
  const costOf = id => parseFloat(products.find(p => p.id === id)?.total_cost || 0);
  const readItems = () => [...itemsEl.querySelectorAll('.smp-item')].map(r => ({
    product_id: r.querySelector('.smp-prod').value,
    quantity:   parseInt(r.querySelector('.smp-qty').value) || 0,
  })).filter(it => it.quantity > 0);
  const preview = () => {
    const its = readItems();
    const units = its.reduce((s, it) => s + it.quantity, 0);
    const goods = its.reduce((s, it) => s + it.quantity * costOf(it.product_id), 0);
    const fee = parseFloat(document.getElementById('smp-fee').value) || 0;
    document.getElementById('smp-preview').textContent = `共 ${units} 支，樣品成本約 ${smpMoney(goods)}${fee ? ` ＋ 運費 ${smpMoney(fee)} ＝ ${smpMoney(goods + fee)}` : ''}；儲存後會從庫存扣掉。`;
  };
  const bindRow = r => {
    r.querySelector('.smp-rm').onclick = () => { if (itemsEl.children.length > 1) { r.remove(); preview(); } };
    r.querySelectorAll('select,input').forEach(el => { el.oninput = preview; el.onchange = preview; });
  };
  itemsEl.querySelectorAll('.smp-item').forEach(bindRow);
  document.getElementById('smp-add').onclick = () => {
    itemsEl.insertAdjacentHTML('beforeend', itemRow({ product_id: products[0].id, quantity: 1 }));
    bindRow(itemsEl.lastElementChild); preview();
  };
  document.getElementById('smp-fee').oninput = preview;
  preview();

  document.getElementById('smp-form').onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('smp-err');
    err.classList.add('hidden');
    const other = kolEl.value === '__other';
    const kol = kols.find(k => k.id === kolEl.value);
    const name = other ? nameEl.value.trim() : kol?.name;
    const its = readItems();
    if (!name) { err.textContent = '請選擇或輸入 KOL'; err.classList.remove('hidden'); return; }
    if (!its.length) { err.textContent = '請至少填一款產品'; err.classList.remove('hidden'); return; }
    // 同款合併
    const merged = {};
    for (const it of its) merged[it.product_id] = (merged[it.product_id] || 0) + it.quantity;
    const body = {
      kol_id:         other ? null : kolEl.value,
      recipient_name: name,
      items:          Object.entries(merged).map(([product_id, quantity]) => ({ product_id, quantity })),
      sent_date:      document.getElementById('smp-date').value,
      shipping_fee:   parseFloat(document.getElementById('smp-fee').value) || 0,
      status:         document.getElementById('smp-status').value,
      tracking_no:    document.getElementById('smp-track').value.trim() || null,
      note:           document.getElementById('smp-note').value.trim() || null,
    };
    const btn = document.getElementById('smp-submit');
    btn.disabled = true; btn.textContent = '儲存中…';
    try {
      if (isEdit) await api.kolSamples.update(sample.id, body);
      else        await api.kolSamples.create(body);
      close();
      smpAfterSave(isEdit ? '樣品紀錄已更新' : '已記錄，庫存已扣除');
    } catch (e2) {
      err.textContent = e2.message; err.classList.remove('hidden');
      btn.disabled = false; btn.textContent = '儲存並扣庫存';
    }
  };
}
