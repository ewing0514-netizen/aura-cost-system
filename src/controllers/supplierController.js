const supabase = require('../config/database');
const Joi = require('joi');

const schema = Joi.object({
  name:         Joi.string().trim().min(1).max(255).required(),
  contact_info: Joi.string().trim().allow('', null).optional(),
  bank_account: Joi.string().trim().allow('', null).optional(),
  note:         Joi.string().trim().allow('', null).optional(),
});

async function list(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, contact_info, bank_account, note, created_at')
      .order('name');
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        name:         value.name,
        contact_info: value.contact_info || null,
        bank_account: value.bank_account || null,
        note:         value.note || null,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('suppliers')
      .update({
        name:         value.name,
        contact_info: value.contact_info || null,
        bank_account: value.bank_account || null,
        note:         value.note || null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定供應商' } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;

    // 確認無關聯採購訂單
    const { count, error: cErr } = await supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', id);
    if (cErr) throw cErr;
    if (count > 0) return res.status(409).json({ success: false, error: { code: 'HAS_ORDERS', message: `此供應商還有 ${count} 筆貨款記錄，無法刪除` } });

    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
