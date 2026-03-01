const supabase = require('../config/database');
const Joi = require('joi');

const schema = Joi.object({
  name:        Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().trim().allow('', null).optional(),
  cover_image: Joi.string().allow('', null).optional(),
});

async function list(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, description, cover_image, is_active, created_at,
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
        id:          p.id,
        name:        p.name,
        description: p.description,
        cover_image: p.cover_image,
        created_at:  p.created_at,
        total_cost:  totalCost,
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
      .select('id, name, description, cover_image, is_active, created_at, updated_at')
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
      .insert({
        name:        value.name,
        description: value.description || null,
        cover_image: value.cover_image || null,
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
    const { id } = req.params;
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });

    const payload = {
      name:        value.name,
      description: value.description || null,
    };
    // 只有明確傳入 cover_image 才更新（允許傳 null 來移除圖片）
    if ('cover_image' in req.body) {
      payload.cover_image = value.cover_image || null;
    }

    const { data, error } = await supabase
      .from('products')
      .update(payload)
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

async function duplicate(req, res, next) {
  try {
    const { id } = req.params;

    // 取得原始產品
    const { data: original, error: pErr } = await supabase
      .from('products')
      .select('name, description, cover_image')
      .eq('id', id)
      .single();

    if (pErr || !original) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
    }

    // 建立新產品（名稱加上「（複製）」）
    const { data: newProduct, error: cErr } = await supabase
      .from('products')
      .insert({
        name:        original.name + '（複製）',
        description: original.description || null,
        cover_image: original.cover_image || null,
      })
      .select()
      .single();

    if (cErr) throw cErr;

    // 複製成本項目
    const { data: costs, error: costsErr } = await supabase
      .from('cost_items')
      .select('name, amount, category, cost_type, note')
      .eq('product_id', id);

    if (costsErr) throw costsErr;

    if (costs.length > 0) {
      const { error: ciErr } = await supabase
        .from('cost_items')
        .insert(costs.map(c => ({
          product_id: newProduct.id,
          name:       c.name,
          amount:     c.amount,
          category:   c.category,
          cost_type:  c.cost_type,
          note:       c.note || null,
        })));
      if (ciErr) throw ciErr;
    }

    // 複製售價方案
    const { data: prices, error: pricesErr } = await supabase
      .from('price_tiers')
      .select('name, price_type, amount, is_active, note')
      .eq('product_id', id);

    if (pricesErr) throw pricesErr;

    if (prices.length > 0) {
      const { error: ptErr } = await supabase
        .from('price_tiers')
        .insert(prices.map(pt => ({
          product_id: newProduct.id,
          name:       pt.name,
          price_type: pt.price_type,
          amount:     pt.amount,
          is_active:  pt.is_active,
          note:       pt.note || null,
        })));
      if (ptErr) throw ptErr;
    }

    res.status(201).json({ success: true, data: newProduct });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove, duplicate };
