const supabase = require('../config/database');
const Joi = require('joi');

const schema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().trim().allow('', null).optional(),
});

async function list(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, description, is_active, created_at,
        cost_items(amount),
        price_tiers(id, is_active)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const products = data.map(p => {
      const totalCost = p.cost_items.reduce((sum, c) => sum + parseFloat(c.amount), 0);
      const activePriceCount = p.price_tiers.filter(pt => pt.is_active).length;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        created_at: p.created_at,
        total_cost: totalCost,
        price_count: activePriceCount,
      };
    });

    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, is_active, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('products')
      .insert({ name: value.name, description: value.description || null })
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
    const { id } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const { data, error } = await supabase
      .from('products')
      .update({ name: value.name, description: value.description || null })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };
