const supabase = require('../config/database');
const Joi = require('joi');

const VALID_CATEGORIES = ['system', 'other'];

const schema = Joi.object({
  category:       Joi.string().valid(...VALID_CATEGORIES).default('other'),
  label:          Joi.string().trim().max(100).allow('', null).optional(),
  name:           Joi.string().trim().min(1).max(255).required(),
  vendor:         Joi.string().trim().max(255).allow('', null).optional(),
  amount:         Joi.number().positive().required(),
  expense_date:   Joi.string().isoDate().required(),
  recurring:      Joi.boolean().default(false),
  payment_method: Joi.string().trim().allow('', null).optional(),
  cancelled:      Joi.boolean().default(false),
  note:           Joi.string().trim().allow('', null).optional(),
});

function decorate(r) {
  return { ...r, kind: 'expense_record' };
}

async function list(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('expense_records')
      .select('*')
      .order('expense_date', { ascending: false })
      .order('created_at',   { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data.map(decorate) });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase.from('expense_records').insert({
      category:       value.category,
      label:          value.label || null,
      name:           value.name,
      vendor:         value.vendor || null,
      amount:         value.amount,
      expense_date:   value.expense_date,
      recurring:      value.recurring,
      payment_method: value.payment_method || null,
      cancelled:      value.cancelled,
      note:           value.note || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data: decorate(data) });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase.from('expense_records').update({
      category:       value.category,
      label:          value.label || null,
      name:           value.name,
      vendor:         value.vendor || null,
      amount:         value.amount,
      expense_date:   value.expense_date,
      recurring:      value.recurring,
      payment_method: value.payment_method || null,
      cancelled:      value.cancelled,
      note:           value.note || null,
    }).eq('id', id).select().single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定支出記錄' } });
    res.json({ success: true, data: decorate(data) });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('expense_records').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
