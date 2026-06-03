-- ================================================================
-- Migration: KOL 分潤系統
--   kols              — 團主基本資料
--   kol_commissions   — 每筆團購的分潤紀錄
--
-- 在 Supabase SQL Editor 執行此檔案（可重複執行）
-- ================================================================

-- KOL 團主資料
CREATE TABLE IF NOT EXISTS kols (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   VARCHAR(255) NOT NULL,                                         -- 團主姓名
  contact_info           TEXT,                                                          -- 聯絡方式（電話/IG/Line 等）
  default_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 20
                         CHECK (default_commission_pct BETWEEN 0 AND 100),              -- 預設分潤 %
  bank_account           TEXT,                                                          -- 匯款帳號
  note                   TEXT,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kols_active ON kols(is_active);


-- KOL 團購分潤紀錄
CREATE TABLE IF NOT EXISTS kol_commissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kol_id          UUID REFERENCES kols(id) ON DELETE SET NULL,
  campaign_name   VARCHAR(255) NOT NULL,                            -- 團購名稱（例：【18個夏天限定團】）
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  product_label   VARCHAR(255),                                      -- 自由輸入商品名稱（無關聯產品時用）
  start_date      DATE NOT NULL,                                     -- 開始時間
  end_date        DATE,                                              -- 結束時間
  sales_amount    NUMERIC(12,2) NOT NULL DEFAULT 0
                  CHECK (sales_amount >= 0),                         -- 銷售金額
  commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 20
                  CHECK (commission_pct BETWEEN 0 AND 100),          -- 分潤 %
  paid            BOOLEAN NOT NULL DEFAULT FALSE,                    -- 是否已支付
  paid_at         DATE,                                              -- 支付日期
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kol_commissions_kol     ON kol_commissions(kol_id);
CREATE INDEX IF NOT EXISTS idx_kol_commissions_dates   ON kol_commissions(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_kol_commissions_paid    ON kol_commissions(paid);


-- 自動更新 updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kols_updated_at') THEN
    CREATE TRIGGER kols_updated_at
      BEFORE UPDATE ON kols
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kol_commissions_updated_at') THEN
    CREATE TRIGGER kol_commissions_updated_at
      BEFORE UPDATE ON kol_commissions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE  kols            IS 'KOL（團主）基本資料';
COMMENT ON TABLE  kol_commissions IS 'KOL 每場團購的分潤紀錄';
