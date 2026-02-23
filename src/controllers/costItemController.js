const supabase = require('../config/database');
const Joi = require('joi');

// 所有有效的成本子分類
const VALID_CATEGORIES = [
  // 產品成本
  'material', 'labor', 'packaging',
  // 營運成本
  'rent', 'utilities', 'equipment', 'fixed',
  // 行銷成本
  'advertising', 'platform_fee', 'shipping_cost',
  // 其他
  'other',
];

const schema = Joi.object({
  name:      Joi.string().trim().min(1).max(255).required(),
  amount:    Joi.number().min(0).required(),
  category:  Joi.string().valid(...VALID_CATEGORIES).required(),
  cost_type: Joi.string().valid('variable', 'fixed').default('variable'),
  note:      Joi.string().trim().allow('', null).optional(),
});

async function list(req, res, next) {
  try {
    const { productId } = req.params;
    const { data, error } = await supabase
      .from('cost_items')
      .select('id, name, amount, category, cost_type, note, created_at')
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
      .insert({
        product_id: productId,
        name:       value.name,
        amount:     value.amount,
        category:   value.category,
        cost_type:  value.cost_type || 'variable',
        note:       value.note || null,
      })
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
      .update({
        name:      value.name,
        amount:    value.amount,
        category:  value.category,
        cost_type: value.cost_type || 'variable',
        note:      value.note || null,
      })
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

// =====================================================
// 全域成本（product_id = null）—— 放在 Dashboard
// =====================================================

const GLOBAL_CATEGORIES = [
  'rent', 'utilities', 'equipment', 'fixed',
  'advertising', 'platform_fee', 'shipping_cost',
  'other',
];

const globalSchema = Joi.object({
  name:      Joi.string().trim().min(1).max(255).required(),
  amount:    Joi.number().min(0).required(),
  category:  Joi.string().valid(...GLOBAL_CATEGORIES).required(),
  cost_type: Joi.string().valid('variable', 'fixed').default('fixed'),
  note:      Joi.string().trim().allow('', null).optional(),
});

async function listGlobal(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('cost_items')
      .select('id, name, amount, category, cost_type, note, created_at')
      .is('product_id', null)
      .order('category')
      .order('created_at');
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function createGlobal(req, res, next) {
  try {
    const { error: valErr, value } = globalSchema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase
      .from('cost_items')
      .insert({
        product_id: null,
        name:       value.name,
        amount:     value.amount,
        category:   value.category,
        cost_type:  value.cost_type || 'fixed',
        note:       value.note || null,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

async function updateGlobal(req, res, next) {
  try {
    const { costId } = req.params;
    const { error: valErr, value } = globalSchema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase
      .from('cost_items')
      .update({
        name:      value.name,
        amount:    value.amount,
        category:  value.category,
        cost_type: value.cost_type || 'fixed',
        note:      value.note || null,
      })
      .eq('id', costId)
      .is('product_id', null)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定成本項目' } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function removeGlobal(req, res, next) {
  try {
    const { costId } = req.params;
    const { error } = await supabase
      .from('cost_items')
      .delete()
      .eq('id', costId)
      .is('product_id', null);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove, listGlobal, createGlobal, updateGlobal, removeGlobal };
