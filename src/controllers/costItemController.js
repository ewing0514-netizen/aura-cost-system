const supabase = require('../config/database');
const Joi = require('joi');

const VALID_CATEGORIES = ['material', 'labor', 'packaging', 'fixed', 'other'];

const schema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  amount: Joi.number().min(0).required(),
  category: Joi.string().valid(...VALID_CATEGORIES).required(),
  note: Joi.string().trim().allow('', null).optional(),
});

async function list(req, res, next) {
  try {
    const { productId } = req.params;
    const { data, error } = await supabase
      .from('cost_items')
      .select('id, name, amount, category, note, created_at')
      .eq('product_id', productId)
      .order('category')
      .order('created_at');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { productId } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('cost_items')
      .insert({ product_id: productId, ...value, note: value.note || null })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { productId, costId } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('cost_items')
      .update({ ...value, note: value.note || null })
      .eq('id', costId)
      .eq('product_id', productId)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定成本項目' } });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { productId, costId } = req.params;
    const { error } = await supabase
      .from('cost_items')
      .delete()
      .eq('id', costId)
      .eq('product_id', productId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
