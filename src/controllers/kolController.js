const supabase = require('../config/database');
const Joi = require('joi');

// ===== KOL（團主）管理 =====
const kolSchema = Joi.object({
  name:                   Joi.string().trim().min(1).max(255).required(),
  contact_info:           Joi.string().trim().allow('', null).optional(),
  default_commission_pct: Joi.number().min(0).max(100).default(20),
  bank_account:           Joi.string().trim().allow('', null).optional(),
  note:                   Joi.string().trim().allow('', null).optional(),
  is_active:              Joi.boolean().default(true),
});

async function listKols(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('kols')
      .select('*')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function createKol(req, res, next) {
  try {
    const { error: valErr, value } = kolSchema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase.from('kols').insert({
      name:                   value.name,
      contact_info:           value.contact_info || null,
      default_commission_pct: value.default_commission_pct,
      bank_account:           value.bank_account || null,
      note:                   value.note || null,
      is_active:              value.is_active,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

async function updateKol(req, res, next) {
  try {
    const { id } = req.params;
    const { error: valErr, value } = kolSchema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase.from('kols').update({
      name:                   value.name,
      contact_info:           value.contact_info || null,
      default_commission_pct: value.default_commission_pct,
      bank_account:           value.bank_account || null,
      note:                   value.note || null,
      is_active:              value.is_active,
    }).eq('id', id).select().single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定 KOL' } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function removeKol(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('kols').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ===== KOL 分潤紀錄 =====
const commissionSchema = Joi.object({
  kol_id:         Joi.string().uuid().allow('', null).optional(),
  campaign_name:  Joi.string().trim().min(1).max(255).required(),
  product_id:     Joi.string().uuid().allow('', null).optional(),
  product_label:  Joi.string().trim().allow('', null).optional(),
  start_date:     Joi.string().isoDate().required(),
  end_date:       Joi.string().isoDate().allow('', null).optional(),
  sales_amount:   Joi.number().min(0).default(0),
  commission_pct: Joi.number().min(0).max(100).default(20),
  paid:           Joi.boolean().default(false),
  paid_at:        Joi.string().isoDate().allow('', null).optional(),
  note:           Joi.string().trim().allow('', null).optional(),
});

function decorateCommission(c) {
  const sales = parseFloat(c.sales_amount || 0);
  const pct   = parseFloat(c.commission_pct || 0);
  return {
    ...c,
    kol_name:           c.kols?.name || null,
    kol_bank_account:   c.kols?.bank_account || null,
    kols:               undefined,
    product_name:       c.products?.name || null,
    products:           undefined,
    commission_amount:  sales * pct / 100,
  };
}

async function listCommissions(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('kol_commissions')
      .select('*, kols(name, bank_account), products(name)')
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data.map(decorateCommission) });
  } catch (err) { next(err); }
}

async function getCommission(req, res, next) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('kol_commissions')
      .select('*, kols(name, bank_account), products(name)')
      .eq('id', id).single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定分潤紀錄' } });
    res.json({ success: true, data: decorateCommission(data) });
  } catch (err) { next(err); }
}

async function createCommission(req, res, next) {
  try {
    const { error: valErr, value } = commissionSchema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase.from('kol_commissions').insert({
      kol_id:         value.kol_id || null,
      campaign_name:  value.campaign_name,
      product_id:     value.product_id || null,
      product_label:  value.product_label || null,
      start_date:     value.start_date,
      end_date:       value.end_date || null,
      sales_amount:   value.sales_amount,
      commission_pct: value.commission_pct,
      paid:           value.paid,
      paid_at:        value.paid_at || null,
      note:           value.note || null,
    }).select('*, kols(name, bank_account), products(name)').single();
    if (error) throw error;
    res.status(201).json({ success: true, data: decorateCommission(data) });
  } catch (err) { next(err); }
}

async function updateCommission(req, res, next) {
  try {
    const { id } = req.params;
    const { error: valErr, value } = commissionSchema.validate(req.body);
    if (valErr) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: valErr.message } });
    const { data, error } = await supabase.from('kol_commissions').update({
      kol_id:         value.kol_id || null,
      campaign_name:  value.campaign_name,
      product_id:     value.product_id || null,
      product_label:  value.product_label || null,
      start_date:     value.start_date,
      end_date:       value.end_date || null,
      sales_amount:   value.sales_amount,
      commission_pct: value.commission_pct,
      paid:           value.paid,
      paid_at:        value.paid_at || null,
      note:           value.note || null,
    }).eq('id', id).select('*, kols(name, bank_account), products(name)').single();
    if (error || !data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定分潤紀錄' } });
    res.json({ success: true, data: decorateCommission(data) });
  } catch (err) { next(err); }
}

async function removeCommission(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('kol_commissions').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
}

module.exports = {
  // KOLs
  listKols, createKol, updateKol, removeKol,
  // Commissions
  listCommissions, getCommission, createCommission, updateCommission, removeCommission,
};
