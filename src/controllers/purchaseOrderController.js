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
});

// 衍生狀態
function deriveStatus(order) {
  if (order.cancelled) return 'cancelled';
  if (!order.deposit_paid_at) return 'pending';
  if (!order.balance_paid_at) return 'deposit_paid';
  return 'completed';
}

async function list(req, res, next) {
  try {
    const { status } = req.query;

    let query = supabase
      .from('purchase_orders')
      .select(`
        id, supplier_id, product_id, item_description, invoice_no,
        total_amount, deposit_amount, deposit_paid_at, balance_paid_at,
        remittance_account, order_date, cancelled, note, created_at,
        suppliers(name),
        products(name)
      `)
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    let rows = data.map(r => ({
      ...r,
      supplier_name: r.suppliers?.name || '',
      product_name:  r.products?.name  || null,
      balance_amount: parseFloat(r.total_amount) - parseFloat(r.deposit_amount),
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
      .select(`
        id, supplier_id, product_id, item_description, invoice_no,
        total_amount, deposit_amount, deposit_paid_at, balance_paid_at,
        remittance_account, order_date, cancelled, note, created_at,
        suppliers(name, bank_account),
        products(name)
      `)
      .eq('id', id)
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定貨款記錄' } });

    const row = {
      ...data,
      supplier_name:    data.suppliers?.name         || '',
      supplier_account: data.suppliers?.bank_account || '',
      product_name:     data.products?.name          || null,
      balance_amount:   parseFloat(data.total_amount) - parseFloat(data.deposit_amount),
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

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
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
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: { ...data, balance_amount: parseFloat(data.total_amount) - parseFloat(data.deposit_amount), status: deriveStatus(data) } });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('purchase_orders')
      .update({
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
      })
      .eq('id', id)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定貨款記錄' } });
    res.json({ success: true, data: { ...data, balance_amount: parseFloat(data.total_amount) - parseFloat(data.deposit_amount), status: deriveStatus(data) } });
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
