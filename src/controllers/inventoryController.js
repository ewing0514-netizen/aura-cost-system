const supabase = require('../config/database');
const Joi = require('joi');

// ── 通路 / 類型標籤 ────────────────────────────────────
const VALID_TYPES    = ['in', 'out', 'adjust'];
const VALID_CHANNELS = ['restock', 'web', 'kol', 'b2b', 'sample', 'damage', 'other'];

const schema = Joi.object({
  product_id:    Joi.string().uuid().required(),
  type:          Joi.string().valid(...VALID_TYPES).required(),
  channel:       Joi.string().valid(...VALID_CHANNELS).allow('', null).optional(),
  quantity:      Joi.number().integer().required(),  // 使用者輸入「件數」（正數），由 type 決定正負
  unit_cost:     Joi.number().min(0).allow(null).optional(),
  movement_date: Joi.string().isoDate().required(),
  note:          Joi.string().trim().allow('', null).optional(),
});

// 依 type 把使用者輸入的件數轉成「帶號的庫存變化量」
//   in     → +abs
//   out    → −abs
//   adjust → 維持原號（可正可負，代表盤點差異）
function signedQty(type, qty) {
  const n = parseInt(qty) || 0;
  if (type === 'in')  return Math.abs(n);
  if (type === 'out') return -Math.abs(n);
  return n; // adjust
}

// 偵測 inventory_movements 表是否存在（給 PO/KOL 安全降級用）
let _hasTable = null;
async function inventoryTableExists() {
  if (_hasTable !== null) return _hasTable;
  const { error } = await supabase.from('inventory_movements').select('id').limit(1);
  _hasTable = !error;
  return _hasTable;
}

// =====================================================
// 給其他 controller 用的同步 helper
//   針對某個來源（採購單 / KOL 開團）重建其產生的庫存異動
//   movements: [{ product_id, type, channel, quantity(帶號), unit_cost, movement_date, note }]
// =====================================================
async function syncRefMovements(refType, refId, movements) {
  if (!(await inventoryTableExists())) return; // 表還沒 migrate，靜默跳過

  // 先刪掉此來源舊的異動
  await supabase.from('inventory_movements').delete().eq('ref_type', refType).eq('ref_id', refId);

  const valid = (movements || []).filter(m => m.product_id && m.quantity);
  if (valid.length === 0) return;

  await supabase.from('inventory_movements').insert(valid.map(m => ({
    product_id:    m.product_id,
    type:          m.type,
    channel:       m.channel || null,
    quantity:      m.quantity,
    unit_cost:     m.unit_cost ?? null,
    ref_type:      refType,
    ref_id:        refId,
    movement_date: m.movement_date,
    note:          m.note || null,
  })));
}

// 移除某來源的所有庫存異動（來源被刪除時呼叫）
async function removeRefMovements(refType, refId) {
  if (!(await inventoryTableExists())) return;
  await supabase.from('inventory_movements').delete().eq('ref_type', refType).eq('ref_id', refId);
}

// 計算每個產品目前庫存（回傳 { [product_id]: qty }）
async function computeStockMap() {
  if (!(await inventoryTableExists())) return {};
  const { data, error } = await supabase.from('inventory_movements').select('product_id, quantity');
  if (error) return {};
  const map = {};
  for (const m of data) {
    map[m.product_id] = (map[m.product_id] || 0) + (parseInt(m.quantity) || 0);
  }
  return map;
}

// =====================================================
// HTTP handlers
// =====================================================
function decorate(m) {
  return {
    ...m,
    product_name: m.products?.name || null,
    products:     undefined,
  };
}

async function listMovements(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*, products(name)')
      .order('movement_date', { ascending: false })
      .order('created_at',    { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data.map(decorate) });
  } catch (err) { next(err); }
}

// 每個產品的庫存總覽：目前庫存、安全庫存、狀態、進/出/盤點累計
async function summary(req, res, next) {
  try {
    const [{ data: products, error: pErr }, { data: movements, error: mErr }] = await Promise.all([
      supabase.from('products').select('id, name, safety_stock').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('inventory_movements').select('product_id, type, quantity'),
    ]);
    if (pErr) throw pErr;
    if (mErr) throw mErr;

    const byProduct = {};
    for (const m of movements) {
      const p = byProduct[m.product_id] || (byProduct[m.product_id] = { current: 0, totalIn: 0, totalOut: 0, totalAdjust: 0 });
      const q = parseInt(m.quantity) || 0;
      p.current += q;
      if (m.type === 'in')     p.totalIn     += q;
      else if (m.type === 'out') p.totalOut  += Math.abs(q);
      else                     p.totalAdjust += q;
    }

    const rows = products.map(p => {
      const agg = byProduct[p.id] || { current: 0, totalIn: 0, totalOut: 0, totalAdjust: 0 };
      const safety = parseInt(p.safety_stock) || 0;
      let status = 'ok';
      if (agg.current <= 0)            status = 'out';      // 缺貨
      else if (agg.current <= safety)  status = 'low';      // 低於安全庫存
      return {
        product_id:    p.id,
        product_name:  p.name,
        current_stock: agg.current,
        safety_stock:  safety,
        total_in:      agg.totalIn,
        total_out:     agg.totalOut,
        total_adjust:  agg.totalAdjust,
        status,
      };
    });

    const stats = {
      total_products: rows.length,
      out_count:      rows.filter(r => r.status === 'out').length,
      low_count:      rows.filter(r => r.status === 'low').length,
      total_units:    rows.reduce((s, r) => s + r.current_stock, 0),
    };

    res.json({ success: true, data: { products: rows, stats } });
  } catch (err) { next(err); }
}

async function createMovement(req, res, next) {
  try {
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('inventory_movements')
      .insert({
        product_id:    value.product_id,
        type:          value.type,
        channel:       value.channel || null,
        quantity:      signedQty(value.type, value.quantity),
        unit_cost:     value.unit_cost ?? null,
        ref_type:      'manual',
        ref_id:        null,
        movement_date: value.movement_date,
        note:          value.note || null,
      })
      .select('*, products(name)')
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: decorate(data) });
  } catch (err) { next(err); }
}

async function updateMovement(req, res, next) {
  try {
    const { id } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('inventory_movements')
      .update({
        product_id:    value.product_id,
        type:          value.type,
        channel:       value.channel || null,
        quantity:      signedQty(value.type, value.quantity),
        unit_cost:     value.unit_cost ?? null,
        movement_date: value.movement_date,
        note:          value.note || null,
      })
      .eq('id', id)
      .select('*, products(name)')
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定庫存異動' } });
    res.json({ success: true, data: decorate(data) });
  } catch (err) { next(err); }
}

async function removeMovement(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('inventory_movements').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = {
  listMovements, summary, createMovement, updateMovement, removeMovement,
  // helpers for other controllers
  syncRefMovements, removeRefMovements, computeStockMap, inventoryTableExists,
};
