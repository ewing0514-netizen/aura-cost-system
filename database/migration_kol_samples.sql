-- ================================================================
-- Migration: KOL 樣品寄送紀錄
--   每筆 = 一次寄送，可含多支產品；儲存後自動扣庫存（出貨、通路=樣品）
--   在 Supabase SQL Editor 執行（可重複執行）
-- ================================================================
CREATE TABLE IF NOT EXISTS kol_samples (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kol_id         UUID REFERENCES kols(id) ON DELETE SET NULL,  -- 名單內的 KOL（選填）
  recipient_name VARCHAR(255) NOT NULL,                        -- 收件 KOL 名稱（名單外也可填）
  items          JSONB NOT NULL DEFAULT '[]'::jsonb,           -- [{"product_id":"...","quantity":2}]
  sent_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  shipping_fee   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20) NOT NULL DEFAULT 'sent',          -- sent 已寄出 / posted 已發文 / campaign 已開團 / no_response 沒下文
  tracking_no    VARCHAR(100),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kol_samples_date ON kol_samples(sent_date DESC);
CREATE INDEX IF NOT EXISTS idx_kol_samples_kol  ON kol_samples(kol_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kol_samples_updated_at') THEN
    CREATE TRIGGER kol_samples_updated_at BEFORE UPDATE ON kol_samples
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
COMMENT ON TABLE kol_samples IS 'KOL 樣品寄送紀錄；儲存時同步 inventory_movements（ref_type=kol_sample）';
