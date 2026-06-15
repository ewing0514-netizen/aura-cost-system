const supabase  = require('../config/database');
const Joi       = require('joi');
const cache     = require('../utils/cache');
const inventory = require('./inventoryController');

const LIST_CACHE_KEY     = 'products:list';
const LIST_TTL_MS        = 5 * 60_000; // 5 分鐘（寫入操作會主動清除，不必擔心過期）
const PRODUCT_CACHE_PFX  = 'products:item:';
const PRODUCT_TTL_MS     = 5 * 60_000; // 5 分鐘

const schema = Joi.object({
  name:         Joi.string().trim().min(1).max(255).required(),
  description:  Joi.string().trim().allow('', null).optional(),
  cover_image:  Joi.string().allow('', null).optional(),
  sku:          Joi.string().trim().max(100).allow('', null).optional(),
  safety_stock: Joi.number().integer().min(0).optional(),
});

async function list(req, res, next) {
  try {
    // 取得基礎產品列表（快取命中跳過 DB，但庫存永遠即時計算）
    let base = cache.get(LIST_CACHE_KEY);
    let cacheHit = !!base;

    if (!base) {
      // 注意：不選 cover_image（大型 TOAST 欄位），避免 DB 讀取延遲
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, description, is_active, created_at, safety_stock,
          cost_items(amount),
          price_tiers(id, is_active, price_type, amount)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      base = data.map(p => {
        const totalCost = p.cost_items.reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const activePriceTiers = p.price_tiers.filter(pt => pt.is_active);
        const normalTier = activePriceTiers.find(pt => pt.price_type === 'normal');
        return {
          id:           p.id,
          name:         p.name,
          description:  p.description,
          created_at:   p.created_at,
          total_cost:   totalCost,
          price_count:  activePriceTiers.length,
          normal_price: normalTier ? parseFloat(normalTier.amount) : null,
          safety_stock: parseInt(p.safety_stock) || 0,
        };
      });
      cache.set(LIST_CACHE_KEY, base, LIST_TTL_MS);
    }

    // 庫存即時疊加（不快取，因為進貨/出貨會隨時變動）
    const stockMap = await inventory.computeStockMap();
    const products = base.map(p => {
      const current = stockMap[p.id] || 0;
      const safety  = p.safety_stock || 0;
      let stockStatus = 'ok';
      if (current <= 0)           stockStatus = 'out';
      else if (current <= safety) stockStatus = 'low';
      return { ...p, current_stock: current, stock_status: stockStatus };
    });

    res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const { id } = req.params;

    // 快取命中（含 cover_image 的完整產品資料）
    const cacheKey = PRODUCT_CACHE_PFX + id;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, cover_image, sku, safety_stock, is_active, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
      throw error;
    }
    if (!data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
    cache.set(cacheKey, data, PRODUCT_TTL_MS);
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
        name:         value.name,
        description:  value.description || null,
        cover_image:  value.cover_image || null,
        sku:          value.sku || null,
        safety_stock: value.safety_stock ?? 0,
      })
      .select()
      .single();

    if (error) throw error;
    cache.del(LIST_CACHE_KEY); // 新增後清除列表快取
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
    // sku：明確傳入才更新（允許傳 null 來清除）
    if ('sku' in req.body) {
      payload.sku = value.sku || null;
    }
    // safety_stock：明確傳入才更新
    if ('safety_stock' in req.body) {
      payload.safety_stock = value.safety_stock ?? 0;
    }

    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
      throw error;
    }
    if (!data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
    cache.del(LIST_CACHE_KEY);               // 更新後清除列表快取
    cache.del(PRODUCT_CACHE_PFX + id);       // 清除個別產品快取
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
    cache.del(LIST_CACHE_KEY);           // 刪除後清除列表快取
    cache.del(PRODUCT_CACHE_PFX + id);  // 清除個別產品快取
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
      .select('name, description, cover_image, sku, safety_stock')
      .eq('id', id)
      .single();

    if (pErr || !original) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
    }

    // 建立新產品（名稱加上「（複製）」）
    const { data: newProduct, error: cErr } = await supabase
      .from('products')
      .insert({
        name:         original.name + '（複製）',
        description:  original.description || null,
        cover_image:  original.cover_image || null,
        sku:          original.sku ? original.sku + '-COPY' : null,
        safety_stock: original.safety_stock ?? 0,
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

    cache.del(LIST_CACHE_KEY); // 複製後清除列表快取
    res.status(201).json({ success: true, data: newProduct });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove, duplicate };
