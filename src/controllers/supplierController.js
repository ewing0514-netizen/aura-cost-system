const supabase  = require('../config/database');
const Joi       = require('joi');
const Anthropic = require('@anthropic-ai/sdk');
const multer    = require('multer');

// ── multer：記憶體儲存，限制 10MB，僅接受圖片與 PDF ──
const ALLOWED_TYPES = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ALLOWED_TYPES.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('不支援的檔案格式，請上傳圖片（JPG/PNG/WebP）或 PDF'));
  },
});

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

// ── AI 提取供應商資訊 ──
async function extractInfo(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: '請上傳截圖或 PDF 檔案' } });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ success: false, error: { code: 'NO_API_KEY', message: '伺服器尚未設定 ANTHROPIC_API_KEY，無法使用 AI 提取功能' } });
    }

    const file      = req.file;
    const base64    = file.buffer.toString('base64');
    const isPDF     = file.mimetype === 'application/pdf';

    const fileBlock = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image',    source: { type: 'base64', media_type: file.mimetype,     data: base64 } };

    const prompt = `請從以下${isPDF ? '文件' : '截圖'}中提取供應商的公司資訊。
只回傳一個 JSON 物件，格式如下（找不到的欄位填 null）：
{"name":"公司或供應商名稱","contact_info":"聯絡方式（電話/LINE/Email）","bank_account":"銀行帳號或匯款帳號"}
不要包含任何說明文字、Markdown 語法或程式碼區塊，只回傳純 JSON。`;

    const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 512,
      messages:   [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }],
    });

    const raw  = response.content[0]?.text || '';
    // 去除可能的 markdown 程式碼區塊
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(json);
    } catch {
      return res.status(422).json({ success: false, error: { code: 'PARSE_ERROR', message: '無法解析 AI 回覆，請稍後再試' } });
    }

    res.json({ success: true, data: {
      name:         extracted.name         || null,
      contact_info: extracted.contact_info || null,
      bank_account: extracted.bank_account || null,
    }});
  } catch (err) { next(err); }
}

// 暴露 multer middleware 供路由使用
extractInfo.upload = upload.single('file');

module.exports = { list, create, update, remove, extractInfo };
