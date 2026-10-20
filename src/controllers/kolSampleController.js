const supabase  = require('../config/database');
const Joi       = require('joi');
const inventory = require('./inventoryController');

const STATUSES = ['sent', 'posted', 'campaign', 'no_response'];

const schema = Joi.object({
  kol_id:         Joi.string().uuid().allow('', null).optional(),
  recipient_name: Joi.string().trim().min(1).max(255).required(),
  items: Joi.array().items(Joi.object({
    product_id: Joi.string().uuid().required(),
    quantity:   Joi.number().integer().min(1).required(),
  })).min(1).required(),
  sent_date:      Joi.string().isoDate().required(),
  shipping_fee:   Joi.number().min(0).default(0),
  status:         Joi.string().valid(...STATUSES).default('sent'),
  tracking_no:    Joi.string().trim().max(100).allow('', null).optional(),
  note:           Joi.string().trim().allow('', null).optional(),
});

// 每個產品的單位成本（成本項目加總）與名稱
async function productInfo() {
  const { data, error } = await supabase.from('products').select('id, name, cost_items(amount)');
  if (error) throw error;
  const map = {};
  for (const p of data) {
    map[p.id] = { name: p.name, unit_cost: (p.cost_items || []).reduce((s, c) => s + parseFloat(c.amount || 0), 0) };
  }
  return map;
}

function decorate(r, info) {
  const items = (r.items || []).map(it => {
    const p = info[it.product_id] || {};
    return { ...it, product_name: p.name || '（已刪除產品）', unit_cost: p.unit_cost || 0 };
  });
  const units      = items.reduce((s, it) => s + (parseInt(it.quantity) || 0), 0);
  const goods_cost = items.reduce((s, it) => s + (parseInt(it.quantity) || 0) * it.unit_cost, 0);
  const fee        = parseFloat(r.shipping_fee || 0);
  return { ...r, kol_name: r.kols?.name || null, items, units, goods_cost, total_cost: goods_cost + fee };
}

// 寄樣品 = 出貨（通路：樣品），依寄送日扣庫存
async function syncStock(r, info) {
  await inventory.syncRefMovements('kol_sample', r.id, (r.items || []).map(it => ({
    product_id:    it.product_id,
    type:          'out',
    channel:       'sample',
    quantity:      -Math.abs(parseInt(it.quantity) || 0),
    movement_date: r.sent_date,
    note:          `寄樣品給 ${r.recipient_name}`,
  })));
}

function payload(v) {
  return {
    kol_id:         v.kol_id || null,
    recipient_name: v.recipient_name,
    items:          v.items.map(it => ({ product_id: it.product_id, quantity: it.quantity })),
    sent_date:      v.sent_date,
    shipping_fee:   v.shipping_fee,
    status:         v.status,
    tracking_no:    v.tracking_no || null,
    note:           v.note || null,
  };
}

async function list(req, res, next) {
  try {
    const [{ data, error }, info] = await Promise.all([
      supabase.from('kol_samples').select('*, kols(name)')
        .order('sent_date', { ascending: false }).order('created_at', { ascending: false }),
      productInfo(),
    ]);
    if (error) throw error;
    res.json({ success: true, data: data.map(r => decorate(r, info)) });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase.from('kol_samples').insert(payload(value)).select('*, kols(name)').single();
    if (error) throw error;
    await syncStock(data);
    res.status(201).json({ success: true, data: decorate(data, await productInfo()) });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { error: valErr, value } = schema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase.from('kol_samples').update(payload(value))
      .eq('id', req.params.id).select('*, kols(name)').single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到這筆樣品紀錄' } });
    await syncStock(data);
    res.json({ success: true, data: decorate(data, await productInfo()) });
  } catch (err) { next(err); }
}

// 只改狀態（列表上快速切換用）
async function setStatus(req, res, next) {
  try {
    const status = req.body?.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '狀態不正確' } });
    const { error } = await supabase.from('kol_samples').update({ status }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await inventory.removeRefMovements('kol_sample', req.params.id);
    const { error } = await supabase.from('kol_samples').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, setStatus, remove };
