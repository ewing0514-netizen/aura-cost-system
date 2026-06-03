-- ================================================================
-- Migration: 現金收入記錄（業務合作、服務費等）
--   配合「現金財務記錄」頁面 — 追蹤收入面 + 支出面 + 合夥人分潤
--
-- 在 Supabase SQL Editor 執行此檔案（可重複執行）
-- ================================================================

CREATE TABLE IF NOT EXISTS income_records (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name       VARCHAR(255) NOT NULL,                                 -- 收入來源（客戶/案子）
  category          VARCHAR(50)  NOT NULL DEFAULT 'other',                 -- 'product_sales' / 'service' / 'consulting' / 'other'
  product_id        UUID REFERENCES products(id) ON DELETE SET NULL,       -- 對應產品（選填）
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  income_date       DATE NOT NULL DEFAULT CURRENT_DATE,                    -- 案子發生日
  received_at       DATE,                                                  -- NULL = 尚未入帳
  invoice_no        VARCHAR(100),
  payment_method    VARCHAR(50),                                           -- 'bank_transfer' / 'cash' / 'check' / 'other'
  partner_split_pct NUMERIC(5,2) NOT NULL DEFAULT 50
                    CHECK (partner_split_pct BETWEEN 0 AND 100),           -- 合夥人分潤百分比
  description       TEXT,
  cancelled         BOOLEAN NOT NULL DEFAULT FALSE,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_records_date     ON income_records(income_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_records_category ON income_records(category);

-- 自動更新 updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'income_records_updated_at'
  ) THEN
    CREATE TRIGGER income_records_updated_at
      BEFORE UPDATE ON income_records
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE  income_records IS '現金收入記錄（產品銷售/業務合作/顧問費等）';
COMMENT ON COLUMN income_records.partner_split_pct IS '合夥人分潤 % — 預設 50%，可逐筆調整';
