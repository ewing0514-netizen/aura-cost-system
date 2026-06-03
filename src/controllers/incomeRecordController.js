const supabase = require('../config/database');
const Joi = require('joi');

const VALID_CATEGORIES = ['product_sales', 'service', 'consulting', 'other'];

const schema = Joi.object({
  source_name:       Joi.string().trim().min(1).max(255).required(),
  category:          Joi.string().valid(...VALID_CATEGORIES).default('other'),
  product_id:        Joi.string().uuid().allow('', null).optional(),
  amount:            Joi.number().positive().required(),
  income_date:       Joi.string().isoDate().required(),
  received_at:       Joi.string().isoDate().allow('', null).optional(),
  invoice_no:        Joi.string().trim().allow('', null).optional(),
  payment_method:    Joi.string().trim().allow('', null).optional(),
  partner_split_pct: Joi.number().min(0).max(100).default(50),
  description:       Joi.string().trim().allow('', null).optional(),
  cancelled:         Joi.boolean().default(false),
  note:              Joi.string().trim().allow('', null).optional(),
});

function deriveStatus(rec) {
  if (rec.cancelled)    return 'cancelled';
  if (!rec.received_at) return 'pending_income';   // 尚未入帳
  return 'received';                                // 已入帳
}

function decorate(rec) {
  const amount   = parseFloat(rec.amount || 0);
  const splitPct = parseFloat(rec.partner_split_pct ?? 50);
  return {
    ...rec,
    product_name:        rec.products?.name || null,
    products:            undefined,
    partner_share:       amount * splitPct / 100,
    self_share:          amount * (100 - splitPct) / 100,
    status:              deriveStatus(rec),
  };
}

async function list(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('income_records')
      .select('*, products(name)')
      .order('income_date',  { ascending: false })
      .order('created_at',   { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data.map(decorate) });
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('income_records')
      .select('*, products(name)')
      .eq('id', id)
      .single();
    if (error || !data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定收入記錄' } });
    }
    res.json({ success: true, data: decorate(data) });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('income_records')
      .insert({
        source_name:       value.source_name,
        category:          value.category,
        product_id:        value.product_id || null,
        amount:            value.amount,
        income_date:       value.income_date,
        received_at:       value.received_at || null,
        invoice_no:        value.invoice_no || null,
        payment_method:    value.payment_method || null,
        partner_split_pct: value.partner_split_pct,
        description:       value.description || null,
        cancelled:         value.cancelled,
        note:              value.note || null,
      })
      .select('*, products(name)')
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data: decorate(data) });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('income_records')
      .update({
        source_name:       value.source_name,
        category:          value.category,
        product_id:        value.product_id || null,
        amount:            value.amount,
        income_date:       value.income_date,
        received_at:       value.received_at || null,
        invoice_no:        value.invoice_no || null,
        payment_method:    value.payment_method || null,
        partner_split_pct: value.partner_split_pct,
        description:       value.description || null,
        cancelled:         value.cancelled,
        note:              value.note || null,
      })
      .eq('id', id)
      .select('*, products(name)')
      .single();
    if (error || !data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定收入記錄' } });
    }
    res.json({ success: true, data: decorate(data) });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('income_records').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, get, create, update, remove };
