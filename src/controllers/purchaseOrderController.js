const supabase = require('../config/database');
const Joi = require('joi');

const schema = Joi.object({
  supplier_id:        Joi.string().uuid().required(),
  product_id:         Joi.string().uuid().allow('', null).optional(),
  item_description:   Joi.string().trim().min(1).required(),
  invoice_no:         Joi.string().trim().allow('', null).optional(),
  total_amount:       Joi.number().positive().required(),
  deposit_amount:     Joi.number().min(0).default(0),
  deposit_paid_at:    Joi.string().isoDate().allow('', null).optional(),
  balance_paid_at:    Joi.string().isoDate().allow('', null).optional(),
  remittance_account: Joi.string().trim().allow('', null).optional(),
  order_date:         Joi.string().isoDate().required(),
  cancelled:          Joi.boolean().default(false),
  note:               Joi.string().trim().allow('', null).optional(),

  // ── 採購擴充欄位 ─────────────────────────────────────
  extra_expenses:     Joi.array().items(
    Joi.object({
      name:   Joi.string().trim().min(1).max(100).required(),
      amount: Joi.number().min(0).required(),
    })
  ).default([]),
  operating_fee_pct:  Joi.number().min(0).max(100).default(15),
  public_fund_amount: Joi.number().min(0).default(0),
});

// 衍生狀態
function deriveStatus(order) {
  if (order.cancelled) return 'cancelled';
  if (!order.deposit_paid_at) return 'pending';
  if (!order.balance_paid_at) return 'deposit_paid';
  return 'completed';
}

// 偵測 DB 是否已跑過 extras migration（一次性，cache 結果）
let _hasExtrasColumns = null;
async function hasExtrasColumns() {
  if (_hasExtrasColumns !== null) return _hasExtrasColumns;
  const { error } = await supabase.from('purchase_orders').select('extra_expenses').limit(1);
  _hasExtrasColumns = !error;
  return _hasExtrasColumns;
}

// ── 衍生計算欄位 ──────────────────────────────────────
function computeCostBreakdown(order) {
  const total   = parseFloat(order.total_amount   || 0);
  const deposit = parseFloat(order.deposit_amount || 0);
  const extras  = Array.isArray(order.extra_expenses) ? order.extra_expenses : [];
  const extraTotal = extras.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const opsPct  = parseFloat(order.operating_fee_pct ?? 15);
  const opsFee  = (total + extraTotal) * opsPct / 100;
  const fund    = parseFloat(order.public_fund_amount || 0);
  return {
    extra_expenses_total: extraTotal,
    operating_fee_amount: opsFee,
    actual_total_cost:    total + extraTotal + opsFee + fund,
    balance_amount:       total - deposit,
  };
}

async function list(req, res, next) {
  try {
    const { status } = req.query;

    // 用 * 取所有欄位，自動相容尚未跑 migration 的舊環境
    let { data, error } = await supabase
      .from('purchase_orders')
      .select(`*, suppliers(name), products(name)`)
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;

    let rows = data.map(r => ({
      ...r,
      supplier_name: r.suppliers?.name || '',
      product_name:  r.products?.name  || null,
      ...computeCostBreakdown(r),
      status: deriveStatus(r),
      suppliers: undefined,
      products:  undefined,
    }));

    // 前端篩選
    if (status && ['pending', 'deposit_paid', 'completed', 'cancelled'].includes(status)) {
      rows = rows.filter(r => r.status === status);
    }

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`*, suppliers(name, bank_account), products(name)`)
      .eq('id', id)
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定貨款記錄' } });

    const row = {
      ...data,
      supplier_name:    data.suppliers?.name         || '',
      supplier_account: data.suppliers?.bank_account || '',
      product_name:     data.products?.name          || null,
      ...computeCostBreakdown(data),
      status:           deriveStatus(data),
      suppliers: undefined,
      products:  undefined,
    };
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    if (value.deposit_amount > value.total_amount) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '訂金不可超過總金額' } });
    }

    const payload = {
      supplier_id:        value.supplier_id,
      product_id:         value.product_id || null,
      item_description:   value.item_description,
      invoice_no:         value.invoice_no || null,
      total_amount:       value.total_amount,
      deposit_amount:     value.deposit_amount,
      deposit_paid_at:    value.deposit_paid_at || null,
      balance_paid_at:    value.balance_paid_at || null,
      remittance_account: value.remittance_account || null,
      order_date:         value.order_date,
      cancelled:          value.cancelled,
      note:               value.note || null,
    };
    if (await hasExtrasColumns()) {
      payload.extra_expenses     = value.extra_expenses || [];
      payload.operating_fee_pct  = value.operating_fee_pct ?? 15;
      payload.public_fund_amount = value.public_fund_amount || 0;
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: { ...data, ...computeCostBreakdown(data), status: deriveStatus(data) } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    if (value.deposit_amount > value.total_amount) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '訂金不可超過總金額' } });
    }

    const payload = {
      supplier_id:        value.supplier_id,
      product_id:         value.product_id || null,
      item_description:   value.item_description,
      invoice_no:         value.invoice_no || null,
      total_amount:       value.total_amount,
      deposit_amount:     value.deposit_amount,
      deposit_paid_at:    value.deposit_paid_at || null,
      balance_paid_at:    value.balance_paid_at || null,
      remittance_account: value.remittance_account || null,
      order_date:         value.order_date,
      cancelled:          value.cancelled,
      note:               value.note || null,
    };
    if (await hasExtrasColumns()) {
      payload.extra_expenses     = value.extra_expenses || [];
      payload.operating_fee_pct  = value.operating_fee_pct ?? 15;
      payload.public_fund_amount = value.public_fund_amount || 0;
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定貨款記錄' } });
    res.json({ success: true, data: { ...data, ...computeCostBreakdown(data), status: deriveStatus(data) } });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, get, create, update, remove };
